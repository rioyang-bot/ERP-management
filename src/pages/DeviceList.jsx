import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Edit2, X, Save, MoreHorizontal, MoreVertical, MapPin, User, Trash2, CheckCircle, ShoppingBag, Wrench, ShieldAlert, Cpu, Archive, RotateCcw, Server, Send, History, Building2 } from 'lucide-react';
import ItemLedgerModal from '../components/ItemLedgerModal';
import { logUpdate, logDelete, logStatusChange } from '../utils/auditLogger';

const DeviceList = ({ isSplitMode = false }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeMenuId, setActiveMenuId] = useState(null); 
  const brandFilter = searchParams.get('brand');
  
  // 當側邊欄分類變動時，清除搜尋關鍵字
  useEffect(() => {
    setSearchTerm('');
  }, [brandFilter]);
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [editItem, setEditItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ show: false, msg: '', onConfirm: null });
  const [brandFieldConfigs, setBrandFieldConfigs] = useState({});
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [originalFieldIds, setOriginalFieldIds] = useState([]);
  const [expandedItems, setExpandedItems] = useState({}); // 控制摺疊狀態
  const [expandedLabItems, setExpandedLabItems] = useState({}); // 控制 LAB 耗材摺疊
  const [ledgerItem, setLedgerItem] = useState(null); // 品項履歷 Modal

  const statusConfig = {
    ACTIVE: { label: '在庫', color: '#047857', bgColor: '#dcfce7', borderColor: '#bbf7d0' },
    REPAIRING: { label: '異常/維修中', color: '#fa8c16', bgColor: '#fff7e6', borderColor: '#ffd591' },
    PENDING_SCRAP: { label: '停用/待報廢', color: '#595959', bgColor: '#f5f5f5', borderColor: '#d9d9d9' },
    SCRAPPED: { label: '已報廢', color: '#f5222d', bgColor: '#fff1f0', borderColor: '#ffccc7' },
    SHIPPED: { label: '已出貨', color: '#1d4ed8', bgColor: '#dbeafe', borderColor: '#bfdbfe' },
    LENT: { label: '借出/借用', color: '#b45309', bgColor: '#fef3c7', borderColor: '#fde68a' }
  };

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    let res = brandFilter 
      ? await window.electronAPI.namedQuery('fetchAssetsListByBrand', [brandFilter])
      : await window.electronAPI.namedQuery('fetchAssetsList');
    
    if (res.success) setItems(res.rows);
    setLoading(false);
  }, [brandFilter]);

  const fetchCustomers = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchCustomers');
    if (res.success) setCustomers(res.rows);
  }, []);

  const fetchSettings = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('getSystemSetting', ['brandFieldConfigs']);
    if (res.success && res.rows.length > 0) setBrandFieldConfigs(res.rows[0].value || {});
    const defsRes = await window.electronAPI.namedQuery('getSystemSetting', ['customFieldDefinitions']);
    if (defsRes.success && defsRes.rows.length > 0) setCustomFieldDefs(defsRes.rows[0].value || []);
  }, []);

  const fetchProjects = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchActiveProjects');
    if (res.success) setProjects(res.rows);
  }, []);

  useEffect(() => {
    const initPage = async () => {
      setCurrentPage(1);
      await Promise.all([fetchAssets(), fetchCustomers(), fetchSettings(), fetchProjects()]);
    };
    initPage();
  }, [fetchAssets, fetchCustomers, fetchSettings, fetchProjects]);

  const isFieldVisible = (brand, fieldId) => {
    if (!brand) return true;
    const config = brandFieldConfigs[brand] || {};
    return config[fieldId] !== undefined ? config[fieldId] : true;
  };

  const handleEditClick = (item) => {
    const f = { ...item };
    f.ownership = f.ownership || 'FOR_SALE';
    ['installed_date', 'customer_warranty_expire', 'system_date', 'warranty_expire'].forEach(k => {
      if (f[k]) {
        try { f[k] = new Date(f[k]).toISOString().split('T')[0]; } catch { f[k] = ''; }
      } else { f[k] = ''; }
    });
    let attrs = {};
    try { attrs = typeof f.custom_attributes === 'string' ? JSON.parse(f.custom_attributes) : (f.custom_attributes || {}); } catch { attrs = {}; }
    f.custom_attributes = attrs;
    f.contact_person = attrs.contact_person || f.partner_contact || '';
    f.contact_phone = attrs.contact_phone || f.partner_phone || '';
    setEditItem(f);
    setShowEditModal(true);
    setActiveMenuId(null);
  };

  const handleUpdateOwnership = async (id, sn, newOwnership, label) => {
    if (!window.confirm(`確定要將設備 [${sn || id}] 的資產歸屬變更為「${label}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('updateAssetOwnership', [newOwnership, id]);
    if (res.success) {
      logUpdate('DEVICE', sn || id, '設備', `變更設備資產歸屬為「${label}」`, { id, sn, newOwnership, label });
      window.dispatchEvent(new CustomEvent('db-update'));
      setActiveMenuId(null);
      fetchAssets();
    } else {
      alert('變更資產歸屬失敗：' + (res.error || '未知錯誤'));
    }
  };

  const handleDelete = async (id, sn) => {
    if (!window.confirm(`確定要刪除設備 [${sn}] 嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteAsset', [id]);
    if (res.success) {
      logDelete('DEVICE', sn || id, '設備', `刪除設備紀錄 [${sn || id}]`, { id, sn });
      setActiveMenuId(null);
      fetchAssets();
    }
  };

  const handleUpdateStatus = async (id, sn, newStatus, label) => {
    if (!window.confirm(`確定要變更為「${label}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('updateAssetStatus', [newStatus, id]);
    if (res.success) {
      logStatusChange('DEVICE', sn || id, '設備', '舊狀態', newStatus, `變更設備 [${sn || id}] 狀態為「${label}」`, { id, sn, newStatus, label });
      if (sn && (newStatus === 'ACTIVE' || newStatus === 'SHIPPED')) {
        const hwStatusMap = {
          'ACTIVE': 'ACTIVE',
          'SHIPPED': 'SHIPPED'
        };
        const targetHwStatus = hwStatusMap[newStatus];
        if (targetHwStatus) {
          await window.electronAPI.namedQuery('updateMountedHardwareStatus', [targetHwStatus, sn]);
        }
      }
      window.dispatchEvent(new CustomEvent('db-update'));
      setActiveMenuId(null);
      fetchAssets();
    }
  };

  const handleUpdate = async () => {
    await window.electronAPI.namedQuery('updateItemMasterSpecs', [editItem.specification || '', editItem.model, editItem.item_master_id]);
    const updatedCustomAttributes = {
      ...(editItem.custom_attributes || {}),
      contact_person: editItem.contact_person || '',
      contact_phone: editItem.contact_phone || ''
    };
    const res = await window.electronAPI.namedQuery('updateAssetDetails', [
        editItem.sn, editItem.client, editItem.hostname, editItem.location, editItem.installed_date || null,
        editItem.customer_warranty_expire || null, editItem.system_date || null, editItem.warranty_expire || null,
        editItem.os, editItem.nic, updatedCustomAttributes, editItem.ownership || 'FOR_SALE', editItem.id
    ]);
    if (res.success) {
      logUpdate('DEVICE', editItem.sn || editItem.id, `${editItem.brand || ''} ${editItem.model || ''}`, `編輯設備詳細資訊 [${editItem.sn || editItem.id}]`, {
        sn: editItem.sn,
        client: editItem.client,
        hostname: editItem.hostname,
        location: editItem.location,
        ownership: editItem.ownership,
        os: editItem.os,
        nic: editItem.nic
      });
      setShowEditModal(false);
      window.dispatchEvent(new CustomEvent('db-update'));
      fetchAssets();
    } else {
      alert('儲存失敗：' + (res.error || '未知錯誤'));
    }
  };

  const statusPriority = { 'REPAIRING': 1, 'LENT': 2, 'ACTIVE': 3, 'SHIPPED': 4, 'PENDING_SCRAP': 5, 'SCRAPPED': 6 };

  const sortedItems = items
    .filter(item => {
      const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(t => t);
      if (searchTerms.length === 0) return true;
      return searchTerms.every(term => 
        (item.sn || '').toLowerCase().includes(term) || (item.specification || '').toLowerCase().includes(term) ||
        (item.hostname || '').toLowerCase().includes(term) || (item.brand || '').toLowerCase().includes(term) ||
        (item.model || '').toLowerCase().includes(term) || (item.client || '').toLowerCase().includes(term) ||
        (item.location || '').toLowerCase().includes(term)
      );
    })
    .sort((a, b) => (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99));

  const totalPages = Math.ceil(sortedItems.length / itemsPerPage);
  const paginatedItems = sortedItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const [layoutMap, setLayoutMap] = useState(() => {
    const saved = localStorage.getItem('device_list_layout_map');
    return saved ? JSON.parse(saved) : {};
  });
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
    localStorage.setItem('asset_list_layout_map', JSON.stringify(newMap));
    setDraggingCardKey(null);
  };

  const [retiredKeys, setRetiredKeys] = useState(() => {
    const saved = localStorage.getItem('device_list_retired_keys');
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
        localStorage.setItem('device_list_retired_keys', JSON.stringify(newRetired));
        window.dispatchEvent(new CustomEvent('retired-update'));
        setConfirmModal({ show: false, msg: '', onConfirm: null });
      }
    });
  };


  const handleCardClick = (st) => {
    const target = [st.brand, st.model, st.specification].filter(Boolean).join(' ');
    if (searchTerm === target && brandFilter === st.brand) {
      setSearchTerm('');
      setSearchParams({});
    } else {
      if (brandFilter !== st.brand) {
        setSearchTerm('');
      }
      setSearchParams({ brand: st.brand });
      setTimeout(() => setSearchTerm(target), 50);
    }
    setCurrentPage(1);
  };

  const renderStats = () => {
    const statsMap = sortedItems.reduce((acc, curr) => {
      const brandStr = curr.brand || '未知';
      const typeStr = curr.type || '未分類';
      const modelStr = curr.model || '未設定型號';
      const specStr = (curr.specification || '').trim();
      const key = `${brandStr} - ${typeStr} - ${modelStr} - ${specStr}`;
      if (!acc[key]) acc[key] = { key, brand: brandStr, type: typeStr, model: modelStr, specification: specStr, active: 0, shipped: 0, repair: 0, scrapped: 0 };
      const s = curr.status;
      if (s === 'ACTIVE') acc[key].active++;
      else if (s === 'SHIPPED') acc[key].shipped++;
      else if (s === 'REPAIRING') acc[key].repair++;
      else if (s === 'PENDING_SCRAP' || s === 'SCRAPPED') acc[key].scrapped++;
      return acc;
    }, {});

    const allKeys = Object.keys(statsMap);
    const activeKeys = allKeys.filter(k => !retiredKeys.includes(k));
    const retiredList = allKeys.filter(k => retiredKeys.includes(k)).map(k => statsMap[k]);

    if (allKeys.length === 0) return null;

    if (brandFilter || searchTerm) {
      const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(t => t);
      const displayKeys = allKeys.filter(k => {
        const lk = k.toLowerCase();
        return searchTerms.every(t => lk.includes(t));
      });
      const activeMatches = displayKeys.filter(k => !retiredKeys.includes(k)).map(k => statsMap[k]);
      const retiredMatches = displayKeys.filter(k => retiredKeys.includes(k)).map(k => statsMap[k]);

      return (
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', padding: '16px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            {activeMatches.map(st => {
              const target = [st.brand, st.model, st.specification].filter(Boolean).join(' ');
              const isSelected = searchTerm && target && searchTerm.toLowerCase() === target.toLowerCase();
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
                      <Cpu size={12} color={isSelected ? 'var(--primary-color)' : 'var(--text-muted)'} /> {st.brand}
                    </div>
                    <div style={{ color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', fontSize: '10px', fontWeight: '700', marginTop: '2px', paddingLeft: '16px' }}>
                      {st.type} - {st.model}
                    </div>
                    {st.specification && (
                      <div style={{ color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', fontSize: '9px', fontWeight: '500', marginTop: '2px', paddingLeft: '16px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={st.specification}>
                        {st.specification}
                      </div>
                    )}
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

    // 1. 自動清理佈局：移除已不存在於 allKeys 的幽靈 Key
    const cleanedLayoutMap = {};
    Object.entries(layoutMap).forEach(([idx, key]) => {
      if (activeKeys.includes(key)) cleanedLayoutMap[idx] = key;
    });

    // 2. 檢查是否有漏掉的新 Key 需要加入
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
      localStorage.setItem('device_list_layout_map', JSON.stringify(updatedMap));
    }

    // 3. 根據清理後的佈局計算實際需要的行數
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
                      <Cpu size={12} color="var(--text-muted)" /> {st.brand}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: '700', marginTop: '1px', paddingLeft: '16px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {st.type} - {st.model}
                    </div>
                    {st.specification && (
                      <div style={{ color: 'var(--text-subtle)', fontSize: '9px', fontWeight: '500', marginTop: '1px', paddingLeft: '16px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={st.specification}>
                        {st.specification}
                      </div>
                    )}
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
                  <Cpu size={12} color="var(--text-muted)" /> {st.brand}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: '700', marginTop: '2px', paddingLeft: '16px' }}>
                  {st.type} - {st.model}
                </div>
                {st.specification && (
                  <div style={{ color: 'var(--text-subtle)', fontSize: '9px', fontWeight: '500', marginTop: '2px', paddingLeft: '16px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={st.specification}>
                    {st.specification}
                  </div>
                )}
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

  const containerStyle = { padding: '24px', backgroundColor: 'var(--bg-app)', minHeight: '100vh' };
  const cardStyle = { backgroundColor: 'var(--bg-surface)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', color: 'var(--text-main)' };
  const menuButtonStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderRadius: '8px', textAlign: 'left' };
  const editLabelStyle = { display: 'block', fontWeight: 800, fontSize: '13px', marginBottom: '6px', color: 'var(--text-muted)' };
  const editInputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '13px' };
  const navBtnStyle = { padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '700' };
  const thStyle = { padding: '14px', fontSize: '12px', color: 'var(--table-header-text)', fontWeight: '900' };
  const tdStyle = { padding: '14px', fontSize: '13px', color: 'var(--text-main)' };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>
                {brandFilter ? `${brandFilter} - 設備清單` : '設備列表 (Device List)'}
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>檢視全系統的獨立設備資產狀態、出入庫歷程及硬體搭載情況。</p>
            </div>
            {!isSplitMode && (
              <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <button
                  onClick={() => navigate('/device-split')}
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
                  新增設備 (Device Reg)
                </button>
              </div>
            )}
            {(brandFilter || searchTerm) && (
              <button 
                onClick={() => { setSearchTerm(''); setSearchParams({}); }}
                style={{ padding: '4px 12px', borderRadius: '20px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
              >
                清除所有篩選 ×
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <button onClick={() => {
              setOriginalFieldIds(customFieldDefs.map(d => d.id));
              setShowConfigModal(true);
            }} style={{ padding: '10px 16px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: '700', color: 'var(--text-main)', gap: '6px' }}>
               <Wrench size={16} style={{ marginRight: '6px' }} /> 自訂欄位
            </button>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
              <input type="text" placeholder="快速搜尋..." value={searchTerm} onChange={(e) => {setSearchTerm(e.target.value); setCurrentPage(1);}} style={{ padding: '10px 12px 10px 42px', borderRadius: '30px', border: '1.5px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', width: '300px', outline: 'none' }} />
            </div>
          </div>
        </div>

        {renderStats()}

        { (brandFilter || searchTerm) ? (
          <>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}>載入中...</div>
            ) : (
              paginatedItems.length > 0 ? (
                <>
                  <div style={{ marginBottom: '20px', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--table-header-bg)' }}>
                          <th style={{ ...thStyle, textAlign: 'left', width: '200px' }}>廠牌 / 型號 / 類型</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>序號 (SN)</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>規格 (Spec)</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>專案編號/名稱 (Project)</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>主機名稱</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>自訂設備屬性</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>搭載硬體</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>客戶</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>位置</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>保固資訊 (P/S/W/C)</th>
                          <th style={{ ...thStyle, textAlign: 'left', width: '100px' }}>狀態</th>
                          <th style={{ ...thStyle, textAlign: 'center', width: '80px' }}>功能</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedItems.map(item => {
                          const config = statusConfig[item.status] || statusConfig['ACTIVE'];
                          let attrs = {};
                          try { attrs = typeof item.custom_attributes === 'string' ? JSON.parse(item.custom_attributes) : (item.custom_attributes || {}); } catch { attrs = {}; }
                          
                          return (
                            <tr key={item.id} style={{ borderBottom: '1px solid var(--table-border)', backgroundColor: item.status === 'SCRAPPED' ? 'rgba(239, 68, 68, 0.08)' : 'transparent' }}>
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                <div style={{ fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {item.brand}
                                  {item.ownership === 'COMPANY' && (
                                    <span style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: '#8b5cf6', color: 'white', borderRadius: '4px', whiteSpace: 'nowrap' }}>公司資產</span>
                                  )}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.type} - {item.model}</div>
                              </td>
                              <td style={{ ...tdStyle, fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                                {item.sn}
                              </td>
                              <td style={{ ...tdStyle, fontSize: '11px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.specification}>{item.specification || '--'}</td>
                              <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--text-main)' }}>
                                {(() => {
                                  const pName = attrs.project_name;
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
                              <td style={tdStyle}>{item.hostname || '--'}</td>
                              <td style={{ ...tdStyle, fontSize: '11px', minWidth: '120px' }}>
                                {customFieldDefs.filter(f => isFieldVisible(brandFilter, f.id)).map(f => {
                                  const val = f.isNative ? item[f.id] : attrs[f.id];
                                  if (!val) return null;
                                  return (
                                    <div key={f.id} style={{ marginBottom: '2px', display: 'flex', gap: '4px' }}>
                                      <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{f.label}:</span>
                                      <span style={{ fontWeight: 600, color: f.color || 'inherit' }}>{val}</span>
                                    </div>
                                  );
                                })}
                                {customFieldDefs.filter(f => isFieldVisible(brandFilter, f.id)).every(f => !(f.isNative ? item[f.id] : attrs[f.id])) && '--'}
                              </td>

                              <td style={tdStyle}>
                                {item.components && item.components.length > 0 ? (
                                  <>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedItems(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                                      }}
                                      style={{ 
                                        fontSize: '10px', 
                                        color: '#818cf8', 
                                        backgroundColor: 'rgba(99, 102, 241, 0.15)', 
                                        border: '1px solid rgba(99, 102, 241, 0.3)', 
                                        borderRadius: '4px', 
                                        padding: '2px 6px', 
                                        cursor: 'pointer', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '4px', 
                                        fontWeight: 'bold', 
                                        outline: 'none' 
                                      }}
                                    >
                                      <Cpu size={10} /> 搭載硬體 ({item.components.length})
                                    </button>
                                    
                                    {expandedItems[item.id] && (
                                      <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px', paddingLeft: '4px', borderLeft: '2px solid var(--primary-color)' }}>
                                        {item.components.map((comp, idx) => (
                                          <div key={idx} style={{ fontSize: '10px', color: 'var(--text-main)', fontWeight: 'normal' }}>
                                            • {comp.brand} {comp.model} ({comp.sn})
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span style={{ color: 'var(--text-subtle)', fontSize: '11px' }}>-</span>
                                )}
                              </td>
                              <td style={tdStyle}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: 'var(--text-main)' }}>
                                    <User size={14} color="var(--text-muted)" /> {item.client || '--'}
                                  </div>
                                  {(item.partner_contact || item.partner_phone) && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '18px' }}>
                                      {item.partner_contact} {item.partner_phone}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td style={tdStyle}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-main)' }}>
                                  <MapPin size={14} color="var(--text-muted)" /> {item.location || '--'}
                                </div>
                              </td>
                               <td style={{ ...tdStyle, fontSize: '10px', whiteSpace: 'nowrap', minWidth: '150px' }}>
                                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
                                   <div><span style={{ color: '#3b82f6', fontWeight: 'bold' }}>P:</span> {item.installed_date ? new Date(item.installed_date).toLocaleDateString() : '--'}</div>
                                   <div><span style={{ color: '#10b981', fontWeight: 'bold' }}>S:</span> {item.system_date ? new Date(item.system_date).toLocaleDateString() : '--'}</div>
                                   <div><span style={{ color: '#ef4444', fontWeight: 'bold' }}>W:</span> {item.warranty_expire ? new Date(item.warranty_expire).toLocaleDateString() : '--'}</div>
                                   <div><span style={{ color: '#f59e0b', fontWeight: 'bold' }}>C:</span> {item.customer_warranty_expire ? new Date(item.customer_warranty_expire).toLocaleDateString() : '--'}</div>
                                 </div>
                               </td>

                              <td style={{ ...tdStyle, width: '100px' }}>
                                <span style={{ 
                                  padding: '4px 10px', 
                                  borderRadius: '20px', 
                                  fontSize: '11px', 
                                  fontWeight: '800',
                                  backgroundColor: config.bgColor,
                                  color: config.color,
                                  border: `1px solid ${config.borderColor}`,
                                  whiteSpace: 'nowrap'
                                }}>
                                  {config.label}
                                </span>
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'center', width: '80px', position: 'relative' }}>
                                <button onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                  <MoreHorizontal size={20} />
                                </button>
                                {activeMenuId === item.id && (
                                  <div style={{ position: 'absolute', right: 0, top: '100%', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px', boxShadow: 'var(--modal-shadow)', zIndex: 9999, padding: '8px', minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                    <button 
                                      onClick={() => {
                                        setActiveMenuId(null);
                                        setLedgerItem({ item_master_id: item.item_master_id, sn: item.sn, brand: item.brand, model: item.model, type: item.type, current_stock: 1 });
                                      }} 
                                      style={{ ...menuButtonStyle, color: 'var(--text-main)' }}
                                    >
                                      <History size={14} /> 履歷 (History)
                                    </button>
                                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '2px 0' }} />
                                    <button onClick={() => handleEditClick(item)} style={menuButtonStyle}><Edit2 size={14} /> 編輯詳細資訊</button>
                                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '2px 0' }} />
                                    {item.ownership === 'COMPANY' ? (
                                      <button 
                                        onClick={() => handleUpdateOwnership(item.id, item.sn, 'FOR_SALE', '一般銷售')} 
                                        style={{ ...menuButtonStyle, color: '#3b82f6', fontWeight: '700' }}
                                      >
                                        <RotateCcw size={14} /> 轉為一般銷售
                                      </button>
                                    ) : (
                                      <button 
                                        onClick={() => handleUpdateOwnership(item.id, item.sn, 'COMPANY', '公司資產')} 
                                        style={{ ...menuButtonStyle, color: '#8b5cf6', fontWeight: '700' }}
                                      >
                                        <Building2 size={14} /> 轉為公司資產
                                      </button>
                                    )}
                                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
                                    <button onClick={() => handleUpdateStatus(item.id, item.sn, 'ACTIVE', '在庫')} style={{ ...menuButtonStyle, color: '#10b981' }}><CheckCircle size={14} /> 標記為在庫</button>
                                    <button onClick={() => handleUpdateStatus(item.id, item.sn, 'SHIPPED', '已出貨')} style={{ ...menuButtonStyle, color: '#3b82f6' }}><ShoppingBag size={14} /> 標記為出貨</button>
                                    <button onClick={() => handleUpdateStatus(item.id, item.sn, 'LENT', '借出/借用')} style={{ ...menuButtonStyle, color: '#f59e0b' }}><Send size={14} /> 標記為借出</button>
                                    <button onClick={() => handleUpdateStatus(item.id, item.sn, 'REPAIRING', '異常維修')} style={{ ...menuButtonStyle, color: '#d97706' }}><Wrench size={14} /> 標記為維修</button>
                                    <button onClick={() => handleUpdateStatus(item.id, item.sn, 'SCRAPPED', '報廢')} style={{ ...menuButtonStyle, color: '#ef4444' }}><ShieldAlert size={14} /> 標記為報廢</button>
                                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
                                    <button onClick={() => handleDelete(item.id, item.sn)} style={{ ...menuButtonStyle, color: '#f43f5e' }}><Trash2 size={14} /> 刪除紀錄</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
                      <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} style={{ ...navBtnStyle, opacity: currentPage === 1 ? 0.5 : 1 }}>上一頁</button>
                      <span style={{ display: 'flex', alignItems: 'center', fontWeight: '800', color: 'var(--text-muted)' }}>第 {currentPage} 頁 / 共 {totalPages} 頁</span>
                      <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={{ ...navBtnStyle, opacity: currentPage === totalPages ? 0.5 : 1 }}>下一頁</button>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)', fontSize: '14px' }}>未找到符合條件的設備</div>
              )
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '16px', border: '1px dashed var(--border-color)', marginTop: '20px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '15px', fontWeight: '500' }}>
              請點擊上方統計卡片，或從左側選單選擇品牌來查看詳細清單
            </div>
            <div style={{ color: 'var(--text-subtle)', fontSize: '12px', marginTop: '8px' }}>
              您也可以在右上角使用搜尋功能直接查找
            </div>
          </div>
        )}
      </div>

      {showEditModal && editItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '60vw', maxWidth: '95vw', padding: '32px', borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--modal-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>修改詳細設備資訊</h2>
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

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>序號 / SN</label><input type="text" value={editItem.sn || ''} onChange={(e) => setEditItem({...editItem, sn: e.target.value})} style={editInputStyle} /></div>
                <div style={{ position: 'relative' }}>
                  <label style={editLabelStyle}>專案名稱 (Project)</label>
                  <input 
                    type="text" 
                    value={(editItem.custom_attributes && editItem.custom_attributes.project_name) || ''} 
                    onChange={(e) => {
                      setEditItem({...editItem, custom_attributes: {...editItem.custom_attributes, project_name: e.target.value}});
                    }} 
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
                        const searchStr = ((editItem.custom_attributes && editItem.custom_attributes.project_name) || '').toLowerCase();
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
                              setEditItem({...editItem, custom_attributes: {...editItem.custom_attributes, project_name: p.project_name}, showProjectDropdown: false});
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
                <div><label style={editLabelStyle}>主機名稱 (HostName)</label><input type="text" value={editItem.hostname || ''} onChange={(e) => setEditItem({...editItem, hostname: e.target.value})} style={editInputStyle} /></div>
              </div>

              <div><label style={editLabelStyle}>規格 (Specification)</label><textarea value={editItem.specification} onChange={(e) => setEditItem({...editItem, specification: e.target.value})} style={{ ...editInputStyle, minHeight: '80px', lineHeight: '1.5' }} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div>
                  <label htmlFor="edit-client-select" style={editLabelStyle}>客戶名稱</label>
                  <select 
                    id="edit-client-select"
                    value={editItem.client || ''} 
                    onChange={(e) => {
                      const newClient = e.target.value;
                      const matches = customers.filter(c => c.name === newClient);
                      const contactPerson = matches.length === 1 ? (matches[0].contact || '') : '';
                      const contactPhone = matches.length === 1 ? (matches[0].phone || '') : '';
                      setEditItem({
                        ...editItem,
                        client: newClient,
                        contact_person: contactPerson,
                        contact_phone: contactPhone
                      });
                    }} 
                    style={editInputStyle}
                  >
                    <option value="">請選擇</option>
                    {Array.from(new Set(customers.map(c => c.name))).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-contact-select" style={editLabelStyle}>聯絡人</label>
                  {(() => {
                    const matches = customers.filter(c => c.name === editItem.client);
                    if (matches.length > 1) {
                      return (
                        <select 
                          id="edit-contact-select"
                          value={editItem.contact_person || ''} 
                          onChange={(e) => {
                            const contactVal = e.target.value;
                            const found = matches.find(m => m.contact === contactVal);
                            setEditItem({
                              ...editItem,
                              contact_person: contactVal,
                              contact_phone: found ? (found.phone || '') : ''
                            });
                          }} 
                          style={editInputStyle}
                        >
                          <option value="">請選擇聯絡人</option>
                          {matches.map((m, idx) => (
                            <option key={idx} value={m.contact || ''}>
                              {m.contact || '無姓名'} ({m.phone || '無電話'})
                            </option>
                          ))}
                        </select>
                      );
                    } else {
                      return (
                        <input 
                          id="edit-contact-select"
                          type="text" 
                          value={editItem.contact_person || ''} 
                          onChange={(e) => setEditItem({ ...editItem, contact_person: e.target.value })}
                          placeholder="聯絡人姓名"
                          style={editInputStyle}
                        />
                      );
                    }
                  })()}
                </div>
                <div><label style={editLabelStyle}>放置位置 (Location)</label><input type="text" value={editItem.location || ''} onChange={(e) => setEditItem({...editItem, location: e.target.value})} style={editInputStyle} /></div>
              </div>
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>安裝日期 (Project Date)</label><input type="date" value={editItem.installed_date || ''} onChange={(e) => setEditItem({...editItem, installed_date: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>系統日期 (System Date)</label><input type="date" value={editItem.system_date || ''} onChange={(e) => setEditItem({...editItem, system_date: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>原廠保固到期 (Warranty Expire)</label><input type="date" value={editItem.warranty_expire || ''} onChange={(e) => setEditItem({...editItem, warranty_expire: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>客戶保固到期 (Cust Warranty)</label><input type="date" value={editItem.customer_warranty_expire || ''} onChange={(e) => setEditItem({...editItem, customer_warranty_expire: e.target.value})} style={editInputStyle} /></div>
              </div>
              {customFieldDefs.filter(f => isFieldVisible(editItem.brand, f.id)).length > 0 && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                  <div style={{ fontSize: '15px', fontWeight: '900', color: 'var(--primary-color)', marginBottom: '16px' }}>自訂設備屬性</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {customFieldDefs
                      .filter(f => isFieldVisible(editItem.brand, f.id))
                      .filter(f => !['sn', 'hostname', 'specification', 'client', 'location', 'installed_date', 'system_date', 'warranty_expire', 'customer_warranty_expire'].includes(f.id))
                      .map(f => {
                      let attrs = {};
                      try { attrs = typeof editItem.custom_attributes === 'string' ? JSON.parse(editItem.custom_attributes) : (editItem.custom_attributes || {}); } catch { attrs = {}; }
                      const val = f.isNative ? editItem[f.id] : attrs[f.id];
                      return (
                        <div key={f.id}>
                          <label style={{ ...editLabelStyle, color: f.color || 'var(--text-muted)' }}>{f.label}</label>
                          <input type="text" value={val || ''} onChange={(e) => {
                            if (f.isNative) setEditItem({...editItem, [f.id]: e.target.value});
                            else {
                               const na = { ...attrs, [f.id]: e.target.value };
                               setEditItem({...editItem, custom_attributes: na });
                            }
                          }} style={editInputStyle} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
                <button onClick={handleUpdate} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Save size={18}/> 儲存變更</button>
                <button onClick={() => setShowEditModal(false)} style={{ padding: '14px 24px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfigModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '600px', padding: '32px', borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--modal-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900', color: 'var(--text-main)' }}>自訂欄位設定</h2>
              <X size={24} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowConfigModal(false)} />
            </div>
            
            <div style={{ marginBottom: '32px' }}>
               <h3 style={{ fontSize: '16px', color: 'var(--primary-color)', marginBottom: '16px', fontWeight: '900' }}>1. 欄位管理</h3>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 {customFieldDefs
                   .filter(def => !['hostname', 'sn', 'specification', 'client', 'location', 'installed_date', 'system_date', 'warranty_expire', 'customer_warranty_expire'].includes(def.id))
                   .map((def) => {
                    const originalIdx = customFieldDefs.findIndex(d => d.id === def.id);
                    return (
                      <div key={def.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="color" value={def.color || '#1890ff'} onChange={(e) => {
                          const newDefs = [...customFieldDefs]; newDefs[originalIdx].color = e.target.value; setCustomFieldDefs(newDefs);
                        }} style={{ width: '36px', height: '36px', border: '1px solid var(--border-color)', cursor: 'pointer', backgroundColor: 'transparent' }} />
                        <input type="text" value={def.label} onChange={(e) => {
                          const newDefs = [...customFieldDefs]; newDefs[originalIdx].label = e.target.value; setCustomFieldDefs(newDefs);
                        }} style={{ ...editInputStyle, flex: 1 }} />
                        {!def.isNative && (
                          <button onClick={() => setCustomFieldDefs(customFieldDefs.filter(d => d.id !== def.id))} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}><Trash2 size={18}/></button>
                        )}
                      </div>
                    );
                  })}
                 <button onClick={() => setCustomFieldDefs([...customFieldDefs, { id: 'custom_'+Date.now(), label: '新欄位', isNative: false }])} style={{ padding: '10px', border: '2px dashed var(--border-color)', borderRadius: '10px', color: 'var(--primary-color)', backgroundColor: 'var(--bg-surface-subtle)', cursor: 'pointer' }}>+ 新增欄位</button>
               </div>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '16px', color: 'var(--primary-color)', marginBottom: '16px', fontWeight: '900' }}>2. 顯示欄位</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Array.from(new Set(items.map(i => i.brand).filter(Boolean))).map(brand => (
                  <div key={brand} style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: '12px', backgroundColor: 'var(--bg-surface-subtle)' }}>
                    <div style={{ fontWeight: 900, marginBottom: '8px', color: 'var(--text-main)' }}>{brand}</div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {customFieldDefs
                        .filter(def => !['hostname', 'sn', 'specification', 'client', 'location', 'installed_date', 'system_date', 'warranty_expire', 'customer_warranty_expire'].includes(def.id))
                        .map(def => (
                        <label key={def.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={isFieldVisible(brand, def.id)} onChange={(e) => {
                            const newConfig = { ...brandFieldConfigs };
                            if (!newConfig[brand]) newConfig[brand] = {};
                            newConfig[brand][def.id] = e.target.checked;
                            setBrandFieldConfigs(newConfig);
                          }} /> {def.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={async () => {
                // 找出被刪除的欄位 ID (原本有但現在沒了)
                const currentIds = customFieldDefs.map(d => d.id);
                const deletedIds = originalFieldIds.filter(id => !currentIds.includes(id));
                
                // 執行徹底刪除：從資料庫 custom_attributes 中移除這些 Key
                for (const id of deletedIds) {
                  await window.electronAPI.namedQuery('deleteCustomAttributeKey', [id]);
                }

                await window.electronAPI.namedQuery('upsertSystemSetting', ['customFieldDefinitions', customFieldDefs]);
                await window.electronAPI.namedQuery('upsertSystemSetting', ['brandFieldConfigs', brandFieldConfigs]);
                alert('設定已儲存 (已同步清理被刪除的屬性資料)'); 
                setShowConfigModal(false); 
                fetchSettings();
              }} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>儲存設定</button>
              <button onClick={() => setShowConfigModal(false)} style={{ padding: '14px 24px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {confirmModal.show && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11000, animation: 'fadeIn 0.2s' }}>
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

export default DeviceList;
