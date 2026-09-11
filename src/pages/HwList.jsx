import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Edit2, X, Server, User, MapPin, MoreHorizontal, Trash2, ShoppingBag, AlertTriangle, CheckCircle, Save, Monitor, Settings, ShieldAlert, Archive, RotateCcw, Cpu, Send, History, Building2, Info, RefreshCw } from 'lucide-react';
import ItemLedgerModal from '../components/ItemLedgerModal';
import HwRegistrationModal from '../components/HwRegistrationModal';
import RmaReplacementModal from '../components/RmaReplacementModal';
import { logUpdate, logDelete, logStatusChange } from '../utils/auditLogger';
import { usePageSize } from '../utils/usePageSize';
import PageSizeSelector from '../components/common/PageSizeSelector';
import { isItemRetired, getItemAggregationKey, aggregateCards, computeNewRetiredKeys } from '../utils/cardAggregation';

const HwList = ({ isSplitMode = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const filterType = queryParams.get('type');

  const [nics, setNics] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [showServerDetails, setShowServerDetails] = useState(true);
  const [ledgerItem, setLedgerItem] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [rmaAsset, setRmaAsset] = useState(null);

  const [selectedCardKey, setSelectedCardKey] = useState(null);
  const [aggregationMode, setAggregationMode] = useState(() => {
    return localStorage.getItem('hw_aggregation_mode') || 'SPEC';
  });
  const [retiredKeys, setRetiredKeys] = useState(() => {
    const saved = localStorage.getItem('hw_list_retired_keys');
    return saved ? JSON.parse(saved) : [];
  });

  // 當側邊欄分類變動時，清除搜尋關鍵字與選取卡片
  useEffect(() => {
    setSearchTerm('');
    setSelectedCardKey(null);
    setActiveMenuId(null);
    setMenuPosition(null);
  }, [filterType]);

  // 監聽外部點擊與視窗滾動以關閉選單
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (activeMenuId && !e.target.closest('.dropdown-action-menu') && !e.target.closest('.action-menu-btn')) {
        setActiveMenuId(null);
        setMenuPosition(null);
      }
    };
    const handleScroll = () => {
      if (activeMenuId) {
        setActiveMenuId(null);
        setMenuPosition(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [activeMenuId]);

  const [showSyncConfig, setShowSyncConfig] = useState(false);
  const [availableFieldDefs, setAvailableFieldDefs] = useState([]);
  const [selectedSyncFields, setSelectedSyncFields] = useState(['hostname', 'os']);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ show: false, msg: '', onConfirm: null });

  const loadData = useCallback(async () => {
    // 根據是否有 filterType 決定呼叫的查詢
    let nicsRes;
    if (filterType) {
      nicsRes = await window.electronAPI.namedQuery('fetchNicListByType', [filterType]);
    } else {
      nicsRes = await window.electronAPI.namedQuery('fetchNicList');
    }
    
    if (nicsRes.success) {
      const formatted = (nicsRes.rows || []).map(row => {
        let customAttrs = {};
        try {
          customAttrs = typeof row.custom_attributes === 'string'
            ? JSON.parse(row.custom_attributes)
            : (row.custom_attributes || {});
        } catch {
          customAttrs = {};
        }
        const serverSn = row.server_sn || customAttrs.server_sn || '';
        return {
          ...row,
          custom_attributes: {
            ...customAttrs,
            server_sn: serverSn
          },
          server_sn: serverSn
        };
      });
      setNics(formatted);
    }

    // 抓取系統設定
    const defsRes = await window.electronAPI.namedQuery('getSystemSetting', ['customFieldDefinitions']);
    if (defsRes.success && defsRes.rows.length > 0) {
      setAvailableFieldDefs(defsRes.rows[0].value || []);
    }

    const prefRes = await window.electronAPI.namedQuery('getSystemSetting', ['nicSyncFieldPreference']);
    if (prefRes.success && prefRes.rows.length > 0) {
      setSelectedSyncFields(prefRes.rows[0].value || ['hostname', 'os']);
    }

    const custRes = await window.electronAPI.namedQuery('fetchCustomers');
    if (custRes.success) {
      setCustomers(custRes.rows.map(r => r.name));
    }

    const projRes = await window.electronAPI.namedQuery('fetchActiveProjects');
    if (projRes.success) {
      setProjects(projRes.rows);
    }
  }, [filterType]);

  useEffect(() => {
    loadData();

    const handleDbUpdate = () => { loadData(); };
    window.addEventListener('db-update', handleDbUpdate);

    return () => {
      window.removeEventListener('db-update', handleDbUpdate);
    };
  }, [loadData]);

  const handleEdit = (nic) => {
    let shipDateStr = '';
    if (nic.shipping_date) {
      try { shipDateStr = new Date(nic.shipping_date).toISOString().split('T')[0]; } catch { shipDateStr = ''; }
    }
    setEditItem({
      ...nic,
      _origModel: nic.model || '',
      _origSpec: nic.specification || '',
      ownership: nic.ownership || 'FOR_SALE',
      shipping_date: shipDateStr,
      temp_server_sn: nic.server_sn || nic.custom_attributes?.server_sn || '',
      temp_order_source: nic.custom_attributes?.order_source !== undefined ? nic.custom_attributes?.order_source : (nic.custom_attributes?.order_date || ''),
      temp_project_name: nic.custom_attributes?.project_name || '',
      temp_end_user: nic.end_user || nic.custom_attributes?.end_user || nic.server_end_user || ''
    });
    setShowEditModal(true);
    setActiveMenuId(null);
  };

  const handleUpdateOwnership = async (id, sn, newOwnership, label) => {
    if (!confirm(`確定要將硬體 [${sn || id}] 的資產歸屬變更為「${label}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('updateAssetOwnership', [newOwnership, id]);
    if (res.success) {
      logUpdate('HARDWARE', sn || id, '硬體零組件', `變更硬體資產歸屬為「${label}」`, { id, sn, newOwnership, label });
      window.dispatchEvent(new CustomEvent('db-update'));
      setActiveMenuId(null);
    } else {
      alert('變更資產歸屬失敗：' + (res.error || '未知錯誤'));
    }
  };

  const handleSave = async () => {
    if (!editItem) return;

    const newModel = (editItem.model || '').trim();
    const newSpec = (editItem.specification || '').trim();

    if (!newModel) {
      alert('請輸入型號 (Model)！');
      return;
    }

    const isModelOrSpecChanged = (newModel !== (editItem._origModel || '')) || (newSpec !== (editItem._origSpec || ''));
    if (isModelOrSpecChanged) {
      let targetMasterId = null;
      const findRes = await window.electronAPI.namedQuery('findItemMaster', [
        newSpec,
        editItem.type || '',
        editItem.brand || '',
        newModel
      ]);

      if (findRes.success && findRes.rows?.length > 0) {
        targetMasterId = findRes.rows[0].id;
      } else {
        const countRes = await window.electronAPI.namedQuery('countAssetsByMasterId', [editItem.item_master_id]);
        const refCount = (countRes.success && countRes.rows?.[0]) ? parseInt(countRes.rows[0].count, 10) : 99;

        if (refCount <= 1) {
          await window.electronAPI.namedQuery('updateItemMasterSpecs', [newSpec, newModel, editItem.item_master_id]);
          targetMasterId = editItem.item_master_id;
        } else {
          const createRes = await window.electronAPI.namedQuery('insertItemMaster', [
            newSpec,
            editItem.type || '',
            editItem.brand || '',
            newModel,
            '個',
            '硬體'
          ]);
          if (createRes.success && createRes.rows?.length > 0) {
            targetMasterId = createRes.rows[0].id;
          }
        }
      }

      if (targetMasterId && targetMasterId !== editItem.item_master_id) {
        await window.electronAPI.namedQuery('updateAssetMasterId', [targetMasterId, editItem.id]);
        if (editItem.item_master_id) {
          await window.electronAPI.namedQuery('deleteItemMasterIfOrphan', [editItem.item_master_id]);
        }
      }

      await window.electronAPI.namedQuery('insertDeviceModel', [editItem.brand, newModel, '硬體']);
    }

    // 更新資產明細
    const res = await window.electronAPI.namedQuery('updateNicDetails', [
      editItem.sn ? editItem.sn.trim() : null,
      editItem.client || null,
      editItem.location || null,
      editItem.temp_server_sn ? editItem.temp_server_sn.trim() : null,
      editItem.temp_order_source !== undefined ? editItem.temp_order_source : null,
      editItem.hostname || null,
      parseInt(editItem.id, 10),
      editItem.temp_project_name || null,
      editItem.ownership || 'FOR_SALE',
      editItem.temp_end_user !== undefined ? editItem.temp_end_user : (editItem.end_user || editItem.custom_attributes?.end_user || null)
    ]);
    if (res.success) { 
      // 雙向連動設備端的 mounted_hw_sns
      const origServerSn = (editItem.server_sn || '').trim();
      const newServerSn = (editItem.temp_server_sn || '').trim();
      const currentHwSn = (editItem.sn || '').trim();

      if (currentHwSn && origServerSn !== newServerSn) {
        if (origServerSn) {
          try {
            await window.electronAPI.namedQuery('removeMountedHwSnFromDevice', [origServerSn, currentHwSn]);
          } catch (e) {
            console.error('removeMountedHwSnFromDevice error:', e);
          }
        }
        if (newServerSn) {
          try {
            await window.electronAPI.namedQuery('appendMountedHwSnToDevice', [newServerSn, currentHwSn]);
          } catch (e) {
            console.error('appendMountedHwSnToDevice error:', e);
          }
        }
      }

      try {
        await window.electronAPI.namedQuery('updateAssetShippingDate', [editItem.shipping_date || null, parseInt(editItem.id, 10)]);
      } catch (err) {
        console.error('Failed to update hardware shipping_date:', err);
      }
      logUpdate('HARDWARE', editItem.sn || editItem.id, `${editItem.brand || ''} ${editItem.model || ''}`, `編輯硬體詳細資訊 [${editItem.sn || editItem.id}]`, {
        sn: editItem.sn,
        client: editItem.client,
        end_user: editItem.temp_end_user,
        location: editItem.location,
        ownership: editItem.ownership,
        server_sn: editItem.temp_server_sn,
        project_name: editItem.temp_project_name,
        order_source: editItem.temp_order_source,
        shipping_date: editItem.shipping_date
      });
      setShowEditModal(false); 
      window.dispatchEvent(new CustomEvent('db-update'));
    }
    else alert('儲存失敗：' + res.error);
  };

  const handleSaveSyncPreference = async () => {
    const res = await window.electronAPI.namedQuery('upsertSystemSetting', ['nicSyncFieldPreference', selectedSyncFields]);
    if (res.success) { alert('同步設定已儲存！'); setShowSyncConfig(false); }
  };

  const toggleSyncField = (fieldId) => {
    if (selectedSyncFields.includes(fieldId)) setSelectedSyncFields(selectedSyncFields.filter(id => id !== fieldId));
    else setSelectedSyncFields([...selectedSyncFields, fieldId]);
  };

  const handleUpdateStatus = async (id, sn, newStatus, label) => {
    if (!confirm(`確定變更狀態為 [${label}] 嗎？`)) return;
    await window.electronAPI.namedQuery('updateAssetStatus', [newStatus, id]);
    logStatusChange('HARDWARE', sn || id, '硬體零組件', '舊狀態', newStatus, `變更硬體 [${sn || id}] 狀態為「${label}」`, { id, sn, newStatus, label });
    window.dispatchEvent(new CustomEvent('db-update'));
    setActiveMenuId(null);
  };

  const handleDelete = async (nic) => {
    const displayName = `${nic.brand} - ${nic.model} [${nic.sn || '未設定序號'}]`;
    if (!confirm(`確定要刪除硬體 [${displayName}] 嗎？`)) return;
    await window.electronAPI.namedQuery('deleteAsset', [nic.id]);
    logDelete('HARDWARE', nic.sn || nic.id, `${nic.brand} ${nic.model}`, `刪除硬體紀錄 [${nic.sn || nic.id}]`, { id: nic.id, sn: nic.sn, brand: nic.brand, model: nic.model });
    window.dispatchEvent(new CustomEvent('db-update'));
    setActiveMenuId(null);
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case 'SHIPPED': return { label: '已出貨', color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.3)' };
      case 'LENT': return { label: '借出/借用', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.3)' };
      case 'REPAIR': return { label: '故障', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' };
      case 'SCRAPPED': return { label: '已報廢', color: 'var(--text-subtle)', bgColor: 'rgba(100, 116, 139, 0.15)', borderColor: 'rgba(100, 116, 139, 0.3)' };
      default: return { label: '在庫', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' };
    }
  };

  const containerStyle = {
    padding: isSplitMode ? '0' : 'var(--content-padding, 16px 20px)',
    backgroundColor: isSplitMode ? 'transparent' : 'var(--bg-app)',
    minHeight: isSplitMode ? 'auto' : '100%'
  };
  const cardStyle = { 
    backgroundColor: 'var(--bg-surface)', 
    borderRadius: 'var(--card-radius, 14px)', 
    padding: 'var(--card-padding, 16px 20px)', 
    boxShadow: 'var(--card-shadow)', 
    border: '1px solid var(--border-color)', 
    color: 'var(--text-main)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: isSplitMode ? 'auto' : 'calc(100vh - var(--topbar-height, 56px) - 40px)'
  };
  const thStyle = { 
    textAlign: 'left', 
    padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', 
    borderBottom: '2px solid var(--border-color)', 
    color: 'var(--table-header-text)', 
    fontSize: '12px', 
    fontWeight: '900', 
    position: 'sticky',
    top: 0,
    zIndex: 4,
    backgroundColor: 'var(--table-header-bg)',
    boxShadow: '0 1px 0 var(--border-color)',
    whiteSpace: 'nowrap'
  };
  const tdStyle = { 
    padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', 
    borderBottom: '1px solid var(--table-border)', 
    fontSize: '12px', 
    color: 'var(--text-main)' 
  };
  const navBtnStyle = { padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '700', fontSize: '12px' };
  const menuButtonStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderRadius: '8px', textAlign: 'left' };
  const editLabelStyle = { display: 'block', fontWeight: 800, fontSize: '13px', marginBottom: '6px', color: 'var(--text-muted)' };
  const editInputStyle = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '13px' };

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePageSize('hw_list', 10);

  const statusPriority = { 'REPAIR': 1, 'LENT': 2, 'ACTIVE': 3, 'SHIPPED': 4, 'SCRAPPED': 5 };

  const filteredNics = nics
    .filter(n => {
      if (selectedCardKey) {
        const isTargetRetired = selectedCardKey.endsWith(':::RETIRED');
        const targetKey = isTargetRetired ? selectedCardKey.replace(':::RETIRED', '') : selectedCardKey;
        const itemKey = getItemAggregationKey(n, aggregationMode);
        const itemRetired = isItemRetired(n, retiredKeys);
        if (itemKey !== targetKey || itemRetired !== isTargetRetired) return false;
      }
      const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(t => t);
      if (searchTerms.length === 0) return true;
      return searchTerms.every(term => 
        (n.sn || '').toLowerCase().includes(term) ||
        (n.brand || '').toLowerCase().includes(term) ||
        (n.model || '').toLowerCase().includes(term) ||
        (n.specification || '').toLowerCase().includes(term) ||
        (n.client || n.server_client || '').toLowerCase().includes(term) ||
        (n.end_user || n.custom_attributes?.end_user || n.server_end_user || '').toLowerCase().includes(term) ||
        (n.custom_attributes?.order_source || '').toLowerCase().includes(term) ||
        (n.server_sn || n.custom_attributes?.server_sn || '').toLowerCase().includes(term)
      );
    })
    .sort((a, b) => (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99));

  const totalPages = Math.ceil(filteredNics.length / itemsPerPage);
  const paginatedNics = filteredNics.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const [layoutMap, setLayoutMap] = useState(() => {
    const saved = localStorage.getItem('hw_list_layout_map');
    return saved ? JSON.parse(saved) : {};
  });

  const handleAggregationModeChange = (mode) => {
    setAggregationMode(mode);
    localStorage.setItem('hw_aggregation_mode', mode);
    setSearchTerm('');
    setSelectedCardKey(null);
  };

  // 當搜尋或類型變動時，回到第一頁
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType]);
  const [draggingCardKey, setDraggingCardKey] = useState(null);

  const handleSlotDragOver = (e) => { e.preventDefault(); };
  const handleCardDragStart = (e, key) => { setDraggingCardKey(key); e.dataTransfer.setData('text/plain', key); };
  const handleDropOnSlot = (e, targetSlotIdx) => {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/plain');
    const newMap = { ...layoutMap };
    const oldSlotIdx = Object.keys(newMap).find(k => newMap[k] === key);
    if (oldSlotIdx !== undefined) delete newMap[oldSlotIdx];
    if (newMap[targetSlotIdx]) { if (oldSlotIdx !== undefined) newMap[oldSlotIdx] = newMap[targetSlotIdx]; }
    newMap[targetSlotIdx] = key;
    setLayoutMap(newMap);
    localStorage.setItem('hw_list_layout_map', JSON.stringify(newMap));
    setDraggingCardKey(null);
  };

  const toggleRetire = (e, key, isRetiredParam) => {
    e.stopPropagation();
    const isRetired = isRetiredParam !== undefined ? isRetiredParam : retiredKeys.includes(key);
    const msg = isRetired ? `確定要將此卡片從汰舊區復原嗎？` : `確定要將此卡片移至汰舊區嗎？`;
    
    setConfirmModal({
      show: true,
      msg,
      onConfirm: () => {
        const newRetired = computeNewRetiredKeys(key, isRetired, retiredKeys, aggregationMode);
        setRetiredKeys(newRetired);
        localStorage.setItem('hw_list_retired_keys', JSON.stringify(newRetired));
        window.dispatchEvent(new CustomEvent('retired-update'));
        setConfirmModal({ show: false, msg: '', onConfirm: null });
      }
    });
  };

  const handleCardClick = (st) => {
    const cardId = st.isRetired ? `${st.key}:::RETIRED` : st.key;
    if (selectedCardKey === cardId) {
      setSelectedCardKey(null);
    } else {
      setSelectedCardKey(cardId);
    }
    setCurrentPage(1);
  };

  const renderHeader = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--page-title-margin, 14px)', flexWrap: 'wrap', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 'var(--page-title-size, 1.35rem)', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>
            {filterType ? `${filterType} - 硬體清單` : '硬體列表 (Hardware List)'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px', marginBottom: 0 }}>管理硬體零組件庫存、搭載狀態及進出貨歷史紀錄。</p>
        </div>
        
        {!isSplitMode && (
          <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                padding: '8px 16px',
                backgroundColor: 'var(--primary-color)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}
            >
              ➕ 新增硬體 (Add Hardware)
            </button>
          </div>
        )}
        {(filterType || searchTerm || selectedCardKey) && (
          <button 
            onClick={() => { setSearchTerm(''); setSelectedCardKey(null); navigate('?'); }}
            style={{ padding: '4px 12px', borderRadius: '20px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
          >
            清除所有篩選 ×
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" id="showServerDetails" checked={showServerDetails} onChange={(e) => setShowServerDetails(e.target.checked)} style={{ cursor: 'pointer' }} />
          <label htmlFor="showServerDetails" style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)', cursor: 'pointer' }}>顯示伺服器同步資訊</label>
        </div>
        <button onClick={() => setShowSyncConfig(true)} style={{ padding: '10px 16px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: '700', color: 'var(--text-main)', gap: '6px' }}>
          <Settings size={16} /> 伺服器屬性顯示設定
        </button>

        {/* 卡片聚合維度選擇器 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--bg-surface-subtle)', padding: '3px 8px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>聚合規則:</span>
          <div style={{ display: 'inline-flex', gap: '2px' }}>
            <button
              type="button"
              onClick={() => handleAggregationModeChange('SPEC')}
              style={{
                padding: '5px 10px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '11px',
                fontWeight: '800',
                cursor: 'pointer',
                backgroundColor: aggregationMode === 'SPEC' ? 'var(--primary-color)' : 'transparent',
                color: aggregationMode === 'SPEC' ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s'
              }}
              title="依規格獨立生成卡片：相同廠牌、類型、型號底下，只要規格不同就獨立一張卡片"
            >
              🏷️ 依規格
            </button>
            <button
              type="button"
              onClick={() => handleAggregationModeChange('MODEL')}
              style={{
                padding: '5px 10px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '11px',
                fontWeight: '800',
                cursor: 'pointer',
                backgroundColor: aggregationMode === 'MODEL' ? 'var(--primary-color)' : 'transparent',
                color: aggregationMode === 'MODEL' ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s'
              }}
              title="依型號聚合：相同廠牌與型號合併統計（不分規格）"
            >
              📦 依型號
            </button>
            <button
              type="button"
              onClick={() => handleAggregationModeChange('BRAND')}
              style={{
                padding: '5px 10px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '11px',
                fontWeight: '800',
                cursor: 'pointer',
                backgroundColor: aggregationMode === 'BRAND' ? 'var(--primary-color)' : 'transparent',
                color: aggregationMode === 'BRAND' ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s'
              }}
              title="依廠牌聚合：純依廠牌合併統計（如 Mellanox、Intel 各一張卡片）"
            >
              🏢 依廠牌
            </button>
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
          <input type="text" placeholder="搜尋..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '10px 12px 10px 42px', borderRadius: '30px', border: '1.5px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', width: '200px', outline: 'none' }} />
        </div>
      </div>
    </div>
  );

  const renderStats = () => {
    const { activeStatsMap, retiredStatsMap } = aggregateCards(nics, aggregationMode, retiredKeys);
    const activeKeys = Object.keys(activeStatsMap);
    const retiredList = Object.values(retiredStatsMap);

    if (activeKeys.length === 0 && retiredList.length === 0) return null;

    const renderRetiredSection = (list) => {
      if (list.length === 0) return null;
      return (
        <div style={{ marginTop: '24px', borderTop: '2px dashed var(--border-color)', paddingTop: '24px', marginBottom: '32px', gridColumn: 'span 6' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '900', color: 'var(--text-muted)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Archive size={18} /> 汰舊 / 停用區塊 (Retired Items)
          </h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {list.map(st => {
              const isSelected = selectedCardKey === `${st.key}:::RETIRED`;
              return (
                <div key={st.key} onClick={() => handleCardClick(st)} style={{ backgroundColor: isSelected ? 'var(--primary-bg)' : 'var(--bg-surface)', padding: '10px', borderRadius: '12px', border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)', cursor: 'pointer', minWidth: '220px', opacity: isSelected ? 1 : 0.6, position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.opacity = '0.6'; }}>
                  <button onClick={(e) => toggleRetire(e, st.key, true)} style={{ position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', borderRadius: '4px', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="復原此卡片">
                    <RotateCcw size={14} />
                  </button>
                  <div style={{ marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '900', color: isSelected ? 'var(--primary-color)' : 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Monitor size={12} color={isSelected ? 'var(--primary-color)' : 'var(--text-muted)'} /> {st.brand}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: '800', color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', backgroundColor: 'var(--bg-surface-subtle)', padding: '1px 5px', borderRadius: '4px', marginRight: '22px' }}>
                        共 {st.total} 個
                      </span>
                    </div>
                    {aggregationMode !== 'BRAND' && (
                      <div style={{ color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', fontSize: '10px', fontWeight: '700', marginTop: '2px', paddingLeft: '16px' }}>
                        {st.type} - {st.model}
                      </div>
                    )}
                    {aggregationMode === 'SPEC' && st.specification && (
                      <div style={{ color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', fontSize: '9px', fontWeight: '500', marginTop: '2px', paddingLeft: '16px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={st.specification}>
                        {st.specification}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px 6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>在庫</span><span style={{ color: '#16a34a', fontWeight: '800' }}>{st.active}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>出貨</span><span style={{ color: '#3b82f6', fontWeight: '800' }}>{st.shipped}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>借出</span><span style={{ color: '#d97706', fontWeight: '800' }}>{st.lent || 0}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>故障</span><span style={{ color: '#ef4444', fontWeight: '800' }}>{st.repair}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>報廢</span><span style={{ color: 'var(--text-subtle)', fontWeight: '800' }}>{st.scrapped}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    // --- 過濾模式：卡片置頂靠左 ---
    if (filterType || searchTerm || selectedCardKey) {
      const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(t => t);
      const filterCard = (st) => {
        if (selectedCardKey) {
          const cardId = st.isRetired ? `${st.key}:::RETIRED` : st.key;
          if (cardId !== selectedCardKey) return false;
        }
        if (filterType && st.type !== filterType) return false;
        if (searchTerms.length === 0) return true;
        const target = `${st.brand} ${st.type} ${st.model} ${st.specification}`.toLowerCase();
        return searchTerms.every(t => target.includes(t));
      };

      const activeMatches = Object.values(activeStatsMap).filter(filterCard);
      const retiredMatches = Object.values(retiredStatsMap).filter(filterCard);

      return (
        <div style={{ position: 'relative' }}>
          {activeMatches.length > 0 && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', padding: '16px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
              {activeMatches.map(st => {
                const isSelected = selectedCardKey === st.key;
                return (
                  <div 
                    key={st.key}
                    onClick={() => handleCardClick(st)}
                    style={{ 
                      backgroundColor: isSelected ? 'var(--primary-bg)' : 'var(--bg-surface)', 
                      padding: '12px', 
                      borderRadius: '12px', 
                      border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)', 
                      boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.2)' : 'var(--card-shadow)',
                      cursor: 'pointer',
                      minWidth: '220px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s',
                      position: 'relative'
                    }}
                  >
                    <button onClick={(e) => toggleRetire(e, st.key, false)} style={{ position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'none', color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="將此卡片移至汰舊區">
                      <Archive size={14} />
                    </button>
                    <div style={{ marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '900', color: isSelected ? 'var(--primary-color)' : 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Monitor size={12} color={isSelected ? 'var(--primary-color)' : 'var(--text-muted)'} /> {st.brand}
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: '800', color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', backgroundColor: 'var(--bg-surface-subtle)', padding: '1px 5px', borderRadius: '4px', marginRight: '22px' }}>
                          共 {st.total} 個
                        </span>
                      </div>
                      {aggregationMode !== 'BRAND' && (
                        <div style={{ color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', fontSize: '10px', fontWeight: '700', marginTop: '2px', paddingLeft: '16px' }}>
                          {st.type} - {st.model}
                        </div>
                      )}
                      {aggregationMode === 'SPEC' && st.specification && (
                        <div style={{ color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', fontSize: '9px', fontWeight: '500', marginTop: '2px', paddingLeft: '16px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={st.specification}>
                          {st.specification}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px 6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>在庫</span><span style={{ color: '#16a34a', fontWeight: '800' }}>{st.active}</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>出貨</span><span style={{ color: '#3b82f6', fontWeight: '800' }}>{st.shipped}</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>借出</span><span style={{ color: '#d97706', fontWeight: '800' }}>{st.lent || 0}</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>故障</span><span style={{ color: '#ef4444', fontWeight: '800' }}>{st.repair}</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-subtle)', fontWeight: '800' }}>{st.scrapped}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {renderRetiredSection(retiredMatches)}
        </div>
      );
    }


    // 1. 自動清理佈局：移除已不存在於 activeKeys 的 Key
    const cleanedLayoutMap = {};
    Object.entries(layoutMap).forEach(([idx, key]) => {
      if (activeKeys.includes(key)) cleanedLayoutMap[idx] = key;
    });

    const assignedKeys = Object.values(cleanedLayoutMap);
    const missingKeys = activeKeys.filter(k => !assignedKeys.includes(k));
    let currentLayoutMap = cleanedLayoutMap;
    if (missingKeys.length > 0 || Object.keys(cleanedLayoutMap).length !== Object.keys(layoutMap).length) {
      const updatedMap = { ...cleanedLayoutMap };
      let currentIdx = 0;
      missingKeys.forEach(key => {
        while (updatedMap[currentIdx]) currentIdx++;
        updatedMap[currentIdx] = key;
      });
      setLayoutMap(updatedMap);
      localStorage.setItem('hw_list_layout_map', JSON.stringify(updatedMap));
      currentLayoutMap = updatedMap;
    }

    const maxOccupiedIdx = Object.keys(currentLayoutMap).reduce((max, current) => Math.max(max, parseInt(current)), -1);
    const rows = Math.max(1, Math.ceil((maxOccupiedIdx + 1) / 6) + (draggingCardKey ? 1 : 0));
    const SLOTS_COUNT = rows * 6;
    const slots = Array.from({ length: SLOTS_COUNT });

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', marginBottom: '24px', padding: '16px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
        {slots.map((_, idx) => {
          const cardKey = currentLayoutMap[idx];
          const st = activeStatsMap[cardKey];
          const isSelected = st && selectedCardKey === st.key;
          return (
            <div key={idx} onDragOver={handleSlotDragOver} onDrop={(e) => handleDropOnSlot(e, idx)} style={{ minHeight: '100px', borderRadius: '12px', border: draggingCardKey ? '1px dashed var(--border-color)' : '1px solid transparent', backgroundColor: draggingCardKey ? 'var(--bg-surface-hover)' : 'transparent', transition: 'all 0.2s' }}>
              {st && (
                <div draggable onDragStart={(e) => handleCardDragStart(e, st.key)} onClick={() => handleCardClick(st)} style={{ backgroundColor: isSelected ? 'var(--primary-bg)' : 'var(--bg-surface)', padding: '10px', borderRadius: '12px', border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)', boxShadow: 'var(--card-shadow)', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', opacity: draggingCardKey === st.key ? 0.3 : 1, transform: 'scale(1)', transition: 'transform 0.1s', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                  <button onClick={(e) => toggleRetire(e, st.key, false)} style={{ position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'none', color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="將此卡片移至汰舊區">
                    <Archive size={14} />
                  </button>
                  <div style={{ marginBottom: '6px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', overflow: 'hidden' }}>
                    <div style={{ fontSize: '12px', fontWeight: '900', color: isSelected ? 'var(--primary-color)' : 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Monitor size={12} color={isSelected ? 'var(--primary-color)' : 'var(--text-muted)'} /> {st.brand}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: '800', color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', backgroundColor: 'var(--bg-surface-subtle)', padding: '1px 5px', borderRadius: '4px', marginRight: '20px' }}>
                        共 {st.total} 個
                      </span>
                    </div>
                    {aggregationMode !== 'BRAND' && (
                      <div style={{ color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', fontSize: '10px', fontWeight: '700', marginTop: '1px', paddingLeft: '16px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {st.type} - {st.model}
                      </div>
                    )}
                    {aggregationMode === 'SPEC' && st.specification && (
                      <div style={{ color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', fontSize: '9px', fontWeight: '500', marginTop: '1px', paddingLeft: '16px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={st.specification}>
                        {st.specification}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px 6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>在庫</span><span style={{ color: '#16a34a', fontWeight: '800' }}>{st.active}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>出貨</span><span style={{ color: '#3b82f6', fontWeight: '800' }}>{st.shipped}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>借出</span><span style={{ color: '#d97706', fontWeight: '800' }}>{st.lent || 0}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>故障</span><span style={{ color: '#ef4444', fontWeight: '800' }}>{st.repair}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-subtle)', fontWeight: '800' }}>{st.scrapped}</span></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {renderRetiredSection(retiredList)}
      </div>
    );
  };

  const renderTable = () => (
    <div style={{ marginBottom: '16px', overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', minHeight: '300px', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)' }}>
          <tr style={{ borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--table-header-bg)' }}>
            <th style={{ ...thStyle, textAlign: 'left', width: '200px' }}>廠牌 / 型號 / 類型</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>序號 (SN)</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>規格 (Spec)</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>專案編號/名稱 (Project)</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>訂單來源 (OrderSource)</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>出貨日期</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>對應伺服器</th>
            {showServerDetails && <th style={{ ...thStyle, textAlign: 'left' }}>伺服器屬性</th>}
            <th style={{ ...thStyle, textAlign: 'left' }}>客戶</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>End-user</th>
            {showServerDetails && <th style={{ ...thStyle, textAlign: 'left' }}>位置</th>}
            <th style={{ ...thStyle, textAlign: 'left', width: '100px' }}>狀態</th>
            <th style={{ ...thStyle, textAlign: 'center', width: '80px' }}>功能</th>
          </tr>
        </thead>
        <tbody>
          {paginatedNics.map(nic => {
            const cfg = getStatusConfig(nic.status);
            let serverAttrs = {};
            try { 
              serverAttrs = typeof nic.server_custom_attributes === 'string' 
                ? JSON.parse(nic.server_custom_attributes) 
                : (nic.server_custom_attributes || {}); 
            } catch {
              // 解析失敗時回傳空物件，忽略錯誤以防程式崩潰
              serverAttrs = {};
            }
            return (
              <tr key={nic.id} style={{ borderBottom: '1px solid var(--table-border)', backgroundColor: nic.status === 'SCRAPPED' ? 'rgba(239, 68, 68, 0.08)' : 'transparent' }}>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {nic.brand}
                    {nic.ownership === 'COMPANY' && (
                      <span style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: '#8b5cf6', color: 'white', borderRadius: '4px', whiteSpace: 'nowrap' }}>公司資產</span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{nic.type} - {nic.model}</div>
                </td>
                <td style={{ ...tdStyle, fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>{nic.sn || '(未設定)'}</td>
                <td style={{ ...tdStyle, fontSize: '11px', color: 'var(--text-muted)' }}>{nic.specification || '--'}</td>
                <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--text-main)' }}>
                  {(() => {
                    const pName = nic.custom_attributes?.project_name;
                    if (!pName) return '--';
                    const proj = projects.find(p => p.project_name === pName);
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {proj && proj.project_no && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal', marginBottom: '2px' }}>{proj.project_no}</span>}
                        <span>{pName}</span>
                      </div>
                    );
                  })()}
                </td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{nic.custom_attributes?.order_source !== undefined ? (nic.custom_attributes?.order_source || '--') : (nic.custom_attributes?.order_date || '--')}</td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: '11px', color: nic.shipping_date ? '#8b5cf6' : 'var(--text-muted)', fontWeight: nic.shipping_date ? 700 : 'normal' }}>
                  {nic.shipping_date ? new Date(nic.shipping_date).toLocaleDateString() : '--'}
                </td>
                <td style={tdStyle}>
                  <div style={{ color: '#818cf8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Server size={12} /> {nic.server_sn || nic.custom_attributes?.server_sn || '--'}
                  </div>
                  {nic.server_hostname && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', paddingLeft: '16px' }}>
                      HostName: <b style={{ color: 'var(--text-main)' }}>{nic.server_hostname}</b>
                    </div>
                  )}
                </td>
                {showServerDetails && (
                  <td style={tdStyle}>
                    <div style={{ fontSize: '11px' }}>
                      {selectedSyncFields.map(id => {
                        const def = availableFieldDefs.find(d => d.id === id);
                        // 如果是自訂欄位且找不到定義 (已被刪除)，則不顯示
                        if (id !== 'hostname' && id !== 'os' && !def) return null;

                        const label = id === 'hostname' ? 'HostName' : (id === 'os' ? 'OS' : (id === 'nic' ? 'FW' : def?.label.split(' ')[0]));
                        let val = null;
                        if (id === 'hostname') return null; // 已移至序號下方顯示
                        else if (id === 'os') val = nic.server_os;
                        else if (id === 'nic') val = nic.server_nic;
                        else val = serverAttrs[id];

                        if (!val) return null;
                        return (
                          <div key={id} style={{ display: 'flex', gap: '4px', marginBottom: '2px' }}>
                            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}:</span>
                            <span style={{ fontWeight: 600, color: def?.color || 'inherit' }}>{val}</span>
                          </div>
                        );
                      })}
                      {selectedSyncFields.every(id => {
                        if (id === 'hostname') return !nic.server_hostname;
                        if (id === 'os') return !nic.server_os;
                        return !serverAttrs[id];
                      }) && <span style={{ color: 'var(--text-subtle)' }}>--</span>}
                    </div>
                  </td>
                )}
                <td style={tdStyle}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: 'var(--text-main)' }}>
                      <User size={14} color="var(--text-muted)" /> {nic.server_client || nic.client || '--'}
                    </div>
                    {(nic.partner_contact || nic.partner_phone) && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '18px' }}>
                        {nic.partner_contact} {nic.partner_phone}
                      </div>
                    )}
                  </div>
                </td>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                    {nic.server_end_user || serverAttrs.end_user || nic.end_user || nic.custom_attributes?.end_user || '--'}
                  </div>
                </td>
                {showServerDetails && (
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-main)' }}>
                      <MapPin size={14} color="var(--text-muted)" /> {nic.server_location || '--'}
                    </div>
                  </td>
                )}
                <td style={{ ...tdStyle, width: '100px' }}><span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '800', backgroundColor: cfg.bgColor, color: cfg.color, border: `1px solid ${cfg.borderColor}`, whiteSpace: 'nowrap' }}>{cfg.label}</span></td>
                <td style={{ ...tdStyle, textAlign: 'center', width: '80px', position: 'relative' }}>
                  <button 
                    className="action-menu-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeMenuId === nic.id) {
                        setActiveMenuId(null);
                        setMenuPosition(null);
                      } else {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const menuHeight = 360;
                        const isUpward = rect.bottom + menuHeight > window.innerHeight && rect.top > menuHeight;
                        setActiveMenuId(nic.id);
                        setMenuPosition({
                          top: isUpward ? rect.top - 4 : rect.bottom + 4,
                          right: window.innerWidth - rect.right,
                          isUpward
                        });
                      }
                    }} 
                    style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                  {activeMenuId === nic.id && menuPosition && (
                    <div 
                      className="dropdown-action-menu"
                      style={{ 
                        position: 'fixed', 
                        top: menuPosition.isUpward ? 'auto' : `${menuPosition.top}px`,
                        bottom: menuPosition.isUpward ? `${window.innerHeight - menuPosition.top}px` : 'auto',
                        right: `${menuPosition.right}px`, 
                        backgroundColor: 'var(--bg-surface)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '12px', 
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)', 
                        zIndex: 99999, 
                        padding: '8px', 
                        minWidth: '160px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '4px',
                        maxHeight: '80vh',
                        overflowY: 'auto'
                      }}
                    >
                      <button 
                        onClick={() => {
                          setActiveMenuId(null);
                          setMenuPosition(null);
                          setLedgerItem({ item_master_id: nic.item_master_id, sn: nic.sn, brand: nic.brand, model: nic.model, type: nic.type, current_stock: 1 });
                        }} 
                        style={{ ...menuButtonStyle, color: 'var(--text-main)' }}
                      >
                        <History size={14} /> 履歷 (History)
                      </button>
                      <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '2px 0' }} />
                      <button 
                        onClick={() => { 
                          setActiveMenuId(null); 
                          setMenuPosition(null); 
                          setRmaAsset(nic); 
                        }} 
                        style={{ ...menuButtonStyle, color: '#0ea5e9', fontWeight: '700' }}
                      >
                        <RefreshCw size={14} /> 原廠換新 / 更換序號 (RMA)
                      </button>
                      <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleEdit(nic); }} style={menuButtonStyle}><Edit2 size={14} /> 編輯詳細資訊</button>
                      <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '2px 0' }} />
                      {nic.ownership === 'COMPANY' ? (
                        <button 
                          onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleUpdateOwnership(nic.id, nic.sn, 'FOR_SALE', '一般銷售'); }} 
                          style={{ ...menuButtonStyle, color: '#3b82f6', fontWeight: '700' }}
                        >
                          <RotateCcw size={14} /> 轉為一般銷售
                        </button>
                      ) : (
                        <button 
                          onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleUpdateOwnership(nic.id, nic.sn, 'COMPANY', '公司資產'); }} 
                          style={{ ...menuButtonStyle, color: '#8b5cf6', fontWeight: '700' }}
                        >
                          <Building2 size={14} /> 轉為公司資產
                        </button>
                      )}
                      <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
                      <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleUpdateStatus(nic.id, nic.sn, 'ACTIVE', '在庫'); }} style={{ ...menuButtonStyle, color: '#10b981' }}><CheckCircle size={14} /> 標記為在庫</button>
                      <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleUpdateStatus(nic.id, nic.sn, 'SHIPPED', '已出貨'); }} style={{ ...menuButtonStyle, color: '#3b82f6' }}><ShoppingBag size={14} /> 標記為出貨</button>
                      <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleUpdateStatus(nic.id, nic.sn, 'LENT', '借出'); }} style={{ ...menuButtonStyle, color: '#f59e0b' }}><Send size={14} /> 標記為借出</button>
                      <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleUpdateStatus(nic.id, nic.sn, 'REPAIR', '故障'); }} style={{ ...menuButtonStyle, color: '#ef4444' }}><AlertTriangle size={14} /> 標記為故障</button>
                      <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleUpdateStatus(nic.id, nic.sn, 'SCRAPPED', '報廢'); }} style={{ ...menuButtonStyle, color: 'var(--text-subtle)' }}><ShieldAlert size={14} /> 標記為報廢</button>
                      <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
                      <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleDelete(nic); }} style={{ ...menuButtonStyle, color: '#f43f5e' }}><Trash2 size={14} /> 刪除紀錄</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginTop: '20px' }}>
        <PageSizeSelector pageSize={itemsPerPage} onChange={(newSize) => { setItemsPerPage(newSize); setCurrentPage(1); }} />
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button disabled={currentPage === 1} onClick={() => { setCurrentPage(prev => prev - 1); window.scrollTo(0, 0); }} style={{ ...navBtnStyle, opacity: currentPage === 1 ? 0.5 : 1 }}>上一頁</button>
            <span style={{ display: 'flex', alignItems: 'center', fontWeight: '800', color: 'var(--text-muted)' }}>第 {currentPage} 頁 / 共 {totalPages} 頁</span>
            <button disabled={currentPage === totalPages} onClick={() => { setCurrentPage(prev => prev + 1); window.scrollTo(0, 0); }} style={{ ...navBtnStyle, opacity: currentPage === totalPages ? 0.5 : 1 }}>下一頁</button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {renderHeader()}
        {renderStats()}
        {filterType || selectedCardKey || searchTerm ? (
          renderTable()
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '16px', border: '1px dashed var(--border-color)', marginTop: '20px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '15px', fontWeight: '500' }}>
              請點擊上方統計卡片，或從左側選單選擇分類來查看詳細清單
            </div>
            <div style={{ color: 'var(--text-subtle)', fontSize: '12px', marginTop: '8px' }}>
              您也可以在右上角使用搜尋功能直接查找
            </div>
          </div>
        )}

        {/* 硬體卡片聚合規則說明 */}
        <div style={{
          marginTop: '24px',
          padding: '14px 18px',
          backgroundColor: 'var(--bg-surface-subtle)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          fontSize: '13px',
          color: 'var(--text-muted)',
          lineHeight: '1.6'
        }}>
          <Info size={18} color="var(--primary-color)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: '800', color: 'var(--text-main)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              硬體卡片聚合規則說明
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>• <b>當前聚合維度</b>：
                <span style={{ color: 'var(--primary-color)', fontWeight: '800' }}>
                  {aggregationMode === 'SPEC' && '🏷️ 依規格聚合（廠牌 ＋ 類型 ＋ 型號 ＋ 規格，規格不同即獨立卡片）'}
                  {aggregationMode === 'MODEL' && '📦 依型號聚合（廠牌 ＋ 類型 ＋ 型號，同型號合併卡片不分規格）'}
                  {aggregationMode === 'BRAND' && '🏢 依廠牌聚合（純依廠牌合併統計卡片）'}
                </span>
                （可於右上方自由切換）
              </div>
              <div>• <b>連動篩選</b>：點擊上方任一卡片，系統將自動依該卡片維度（廠牌、型號或規格）過濾下方硬體資產明細清單；再次點擊可取消篩選。</div>
            </div>
          </div>
        </div>
      </div>

      {showSyncConfig && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '450px', padding: '32px', borderRadius: '16px', boxShadow: 'var(--modal-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>伺服器屬性顯示設定</h2>
              <X size={20} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowSyncConfig(false)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
              {availableFieldDefs.map(def => {
                const id = def.id;
                const label = def.label;
                return (
                  <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', backgroundColor: 'var(--bg-surface-subtle)' }}>
                    <input type="checkbox" checked={selectedSyncFields.includes(id)} onChange={() => toggleSyncField(id)} />
                    <span style={{ fontSize: '14px', color: 'var(--text-main)' }}>{label}</span>
                  </label>
                );
              })}
            </div>
            <button onClick={handleSaveSyncPreference} style={{ width: '100%', padding: '12px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, marginTop: '24px', cursor: 'pointer' }}>儲存設定</button>
          </div>
        </div>
      )}

      {showEditModal && editItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '60vw', maxWidth: '95vw', padding: '32px', borderRadius: '16px', boxShadow: 'var(--modal-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>修改硬體資訊</h2>
              <X size={24} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowEditModal(false)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <div>
                  <label style={editLabelStyle}>廠牌 (Brand) (鎖定)</label>
                  <input type="text" value={editItem.brand || ''} disabled readOnly style={{ ...editInputStyle, backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', cursor: 'not-allowed' }} />
                </div>
                <div>
                  <label style={editLabelStyle}>類型 (Type) (鎖定)</label>
                  <input type="text" value={editItem.type || ''} disabled readOnly style={{ ...editInputStyle, backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', cursor: 'not-allowed' }} />
                </div>
                <div>
                  <label style={editLabelStyle}>型號 (Model) *</label>
                  <input 
                    type="text" 
                    value={editItem.model || ''} 
                    onChange={(e) => setEditItem({ ...editItem, model: e.target.value })} 
                    style={editInputStyle} 
                    placeholder="請輸入型號"
                  />
                </div>
                <div>
                  <label style={editLabelStyle}>規格 (Specification) <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(選填)</span></label>
                  <input 
                    type="text" 
                    value={editItem.specification || ''} 
                    onChange={(e) => setEditItem({ ...editItem, specification: e.target.value })} 
                    style={editInputStyle} 
                    title={editItem.specification || ''} 
                    placeholder="選填，可輸入硬體規格"
                  />
                </div>
              </div>

              <div>
                <label style={editLabelStyle}>資產歸屬 (Ownership)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setEditItem({ ...editItem, ownership: 'FOR_SALE' })}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: editItem.ownership !== 'COMPANY' ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                      backgroundColor: editItem.ownership !== 'COMPANY' ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-surface-subtle)',
                      color: editItem.ownership !== 'COMPANY' ? 'var(--primary-color)' : 'var(--text-muted)',
                      fontWeight: '700',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    一般銷售 (FOR_SALE)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditItem({ ...editItem, ownership: 'COMPANY' })}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: editItem.ownership === 'COMPANY' ? '2px solid #8b5cf6' : '1px solid var(--border-color)',
                      backgroundColor: editItem.ownership === 'COMPANY' ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-surface-subtle)',
                      color: editItem.ownership === 'COMPANY' ? '#8b5cf6' : 'var(--text-muted)',
                      fontWeight: '700',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    🏢 公司資產 (COMPANY)
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={editLabelStyle}>硬體序號<input type="text" value={editItem.sn || ''} onChange={(e) => setEditItem({ ...editItem, sn: e.target.value })} style={editInputStyle} /></label>
                <label style={editLabelStyle}>主機名稱 (HostName)<input type="text" value={editItem.hostname || ''} onChange={(e) => setEditItem({ ...editItem, hostname: e.target.value })} style={editInputStyle} /></label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <label style={editLabelStyle}>客戶名稱
                  <select value={editItem.client || ''} onChange={(e) => setEditItem({ ...editItem, client: e.target.value })} style={editInputStyle}>
                    <option value="">-- 未設定 --</option>
                    {customers.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label style={editLabelStyle}>End-user (最終使用者)
                  <input 
                    type="text" 
                    value={editItem.temp_end_user !== undefined ? editItem.temp_end_user : (editItem.end_user || editItem.custom_attributes?.end_user || '')} 
                    onChange={(e) => setEditItem({ ...editItem, temp_end_user: e.target.value })} 
                    placeholder="請輸入 End-user"
                    style={editInputStyle} 
                  />
                </label>
                <label style={editLabelStyle}>放置位置 (Location)<input type="text" value={editItem.location || ''} onChange={(e) => setEditItem({ ...editItem, location: e.target.value })} style={editInputStyle} /></label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) 1fr 1fr', gap: '16px' }}>
                <label style={editLabelStyle}>對應伺服器 SN<input type="text" value={editItem.temp_server_sn || ''} onChange={(e) => setEditItem({ ...editItem, temp_server_sn: e.target.value })} style={editInputStyle} /></label>
                <div style={{ position: 'relative' }}>
                  <label style={editLabelStyle}>專案名稱 (Project)</label>
                  <input 
                    type="text" 
                    value={editItem.temp_project_name || ''} 
                    onChange={(e) => setEditItem({ ...editItem, temp_project_name: e.target.value })} 
                    placeholder="輸入關鍵字搜尋專案"
                    style={editInputStyle} 
                    onFocus={() => {
                      if (!editItem.showProjectDropdown) {
                        setEditItem({...editItem, showProjectDropdown: true});
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        setEditItem(prev => prev ? {...prev, showProjectDropdown: false} : prev);
                      }, 200);
                    }}
                  />
                  {editItem.showProjectDropdown && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, 
                      backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', 
                      borderRadius: '8px', marginTop: '4px', maxHeight: '200px', 
                      overflowY: 'auto', zIndex: 10, boxShadow: 'var(--modal-shadow)'
                    }}>
                      {(() => {
                        const searchStr = (editItem.temp_project_name || '').toLowerCase();
                        const matches = projects.filter(p => 
                          (p.project_no || '').toLowerCase().includes(searchStr) || 
                          (p.project_name || '').toLowerCase().includes(searchStr)
                        );
                        if (matches.length === 0) return <div style={{ padding: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>無符合專案</div>;
                        return matches.map(p => (
                          <div 
                            key={p.project_no}
                            style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                            onMouseDown={() => {
                              setEditItem({...editItem, temp_project_name: p.project_name, showProjectDropdown: false});
                            }}
                          >
                            <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{p.project_no}</div>
                            <div style={{ color: 'var(--text-muted)' }}>{p.project_name}</div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
                <label style={editLabelStyle}>
                  訂單來源 (OrderSource)
                  <input 
                    type="text" 
                    value={editItem.temp_order_source !== undefined ? editItem.temp_order_source : ''} 
                    onChange={(e) => setEditItem({ ...editItem, temp_order_source: e.target.value })} 
                    placeholder="請輸入訂單來源 (例: XeAU Nov2022)"
                    style={editInputStyle} 
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <label style={editLabelStyle}>
                  出貨日期 (Shipping Date)
                  <input 
                    type="date" 
                    value={editItem.shipping_date || ''} 
                    onChange={(e) => setEditItem({ ...editItem, shipping_date: e.target.value })} 
                    style={editInputStyle} 
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
                <button onClick={handleSave} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>儲存變更</button>
                <button onClick={() => setShowEditModal(false)} style={{ padding: '14px 24px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmModal.show && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11000 }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '320px', padding: '24px', borderRadius: '20px', boxShadow: 'var(--modal-shadow)', textAlign: 'center' }}>
            <div style={{ marginBottom: '20px', fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', lineHeight: '1.5' }}>{confirmModal.msg}</div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setConfirmModal({ show: false, msg: '', onConfirm: null })}
                style={{ flex: 1, padding: '10px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', borderRadius: '30px', color: 'var(--text-muted)', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}
              >
                取消
              </button>
              <button 
                onClick={confirmModal.onConfirm}
                style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: 'none', borderRadius: '30px', color: 'white', fontWeight: '700', cursor: 'pointer', fontSize: '13px', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)' }}
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 品項履歷 Modal */}
      <ItemLedgerModal
        isOpen={!!ledgerItem}
        onClose={() => setLedgerItem(null)}
        item={ledgerItem}
      />

      {/* 新增硬體彈窗 Modal */}
      <HwRegistrationModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadData}
      />

      {/* 原廠換新 (RMA) 更換序號彈窗 */}
      <RmaReplacementModal
        isOpen={!!rmaAsset}
        asset={rmaAsset}
        onClose={() => setRmaAsset(null)}
        onSuccess={loadData}
      />
    </div>
  );
};

export default HwList;
