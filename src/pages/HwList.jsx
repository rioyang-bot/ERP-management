import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Edit2, X, Server, User, MapPin, MoreHorizontal, Trash2, ShoppingBag, AlertTriangle, CheckCircle, Save, Monitor, Settings, ShieldAlert, Archive, RotateCcw } from 'lucide-react';

const HwList = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const filterType = queryParams.get('type');

  const [nics, setNics] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState([]);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [showServerDetails, setShowServerDetails] = useState(true);

  // 當側邊欄分類變動時，清除搜尋關鍵字
  useEffect(() => {
    setSearchTerm('');
  }, [filterType]);

  const [showSyncConfig, setShowSyncConfig] = useState(false);
  const [availableFieldDefs, setAvailableFieldDefs] = useState([]);
  const [selectedSyncFields, setSelectedSyncFields] = useState(['hostname', 'os']);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editItem, setEditItem] = useState(null);

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
      temp_order_date: nic.custom_attributes?.order_date || ''
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
      parseInt(editItem.id, 10)
    ]);
    if (res.success) { 
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
    window.dispatchEvent(new CustomEvent('db-update'));
    setActiveMenuId(null);
  };

  const handleDelete = async (nic) => {
    const displayName = `${nic.brand} - ${nic.model} [${nic.sn || '未設定序號'}]`;
    if (!confirm(`確定要刪除硬體 [${displayName}] 嗎？`)) return;
    await window.electronAPI.namedQuery('deleteAsset', [nic.id]);
    window.dispatchEvent(new CustomEvent('db-update'));
    setActiveMenuId(null);
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case 'SHIPPED': return { label: '已出貨', color: '#1d4ed8', bgColor: '#dbeafe', borderColor: '#bfdbfe' };
      case 'REPAIR': return { label: '故障', color: '#b91c1c', bgColor: '#fee2e2', borderColor: '#fecaca' };
      case 'SCRAPPED': return { label: '已報廢', color: '#595959', bgColor: '#f5f5f5', borderColor: '#d9d9d9' };
      default: return { label: '在庫', color: '#047857', bgColor: '#dcfce7', borderColor: '#bbf7d0' };
    }
  };

  const containerStyle = { padding: '24px', backgroundColor: '#f1f5f9', minHeight: '100vh' };
  const cardStyle = { backgroundColor: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' };
  const thStyle = { textAlign: 'left', padding: '14px', borderBottom: '2px solid #f1f5f9', color: '#1e293b', fontSize: '13px', fontWeight: '900', backgroundColor: '#f8fafc' };
  const tdStyle = { padding: '14px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' };
  const navBtnStyle = { padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', fontWeight: '700' };
  const menuButtonStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#475569', borderRadius: '8px', textAlign: 'left' };
  const editLabelStyle = { display: 'block', fontWeight: '800', fontSize: '13px', marginBottom: '6px', color: '#475569' };
  const editInputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '13px' };

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const statusPriority = { 'REPAIR': 1, 'ACTIVE': 2, 'SHIPPED': 3, 'SCRAPPED': 4 };

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
    const newRetired = isRetired 
      ? retiredKeys.filter(k => k !== key)
      : [...retiredKeys, key];
    setRetiredKeys(newRetired);
    localStorage.setItem('hw_list_retired_keys', JSON.stringify(newRetired));
    window.dispatchEvent(new CustomEvent('retired-update'));
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '900', color: '#1e293b', cursor: 'pointer' }} onClick={() => { setSearchTerm(''); navigate('?'); }}>
          {filterType ? `${filterType} - 硬體清單` : '硬體列表 (Hardware List)'}
        </h2>
        {(filterType || searchTerm) && (
          <button 
            onClick={() => { setSearchTerm(''); navigate('?'); }}
            style={{ padding: '4px 12px', borderRadius: '20px', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
          >
            清除所有篩選 ×
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" id="showServerDetails" checked={showServerDetails} onChange={(e) => setShowServerDetails(e.target.checked)} style={{ cursor: 'pointer' }} />
          <label htmlFor="showServerDetails" style={{ fontSize: '13px', fontWeight: '700', color: '#64748b', cursor: 'pointer' }}>顯示伺服器同步資訊</label>
        </div>
        <button onClick={() => setShowSyncConfig(true)} style={{ padding: '10px 16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: '700', color: '#475569', gap: '6px' }}>
          <Settings size={16} /> 伺服器屬性顯示設定
        </button>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input type="text" placeholder="搜尋..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '10px 12px 10px 42px', borderRadius: '30px', border: '1.5px solid #e2e8f0', width: '200px' }} />
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
        <div style={{ marginTop: '32px', borderTop: '2px dashed #e2e8f0', paddingTop: '24px', gridColumn: 'span 6' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '900', color: '#64748b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Archive size={18} /> 汰舊 / 停用區塊 (Retired Items)
          </h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {list.map(st => (
              <div key={st.key} onClick={() => handleCardClick(st)} style={{ backgroundColor: 'white', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', cursor: 'pointer', minWidth: '220px', opacity: 0.6, position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}>
                <button onClick={(e) => toggleRetire(e, st.key)} style={{ position: 'absolute', top: '8px', right: '8px', border: 'none', background: '#f1f5f9', color: '#64748b', borderRadius: '4px', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="復原此卡片">
                  <RotateCcw size={14} />
                </button>
              <div style={{ marginBottom: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                <div style={{ fontSize: '12px', fontWeight: '900', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Monitor size={12} color="#64748b" /> {st.brand}
                </div>
                <div style={{ color: '#64748b', fontSize: '10px', fontWeight: '500', marginTop: '2px', paddingLeft: '16px' }}>
                  {st.type} - {st.model}
                </div>
              </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span>在庫</span><span style={{ color: '#166534', fontWeight: '800' }}>{st.active}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span>出貨</span><span style={{ color: '#1e40af', fontWeight: '800' }}>{st.shipped}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span>故障</span><span style={{ color: '#991b1b', fontWeight: '800' }}>{st.repair}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span>報廢</span><span style={{ color: '#475569', fontWeight: '800' }}>{st.scrapped}</span></div>
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
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            {activeMatches.map(st => {
              const isSelected = searchTerm && (`${st.brand} ${st.model}`).toLowerCase() === searchTerm.toLowerCase();
              return (
                <div 
                  key={st.key}
                  onClick={() => handleCardClick(st)}
                  style={{ 
                    backgroundColor: 'white', 
                    padding: '10px', 
                    borderRadius: '12px', 
                    border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0', 
                    boxShadow: isSelected ? '0 4px 6px -1px rgba(37, 99, 235, 0.2)' : '0 2px 4px rgba(0,0,0,0.02)',
                    cursor: 'pointer',
                    minWidth: '220px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  <button onClick={(e) => toggleRetire(e, st.key)} style={{ position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="將此卡片移至汰舊區">
                    <Archive size={14} />
                  </button>
                  <div style={{ marginBottom: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '900', color: isSelected ? '#2563eb' : '#1e293b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Monitor size={12} color={isSelected ? '#2563eb' : '#64748b'} /> {st.brand}
                    </div>
                    <div style={{ color: isSelected ? '#3b82f6' : '#64748b', fontSize: '11px', fontWeight: '500', marginTop: '2px', paddingLeft: '16px' }}>
                      {st.type} - {st.model}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}><span>在庫</span><span style={{ color: '#166534', fontWeight: '800' }}>{st.active}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}><span>出貨</span><span style={{ color: '#1e40af', fontWeight: '800' }}>{st.shipped}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}><span>故障</span><span style={{ color: '#991b1b', fontWeight: '800' }}>{st.repair}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}><span>報廢</span><span style={{ color: '#475569', fontWeight: '800' }}>{st.scrapped}</span></div>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', marginBottom: '24px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
        {slots.map((_, idx) => {
          const cardKey = layoutMap[idx];
          const st = statsMap[cardKey];
          return (
            <div key={idx} onDragOver={handleSlotDragOver} onDrop={(e) => handleDropOnSlot(e, idx)} style={{ minHeight: '100px', borderRadius: '12px', border: draggingCardKey ? '1px dashed #cbd5e1' : '1px solid transparent', backgroundColor: draggingCardKey ? 'rgba(255,255,255,0.5)' : 'transparent', transition: 'all 0.2s' }}>
              {st && (
                <div draggable onDragStart={(e) => handleCardDragStart(e, st.key)} onClick={() => handleCardClick(st)} style={{ backgroundColor: 'white', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', opacity: draggingCardKey === st.key ? 0.3 : 1, transform: 'scale(1)', transition: 'transform 0.1s', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                  <button onClick={(e) => toggleRetire(e, st.key)} style={{ position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="將此卡片移至汰舊區">
                    <Archive size={14} />
                  </button>
                  <div style={{ marginBottom: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px', overflow: 'hidden' }}>
                    <div style={{ fontSize: '12px', fontWeight: '900', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      <Monitor size={12} color="#64748b" /> {st.brand}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '10px', fontWeight: '500', marginTop: '1px', paddingLeft: '16px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {st.type} - {st.model}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span>在庫</span><span style={{ color: '#166534', fontWeight: '800' }}>{st.active}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span>出貨</span><span style={{ color: '#1e40af', fontWeight: '800' }}>{st.shipped}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span>故障</span><span style={{ color: '#991b1b', fontWeight: '800' }}>{st.repair}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span>報廢</span><span style={{ color: '#475569', fontWeight: '800' }}>{st.scrapped}</span></div>
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
    <div style={{ marginBottom: '20px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
            <th style={{ ...thStyle, textAlign: 'left', width: '200px' }}>廠牌 / 型號 / 類型</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>序號 (SN)</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>規格 (Spec)</th>
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
              <tr key={nic.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: nic.status === 'SCRAPPED' ? 0.6 : 1 }}>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 800, color: '#1e293b' }}>{nic.brand}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{nic.type} - {nic.model}</div>
                </td>
                <td style={{ ...tdStyle, fontWeight: 800, fontFamily: 'monospace', color: '#2563eb', whiteSpace: 'nowrap' }}>{nic.sn || '(未設定)'}</td>
                <td style={{ ...tdStyle, fontSize: '11px', color: '#64748b' }}>{nic.specification || '--'}</td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{nic.custom_attributes?.order_date || '--'}</td>
                <td style={tdStyle}>
                  <div style={{ color: '#6366f1', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Server size={12} /> {nic.custom_attributes?.server_sn || '--'}
                  </div>
                  {nic.server_hostname && (
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', paddingLeft: '16px' }}>
                      HostName: <b style={{ color: '#1e293b' }}>{nic.server_hostname}</b>
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
                            <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{label}:</span>
                            <span style={{ fontWeight: 600, color: def?.color || 'inherit' }}>{val}</span>
                          </div>
                        );
                      })}
                      {selectedSyncFields.every(id => {
                        if (id === 'hostname') return !nic.server_hostname;
                        if (id === 'os') return !nic.server_os;
                        return !serverAttrs[id];
                      }) && <span style={{ color: '#cbd5e1' }}>--</span>}
                    </div>
                  </td>
                )}
                <td style={tdStyle}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                      <User size={14} color="#64748b" /> {nic.server_client || nic.client || '--'}
                    </div>
                    {(nic.partner_contact || nic.partner_phone) && (
                      <div style={{ fontSize: '11px', color: '#64748b', paddingLeft: '18px' }}>
                        {nic.partner_contact} {nic.partner_phone}
                      </div>
                    )}
                  </div>
                </td>
                {showServerDetails && (
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={14} color="#64748b" /> {nic.server_location || '--'}
                    </div>
                  </td>
                )}
                <td style={{ ...tdStyle, width: '100px' }}><span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '800', backgroundColor: cfg.bgColor, color: cfg.color, border: `1px solid ${cfg.borderColor}`, whiteSpace: 'nowrap' }}>{cfg.label}</span></td>
                <td style={{ ...tdStyle, textAlign: 'center', width: '80px', position: 'relative' }}>
                  <button onClick={() => setActiveMenuId(activeMenuId === nic.id ? null : nic.id)} style={{ border: 'none', background: 'none', color: '#64748b' }}><MoreHorizontal size={20} /></button>
                  {activeMenuId === nic.id && (
                    <div style={{ position: 'absolute', right: 0, top: '100%', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)', zIndex: 9999, padding: '8px', minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                      <button onClick={() => handleEdit(nic)} style={menuButtonStyle}><Edit2 size={14} /> 編輯詳細資訊</button>
                      <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />
                      <button onClick={() => handleUpdateStatus(nic.id, nic.sn, 'ACTIVE', '在庫')} style={{ ...menuButtonStyle, color: '#047857' }}><CheckCircle size={14} /> 標記為在庫</button>
                      <button onClick={() => handleUpdateStatus(nic.id, nic.sn, 'SHIPPED', '已出貨')} style={{ ...menuButtonStyle, color: '#1d4ed8' }}><ShoppingBag size={14} /> 標記為出貨</button>
                      <button onClick={() => handleUpdateStatus(nic.id, nic.sn, 'REPAIR', '故障')} style={{ ...menuButtonStyle, color: '#b91c1c' }}><AlertTriangle size={14} /> 標記為故障</button>
                      <button onClick={() => handleUpdateStatus(nic.id, nic.sn, 'SCRAPPED', '報廢')} style={{ ...menuButtonStyle, color: '#e11d48' }}><ShieldAlert size={14} /> 標記為報廢</button>
                      <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />
                      <button onClick={() => handleDelete(nic)} style={{ ...menuButtonStyle, color: '#f43f5e', backgroundColor: '#fff1f2' }}><Trash2 size={14} /> 刪除紀錄</button>
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
          <span style={{ display: 'flex', alignItems: 'center', fontWeight: '800', color: '#475569' }}>第 {currentPage} 頁 / 共 {totalPages} 頁</span>
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
          <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px dashed #e2e8f0', marginTop: '20px' }}>
            <div style={{ color: '#94a3b8', fontSize: '15px', fontWeight: '500' }}>
              請點擊上方統計卡片，或從左側選單選擇分類來查看詳細清單
            </div>
            <div style={{ color: '#cbd5e1', fontSize: '12px', marginTop: '8px' }}>
              您也可以在右上角使用搜尋功能直接查找
            </div>
          </div>
        )}
      </div>

      {showSyncConfig && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'white', width: '450px', padding: '32px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '900' }}>伺服器屬性顯示設定</h2>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowSyncConfig(false)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
              {availableFieldDefs.map(def => {
                const id = def.id;
                const label = def.label;
                return (
                  <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedSyncFields.includes(id)} onChange={() => toggleSyncField(id)} />
                    <span style={{ fontSize: '14px' }}>{label}</span>
                  </label>
                );
              })}
            </div>
            <button onClick={handleSaveSyncPreference} style={{ width: '100%', padding: '12px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, marginTop: '24px' }}>儲存設定</button>
          </div>
        </div>
      )}

      {showEditModal && editItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', width: '500px', padding: '32px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}><h2>修改硬體資訊</h2><X size={24} style={{ cursor: 'pointer' }} onClick={() => setShowEditModal(false)} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={editLabelStyle}>廠牌 / 類型 / 型號 (鎖定)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" value={editItem.brand || ''} disabled style={{ ...editInputStyle, backgroundColor: '#f1f5f9', width: '30%', cursor: 'not-allowed' }} />
                  <input type="text" value={editItem.type || ''} disabled style={{ ...editInputStyle, backgroundColor: '#f1f5f9', width: '30%', cursor: 'not-allowed' }} />
                  <input type="text" value={editItem.model || ''} disabled style={{ ...editInputStyle, backgroundColor: '#f1f5f9', flex: 1, cursor: 'not-allowed' }} />
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={editLabelStyle}>對應伺服器 SN<input type="text" value={editItem.temp_server_sn || ''} onChange={(e) => setEditItem({ ...editItem, temp_server_sn: e.target.value })} style={editInputStyle} /></label>
                <label style={editLabelStyle}>訂單日期<input type="date" value={editItem.temp_order_date || ''} onChange={(e) => setEditItem({ ...editItem, temp_order_date: e.target.value })} style={editInputStyle} /></label>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '24px' }}>
                <button onClick={handleSave} style={{ flex: 1, padding: '14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>儲存變更</button>
                <button onClick={() => setShowEditModal(false)} style={{ padding: '14px 24px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HwList;
