import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Edit2, X, Server, User, MapPin, MoreHorizontal, Trash2, ShoppingBag, AlertTriangle, CheckCircle, Save, Monitor, Settings, ShieldAlert, Archive, RotateCcw, Cpu, Send, History } from 'lucide-react';
import ItemLedgerModal from '../components/ItemLedgerModal';
import { logUpdate, logDelete, logStatusChange } from '../utils/auditLogger';

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
  const [showServerDetails, setShowServerDetails] = useState(true);
  const [ledgerItem, setLedgerItem] = useState(null);

  // 當側邊欄分類變動時，清除搜尋關鍵字
  useEffect(() => {
    setSearchTerm('');
  }, [filterType]);

  const [showSyncConfig, setShowSyncConfig] = useState(false);
  const [availableFieldDefs, setAvailableFieldDefs] = useState([]);
  const [selectedSyncFields, setSelectedSyncFields] = useState(['hostname', 'os']);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ show: false, msg: '', onConfirm: null });

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      // 根據是否有 filterType 決定呼叫的查詢
      let nicsRes;
      if (filterType) {
        nicsRes = await window.electronAPI.namedQuery('fetchNicListByType', [filterType]);
      } else {
        nicsRes = await window.electronAPI.namedQuery('fetchNicList');
      }
      
      if (isMounted && nicsRes.success) setNics(nicsRes.rows);

      // 抓取系統設定
      const defsRes = await window.electronAPI.namedQuery('getSystemSetting', ['customFieldDefinitions']);
      if (isMounted && defsRes.success && defsRes.rows.length > 0) {
        setAvailableFieldDefs(defsRes.rows[0].value || []);
      }

      const prefRes = await window.electronAPI.namedQuery('getSystemSetting', ['nicSyncFieldPreference']);
      if (isMounted && prefRes.success && prefRes.rows.length > 0) {
        setSelectedSyncFields(prefRes.rows[0].value || ['hostname', 'os']);
      }

      const custRes = await window.electronAPI.namedQuery('fetchCustomers');
      if (isMounted && custRes.success) {
        setCustomers(custRes.rows.map(r => r.name));
      }

      const projRes = await window.electronAPI.namedQuery('fetchActiveProjects');
      if (isMounted && projRes.success) {
        setProjects(projRes.rows);
      }
    };

    loadData();

    const handleDbUpdate = () => { if (isMounted) loadData(); };
    window.addEventListener('db-update', handleDbUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener('db-update', handleDbUpdate);
    };
  }, [filterType]); // 當類型變動時，重新載入資料

  const handleEdit = (nic) => {
    setEditItem({
      ...nic,
      temp_server_sn: nic.custom_attributes?.server_sn || '',
      temp_order_date: nic.custom_attributes?.order_date || '',
      temp_project_name: nic.custom_attributes?.project_name || ''
    });
    setShowEditModal(true);
    setActiveMenuId(null);
  };

  const handleSave = async () => {
    if (!editItem) return;

    // 先更新 item_master 中的規格
    await window.electronAPI.namedQuery('updateItemMasterSpecs', [
      editItem.specification || '',
      editItem.model,
      editItem.item_master_id
    ]);

    // 再更新資產明細
    const res = await window.electronAPI.namedQuery('updateNicDetails', [
      editItem.sn ? editItem.sn.trim() : null,
      editItem.client || null,
      editItem.location || null,
      editItem.temp_server_sn ? editItem.temp_server_sn.trim() : null,
      editItem.temp_order_date || null,
      editItem.hostname || null,
      parseInt(editItem.id, 10),
      editItem.temp_project_name || null
    ]);
    if (res.success) { 
      logUpdate('HARDWARE', editItem.sn || editItem.id, `${editItem.brand || ''} ${editItem.model || ''}`, `編輯硬體詳細資訊 [${editItem.sn || editItem.id}]`, {
        sn: editItem.sn,
        client: editItem.client,
        location: editItem.location,
        server_sn: editItem.temp_server_sn,
        project_name: editItem.temp_project_name
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

  const containerStyle = { padding: '24px', backgroundColor: 'var(--bg-app)', minHeight: '100vh' };
  const cardStyle = { backgroundColor: 'var(--bg-surface)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', color: 'var(--text-main)' };
  const thStyle = { textAlign: 'left', padding: '14px', borderBottom: '2px solid var(--border-color)', color: 'var(--table-header-text)', fontSize: '13px', fontWeight: '900', backgroundColor: 'var(--table-header-bg)' };
  const tdStyle = { padding: '14px', borderBottom: '1px solid var(--table-border)', fontSize: '12px', color: 'var(--text-main)' };
  const navBtnStyle = { padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '700' };
  const menuButtonStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderRadius: '8px', textAlign: 'left' };
  const editLabelStyle = { display: 'block', fontWeight: '800', fontSize: '13px', marginBottom: '6px', color: 'var(--text-muted)' };
  const editInputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '13px' };

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const statusPriority = { 'REPAIR': 1, 'LENT': 2, 'ACTIVE': 3, 'SHIPPED': 4, 'SCRAPPED': 5 };

  const filteredNics = nics
    .filter(n => {
      const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(t => t);
      if (searchTerms.length === 0) return true;
      return searchTerms.every(term => 
        (n.sn || '').toLowerCase().includes(term) ||
        (n.brand || '').toLowerCase().includes(term) ||
        (n.model || '').toLowerCase().includes(term) ||
        (n.custom_attributes?.server_sn || '').toLowerCase().includes(term)
      );
    })
    .sort((a, b) => (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99));

  const totalPages = Math.ceil(filteredNics.length / itemsPerPage);
  const paginatedNics = filteredNics.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const [layoutMap, setLayoutMap] = useState(() => {
    const saved = localStorage.getItem('hw_list_layout_map');
    return saved ? JSON.parse(saved) : {};
  });

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

  const [retiredKeys, setRetiredKeys] = useState(() => {
    const saved = localStorage.getItem('hw_list_retired_keys');
    return saved ? JSON.parse(saved) : [];
  });

  const toggleRetire = (e, key) => {
    e.stopPropagation();
    const isRetired = retiredKeys.includes(key);
    const msg = isRetired ? `確定要將此卡片從汰舊區復原嗎？` : `確定要將此卡片移至汰舊區嗎？`;
    
    setConfirmModal({
      show: true,
      msg,
      onConfirm: () => {
        const newRetired = isRetired 
          ? retiredKeys.filter(k => k !== key)
          : [...retiredKeys, key];
        setRetiredKeys(newRetired);
        localStorage.setItem('hw_list_retired_keys', JSON.stringify(newRetired));
        window.dispatchEvent(new CustomEvent('retired-update'));
        setConfirmModal({ show: false, msg: '', onConfirm: null });
      }
    });
  };


  const handleCardClick = (st) => {
    const target = `${st.brand} ${st.model}`;
    if (searchTerm === target && filterType === st.type) {
      // 如果完全相同，則清除
      setSearchTerm('');
      navigate('?');
    } else {
      // 如果類別變更，先清空搜尋詞避免舊資料衝突
      if (filterType !== st.type) {
        setSearchTerm('');
      }
      navigate(`?type=${encodeURIComponent(st.type)}`);
      // 稍微延遲設定搜尋詞，讓 useEffect 優先處理資料載入
      setTimeout(() => setSearchTerm(target), 50);
    }
    setCurrentPage(1);
  };

  const renderHeader = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>
            {filterType ? `${filterType} - 硬體清單` : '硬體列表 (Hardware List)'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>管理硬體零組件庫存、搭載狀態及進出貨歷史紀錄。</p>
        </div>
        
        {!isSplitMode && (
          <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => navigate('/hw-split')}
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
              新增硬體 (HW Reg)
            </button>
          </div>
        )}
        {(filterType || searchTerm) && (
          <button 
            onClick={() => { setSearchTerm(''); navigate('?'); }}
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
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
          <input type="text" placeholder="搜尋..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '10px 12px 10px 42px', borderRadius: '30px', border: '1.5px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', width: '200px', outline: 'none' }} />
        </div>
      </div>
    </div>
  );

  const renderStats = () => {
    const statsMap = filteredNics.reduce((acc, curr) => {
      const brandStr = curr.brand || '未知';
      const typeStr = curr.type || '未分類';
      const modelStr = curr.model || '未設定型號';
      const key = `${brandStr} - ${typeStr} - ${modelStr}`;
      if (!acc[key]) acc[key] = { key, brand: brandStr, type: typeStr, model: modelStr, active: 0, shipped: 0, repair: 0, scrapped: 0 };
      const status = curr.status || 'ACTIVE';
      if (status === 'ACTIVE') acc[key].active++;
      else if (status === 'SHIPPED') acc[key].shipped++;
      else if (status === 'REPAIR') acc[key].repair++;
      else if (status === 'SCRAPPED') acc[key].scrapped++;
      return acc;
    }, {});

    const allKeys = Object.keys(statsMap);
    const displayKeys = allKeys.filter(k => {
      if (!searchTerm) return true;
      const lk = k.toLowerCase();
      const terms = searchTerm.toLowerCase().split(/\s+/).filter(t => t);
      return terms.every(t => lk.includes(t));
    });

    if (allKeys.length === 0) return null;

    const renderRetiredSection = (list) => {
      if (list.length === 0) return null;
      return (
        <div style={{ marginTop: '24px', borderTop: '2px dashed var(--border-color)', paddingTop: '24px', marginBottom: '32px', gridColumn: 'span 6' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '900', color: 'var(--text-muted)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Archive size={18} /> 汰舊 / 停用區塊 (Retired Items)
          </h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {list.map(st => (
              <div key={st.key} onClick={() => handleCardClick(st)} style={{ backgroundColor: 'var(--bg-surface)', padding: '10px', borderRadius: '12px', border: '1px solid var(--border-color)', cursor: 'pointer', minWidth: '220px', opacity: 0.6, position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}>
                <button onClick={(e) => toggleRetire(e, st.key)} style={{ position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', borderRadius: '4px', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="復原此卡片">
                  <RotateCcw size={14} />
                </button>
              <div style={{ marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                <div style={{ fontSize: '12px', fontWeight: '900', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Monitor size={12} color="var(--text-muted)" /> {st.brand}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: '500', marginTop: '2px', paddingLeft: '16px' }}>
                  {st.type} - {st.model}
                </div>
              </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>在庫</span><span style={{ color: '#16a34a', fontWeight: '800' }}>{st.active}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>出貨</span><span style={{ color: '#3b82f6', fontWeight: '800' }}>{st.shipped}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>故障</span><span style={{ color: '#ef4444', fontWeight: '800' }}>{st.repair}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>報廢</span><span style={{ color: 'var(--text-subtle)', fontWeight: '800' }}>{st.scrapped}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    };

    // --- 過濾模式：卡片置頂靠左 ---
    if (filterType || searchTerm) {
      const activeMatches = displayKeys.filter(k => !retiredKeys.includes(k)).map(k => statsMap[k]);
      const retiredMatches = displayKeys.filter(k => retiredKeys.includes(k)).map(k => statsMap[k]);

      return (
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', padding: '16px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            {activeMatches.map(st => {
              const isSelected = searchTerm && (`${st.brand} ${st.model}`).toLowerCase() === searchTerm.toLowerCase();
              return (
                <div 
                  key={st.key}
                  onClick={() => handleCardClick(st)}
                  style={{ 
                    backgroundColor: isSelected ? 'var(--primary-bg)' : 'var(--bg-surface)', 
                    padding: '10px', 
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
                  <button onClick={(e) => toggleRetire(e, st.key)} style={{ position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'none', color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="將此卡片移至汰舊區">
                    <Archive size={14} />
                  </button>
                  <div style={{ marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '900', color: isSelected ? 'var(--primary-color)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Monitor size={12} color={isSelected ? 'var(--primary-color)' : 'var(--text-muted)'} /> {st.brand}
                    </div>
                    <div style={{ color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', fontSize: '11px', fontWeight: '500', marginTop: '2px', paddingLeft: '16px' }}>
                      {st.type} - {st.model}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>在庫</span><span style={{ color: '#16a34a', fontWeight: '800' }}>{st.active}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>出貨</span><span style={{ color: '#3b82f6', fontWeight: '800' }}>{st.shipped}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>故障</span><span style={{ color: '#ef4444', fontWeight: '800' }}>{st.repair}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>報廢</span><span style={{ color: 'var(--text-subtle)', fontWeight: '800' }}>{st.scrapped}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
          {renderRetiredSection(retiredMatches)}
        </div>
      );
    }

    const activeKeys = allKeys.filter(k => !retiredKeys.includes(k));
    const retiredList = allKeys.filter(k => retiredKeys.includes(k)).map(k => statsMap[k]);

    // 1. 自動清理佈局：移除已不存在的 Key
    const cleanedLayoutMap = {};
    Object.entries(layoutMap).forEach(([idx, key]) => {
      if (activeKeys.includes(key)) cleanedLayoutMap[idx] = key;
    });

    const assignedKeys = Object.values(cleanedLayoutMap);
    const missingKeys = activeKeys.filter(k => !assignedKeys.includes(k));
    if (missingKeys.length > 0 || Object.keys(cleanedLayoutMap).length !== Object.keys(layoutMap).length) {
      const updatedMap = { ...cleanedLayoutMap };
      let currentIdx = 0;
      missingKeys.forEach(key => {
        while (updatedMap[currentIdx]) currentIdx++;
        updatedMap[currentIdx] = key;
      });
      setLayoutMap(updatedMap);
      localStorage.setItem('hw_list_layout_map', JSON.stringify(updatedMap));
    }

    const maxOccupiedIdx = Object.keys(cleanedLayoutMap).reduce((max, current) => Math.max(max, parseInt(current)), -1);
    const rows = Math.max(1, Math.ceil((maxOccupiedIdx + 1) / 6) + (draggingCardKey ? 1 : 0));
    const SLOTS_COUNT = rows * 6;
    const slots = Array.from({ length: SLOTS_COUNT });

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', marginBottom: '24px', padding: '16px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
        {slots.map((_, idx) => {
          const cardKey = layoutMap[idx];
          const st = statsMap[cardKey];
          return (
            <div key={idx} onDragOver={handleSlotDragOver} onDrop={(e) => handleDropOnSlot(e, idx)} style={{ minHeight: '100px', borderRadius: '12px', border: draggingCardKey ? '1px dashed var(--border-color)' : '1px solid transparent', backgroundColor: draggingCardKey ? 'var(--bg-surface-hover)' : 'transparent', transition: 'all 0.2s' }}>
              {st && (
                <div draggable onDragStart={(e) => handleCardDragStart(e, st.key)} onClick={() => handleCardClick(st)} style={{ backgroundColor: 'var(--bg-surface)', padding: '10px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--card-shadow)', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', opacity: draggingCardKey === st.key ? 0.3 : 1, transform: 'scale(1)', transition: 'transform 0.1s', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                  <button onClick={(e) => toggleRetire(e, st.key)} style={{ position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'none', color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="將此卡片移至汰舊區">
                    <Archive size={14} />
                  </button>
                  <div style={{ marginBottom: '6px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', overflow: 'hidden' }}>
                    <div style={{ fontSize: '12px', fontWeight: '900', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      <Monitor size={12} color="var(--text-muted)" /> {st.brand}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: '500', marginTop: '1px', paddingLeft: '16px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {st.type} - {st.model}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>在庫</span><span style={{ color: '#16a34a', fontWeight: '800' }}>{st.active}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>出貨</span><span style={{ color: '#3b82f6', fontWeight: '800' }}>{st.shipped}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>故障</span><span style={{ color: '#ef4444', fontWeight: '800' }}>{st.repair}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>報廢</span><span style={{ color: 'var(--text-subtle)', fontWeight: '800' }}>{st.scrapped}</span></div>
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
    <div style={{ marginBottom: '20px', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--table-header-bg)' }}>
            <th style={{ ...thStyle, textAlign: 'left', width: '200px' }}>廠牌 / 型號 / 類型</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>序號 (SN)</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>規格 (Spec)</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>專案編號/名稱 (Project)</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>訂單日期</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>對應伺服器</th>
            {showServerDetails && <th style={{ ...thStyle, textAlign: 'left' }}>伺服器屬性</th>}
            <th style={{ ...thStyle, textAlign: 'left' }}>客戶</th>
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
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{nic.custom_attributes?.order_date || '--'}</td>
                <td style={tdStyle}>
                  <div style={{ color: '#818cf8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Server size={12} /> {nic.custom_attributes?.server_sn || '--'}
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
                {showServerDetails && (
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-main)' }}>
                      <MapPin size={14} color="var(--text-muted)" /> {nic.server_location || '--'}
                    </div>
                  </td>
                )}
                <td style={{ ...tdStyle, width: '100px' }}><span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '800', backgroundColor: cfg.bgColor, color: cfg.color, border: `1px solid ${cfg.borderColor}`, whiteSpace: 'nowrap' }}>{cfg.label}</span></td>
                <td style={{ ...tdStyle, textAlign: 'center', width: '80px', position: 'relative' }}>
                  <button onClick={() => setActiveMenuId(activeMenuId === nic.id ? null : nic.id)} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><MoreHorizontal size={20} /></button>
                  {activeMenuId === nic.id && (
                    <div style={{ position: 'absolute', right: 0, top: '100%', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px', boxShadow: 'var(--modal-shadow)', zIndex: 9999, padding: '8px', minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                      <button 
                        onClick={() => {
                          setActiveMenuId(null);
                          setLedgerItem({ item_master_id: nic.item_master_id, sn: nic.sn, brand: nic.brand, model: nic.model, type: nic.type, current_stock: 1 });
                        }} 
                        style={{ ...menuButtonStyle, color: 'var(--text-main)' }}
                      >
                        <History size={14} /> 履歷 (History)
                      </button>
                      <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '2px 0' }} />
                      <button onClick={() => { setActiveMenuId(null); handleEdit(nic); }} style={menuButtonStyle}><Edit2 size={14} /> 編輯詳細資訊</button>
                      <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
                      <button onClick={() => handleUpdateStatus(nic.id, nic.sn, 'ACTIVE', '在庫')} style={{ ...menuButtonStyle, color: '#10b981' }}><CheckCircle size={14} /> 標記為在庫</button>
                      <button onClick={() => handleUpdateStatus(nic.id, nic.sn, 'SHIPPED', '已出貨')} style={{ ...menuButtonStyle, color: '#3b82f6' }}><ShoppingBag size={14} /> 標記為出貨</button>
                      <button onClick={() => handleUpdateStatus(nic.id, nic.sn, 'LENT', '借出')} style={{ ...menuButtonStyle, color: '#f59e0b' }}><Send size={14} /> 標記為借出</button>
                      <button onClick={() => handleUpdateStatus(nic.id, nic.sn, 'REPAIR', '故障')} style={{ ...menuButtonStyle, color: '#ef4444' }}><AlertTriangle size={14} /> 標記為故障</button>
                      <button onClick={() => handleUpdateStatus(nic.id, nic.sn, 'SCRAPPED', '報廢')} style={{ ...menuButtonStyle, color: 'var(--text-subtle)' }}><ShieldAlert size={14} /> 標記為報廢</button>
                      <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
                      <button onClick={() => handleDelete(nic)} style={{ ...menuButtonStyle, color: '#f43f5e' }}><Trash2 size={14} /> 刪除紀錄</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
          <button disabled={currentPage === 1} onClick={() => { setCurrentPage(prev => prev - 1); window.scrollTo(0, 0); }} style={{ ...navBtnStyle, opacity: currentPage === 1 ? 0.5 : 1 }}>上一頁</button>
          <span style={{ display: 'flex', alignItems: 'center', fontWeight: '800', color: 'var(--text-muted)' }}>第 {currentPage} 頁 / 共 {totalPages} 頁</span>
          <button disabled={currentPage === totalPages} onClick={() => { setCurrentPage(prev => prev + 1); window.scrollTo(0, 0); }} style={{ ...navBtnStyle, opacity: currentPage === totalPages ? 0.5 : 1 }}>下一頁</button>
        </div>
      )}
    </div>
  );

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {renderHeader()}
        {renderStats()}
        {filterType ? (
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
              <div>
                <label style={editLabelStyle}>廠牌 / 類型 / 型號 (鎖定)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" value={editItem.brand || ''} disabled style={{ ...editInputStyle, backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', width: '30%', cursor: 'not-allowed' }} />
                  <input type="text" value={editItem.type || ''} disabled style={{ ...editInputStyle, backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', width: '30%', cursor: 'not-allowed' }} />
                  <input type="text" value={editItem.model || ''} disabled style={{ ...editInputStyle, backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', flex: 1, cursor: 'not-allowed' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={editLabelStyle}>硬體序號<input type="text" value={editItem.sn || ''} onChange={(e) => setEditItem({ ...editItem, sn: e.target.value })} style={editInputStyle} /></label>
                <label style={editLabelStyle}>主機名稱 (HostName)<input type="text" value={editItem.hostname || ''} onChange={(e) => setEditItem({ ...editItem, hostname: e.target.value })} style={editInputStyle} /></label>
              </div>

              <div>
                <label style={editLabelStyle}>硬體規格 (Specification)</label>
                <textarea 
                  value={editItem.specification || ''} 
                  onChange={(e) => setEditItem({ ...editItem, specification: e.target.value })} 
                  style={{ ...editInputStyle, minHeight: '80px', lineHeight: '1.5' }} 
                  placeholder="請輸入型號詳細規格內容..."
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={editLabelStyle}>客戶名稱
                  <select value={editItem.client || ''} onChange={(e) => setEditItem({ ...editItem, client: e.target.value })} style={editInputStyle}>
                    <option value="">-- 未設定 --</option>
                    {customers.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
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
                <label style={editLabelStyle}>訂單日期<input type="date" value={editItem.temp_order_date || ''} onChange={(e) => setEditItem({ ...editItem, temp_order_date: e.target.value })} style={editInputStyle} /></label>
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
    </div>
  );
};

export default HwList;
