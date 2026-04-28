import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Edit2, X, Save, MoreHorizontal, MoreVertical, MapPin, User, Trash2, CheckCircle, ShoppingBag, Wrench, ShieldAlert, Cpu } from 'lucide-react';

const DeviceList = () => {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [activeMenuId, setActiveMenuId] = useState(null); 
  const brandFilter = searchParams.get('brand');
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [editItem, setEditItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [brandFieldConfigs, setBrandFieldConfigs] = useState({});
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [expandedItems, setExpandedItems] = useState({}); // 控制摺疊狀態
  const [expandedLabItems, setExpandedLabItems] = useState({}); // 控制 LAB 耗材摺疊

  const statusConfig = {
    ACTIVE: { label: '在庫', color: '#047857', bgColor: '#dcfce7', borderColor: '#bbf7d0' },
    REPAIRING: { label: '異常/維修中', color: '#fa8c16', bgColor: '#fff7e6', borderColor: '#ffd591' },
    PENDING_SCRAP: { label: '停用/待報廢', color: '#595959', bgColor: '#f5f5f5', borderColor: '#d9d9d9' },
    SCRAPPED: { label: '已報廢', color: '#f5222d', bgColor: '#fff1f0', borderColor: '#ffccc7' },
    SHIPPED: { label: '已出貨', color: '#1d4ed8', bgColor: '#dbeafe', borderColor: '#bfdbfe' }
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
    if (res.success) setCustomers(res.rows.map(r => r.name));
  }, []);

  const fetchSettings = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('getSystemSetting', ['brandFieldConfigs']);
    if (res.success && res.rows.length > 0) setBrandFieldConfigs(res.rows[0].value || {});
    const defsRes = await window.electronAPI.namedQuery('getSystemSetting', ['customFieldDefinitions']);
    if (defsRes.success && defsRes.rows.length > 0) setCustomFieldDefs(defsRes.rows[0].value || []);
  }, []);

  useEffect(() => {
    const initPage = async () => {
      setCurrentPage(1);
      await Promise.all([fetchAssets(), fetchCustomers(), fetchSettings()]);
    };
    initPage();
  }, [fetchAssets, fetchCustomers, fetchSettings]);

  const isFieldVisible = (brand, fieldId) => {
    if (!brand) return true;
    const config = brandFieldConfigs[brand] || {};
    return config[fieldId] !== undefined ? config[fieldId] : true;
  };

  const handleEditClick = (item) => {
    const f = { ...item };
    ['installed_date', 'customer_warranty_expire', 'system_date', 'warranty_expire'].forEach(k => {
      if (f[k]) {
        try { f[k] = new Date(f[k]).toISOString().split('T')[0]; } catch { f[k] = ''; }
      } else { f[k] = ''; }
    });
    setEditItem(f);
    setShowEditModal(true);
    setActiveMenuId(null);
  };

  const handleDelete = async (id, sn) => {
    if (!window.confirm(`確定要刪除設備 [${sn}] 嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteAsset', [id]);
    if (res.success) { setActiveMenuId(null); fetchAssets(); }
  };

  const handleUpdateStatus = async (id, sn, newStatus, label) => {
    if (!window.confirm(`確定要變更為「${label}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('updateAssetStatus', [newStatus, id]);
    if (res.success) { setActiveMenuId(null); fetchAssets(); }
  };

  const handleUpdate = async () => {
    await window.electronAPI.namedQuery('updateItemMasterSpecs', [editItem.specification || '', editItem.model, editItem.item_master_id]);
    const res = await window.electronAPI.namedQuery('updateAssetDetails', [
        editItem.sn, editItem.client, editItem.hostname, editItem.location, editItem.installed_date || null,
        editItem.customer_warranty_expire || null, editItem.system_date || null, editItem.warranty_expire || null,
        editItem.os, editItem.nic, editItem.custom_attributes || null, editItem.id
    ]);
    if (res.success) { setShowEditModal(false); fetchAssets(); }
  };

  const statusPriority = { 'REPAIRING': 1, 'ACTIVE': 2, 'SHIPPED': 3, 'PENDING_SCRAP': 4, 'SCRAPPED': 5 };

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

  const handleCardClick = (st) => {
    const target = `${st.brand} ${st.model}`;
    setSearchTerm(prev => prev === target ? '' : target);
    setCurrentPage(1);
  };

  const renderStats = () => {
    const statsMap = sortedItems.reduce((acc, curr) => {
      const brandStr = curr.brand || '未知';
      const typeStr = curr.type || '未分類';
      const modelStr = curr.model || '未設定型號';
      const key = `${brandStr} - ${typeStr} - ${modelStr}`;
      if (!acc[key]) acc[key] = { key, brand: brandStr, type: typeStr, model: modelStr, active: 0, shipped: 0, repair: 0, scrapped: 0 };
      const s = curr.status;
      if (s === 'ACTIVE') acc[key].active++;
      else if (s === 'SHIPPED') acc[key].shipped++;
      else if (s === 'REPAIRING') acc[key].repair++;
      else if (s === 'PENDING_SCRAP' || s === 'SCRAPPED') acc[key].scrapped++;
      return acc;
    }, {});

    const allKeys = Object.keys(statsMap);
    if (allKeys.length === 0) return null;

    if (brandFilter || searchTerm) {
      const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(t => t);
      const displayKeys = allKeys.filter(k => {
        const lk = k.toLowerCase();
        return searchTerms.every(t => lk.includes(t));
      });
      const activeStats = displayKeys.map(k => statsMap[k]);

      return (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          {activeStats.map(st => {
            const isSelected = searchTerm && st.model.toLowerCase() === searchTerm.toLowerCase();
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
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: '900', color: isSelected ? '#2563eb' : '#1e293b', marginBottom: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  <Cpu size={12} color={isSelected ? '#2563eb' : '#64748b'} style={{ marginRight: '4px' }} /> 
                  {st.brand} <span style={{ color: isSelected ? '#3b82f6' : '#64748b', fontSize: '11px', fontWeight: '500' }}>{st.type} - {st.model}</span>
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
      );
    }

    // 1. 自動清理佈局：移除已不存在於 allKeys 的幽靈 Key
    const cleanedLayoutMap = {};
    Object.entries(layoutMap).forEach(([idx, key]) => {
      if (allKeys.includes(key)) cleanedLayoutMap[idx] = key;
    });

    // 2. 檢查是否有漏掉的新 Key 需要加入
    const assignedKeys = Object.values(cleanedLayoutMap);
    const missingKeys = allKeys.filter(k => !assignedKeys.includes(k));
    
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', marginBottom: '24px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
        {slots.map((_, idx) => {
          const cardKey = layoutMap[idx];
          const st = statsMap[cardKey];
          return (
            <div key={idx} onDragOver={handleSlotDragOver} onDrop={(e) => handleDropOnSlot(e, idx)} style={{ minHeight: '100px', borderRadius: '12px', border: draggingCardKey ? '1px dashed #cbd5e1' : '1px solid transparent', backgroundColor: draggingCardKey ? 'rgba(255,255,255,0.5)' : 'transparent', transition: 'all 0.2s' }}>
              {st && (
                <div draggable onDragStart={(e) => handleCardDragStart(e, st.key)} onClick={() => handleCardClick(st)} style={{ backgroundColor: 'white', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', opacity: draggingCardKey === st.key ? 0.3 : 1, transform: 'scale(1)', transition: 'transform 0.1s' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                  <div style={{ fontSize: '11px', fontWeight: '900', color: '#1e293b', marginBottom: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }} title={st.key}>
                    <Cpu size={12} color="#64748b" /> {st.brand} <span style={{ color: '#64748b', fontSize: '10px', fontWeight: '500' }}>{st.type} - {st.model}</span>
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
      </div>
    );
  };

  const containerStyle = { padding: '24px', backgroundColor: '#f1f5f9', minHeight: '100vh' };
  const cardStyle = { backgroundColor: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' };
  const menuButtonStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#475569', borderRadius: '8px', textAlign: 'left' };
  const editLabelStyle = { display: 'block', fontWeight: 800, fontSize: '13px', marginBottom: '6px', color: '#475569' };
  const editInputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '13px' };
  const navBtnStyle = { padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', fontWeight: '700' };
  const thStyle = { padding: '14px', fontSize: '12px', color: '#1e293b', fontWeight: '900' };
  const tdStyle = { padding: '14px', fontSize: '13px' };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#1e293b', cursor: 'pointer' }} onClick={() => setSearchTerm('')}>
            {brandFilter ? `${brandFilter} - 設備清單` : '設備列表 (Device List)'}
          </h1>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <button onClick={() => setShowConfigModal(true)} style={{ padding: '10px 18px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: '700', color: '#445' }}>
               <Wrench size={16} style={{ marginRight: '6px' }} /> 自訂欄位
            </button>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input type="text" placeholder="快速搜尋..." value={searchTerm} onChange={(e) => {setSearchTerm(e.target.value); setCurrentPage(1);}} style={{ padding: '10px 12px 10px 42px', borderRadius: '30px', border: '1.5px solid #e2e8f0', width: '300px' }} />
            </div>
          </div>
        </div>

        {renderStats()}

        { (brandFilter || searchTerm) ? (
          <>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '100px', color: '#64748b' }}>載入中...</div>
            ) : (
              paginatedItems.length > 0 ? (
                <>
                  <div style={{ marginBottom: '20px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                          <th style={{ ...thStyle, textAlign: 'left', width: '200px' }}>廠牌 / 型號 / 類型</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>序號 (SN)</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>規格 (Spec)</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>主機名稱</th>
                          {/* 插入自訂欄位標題 */}
                          {customFieldDefs.filter(f => isFieldVisible(brandFilter, f.id)).map(f => (
                             <th key={f.id} style={{ ...thStyle, textAlign: 'left', color: f.color || '#64748b' }}>{f.label}</th>
                          ))}
                          <th style={{ ...thStyle, textAlign: 'left' }}>搭載硬體</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>LAB 耗材</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>客戶</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>位置</th>
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
                            <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: item.status === 'SCRAPPED' ? '#fff1f0' : 'transparent' }}>
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                <div style={{ fontWeight: 800, color: '#1e293b' }}>{item.brand}</div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>{item.type} - {item.model}</div>
                              </td>
                              <td style={{ ...tdStyle, fontWeight: 800, fontFamily: 'monospace', color: '#2563eb', whiteSpace: 'nowrap' }}>
                                {item.sn}
                              </td>
                              <td style={{ ...tdStyle, fontSize: '11px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.specification}>{item.specification || '--'}</td>
                              <td style={tdStyle}>{item.hostname || '--'}</td>
                              
                              {/* 插入自訂欄位數值 */}
                              {customFieldDefs.filter(f => isFieldVisible(brandFilter, f.id)).map(f => {
                                const val = f.isNative ? item[f.id] : attrs[f.id];
                                return (
                                  <td key={f.id} style={{ ...tdStyle, color: f.color || 'inherit' }}>
                                    {val || '--'}
                                  </td>
                                );
                              })}

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
                                        color: '#4f46e5', 
                                        backgroundColor: '#eef2ff', 
                                        border: '1px solid #c7d2fe', 
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
                                      <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px', paddingLeft: '4px', borderLeft: '2px solid #e0e7ff' }}>
                                        {item.components.map((comp, idx) => (
                                          <div key={idx} style={{ fontSize: '10px', color: '#4338ca', fontWeight: 'normal' }}>
                                            • {comp.brand} {comp.model} ({comp.sn})
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span style={{ color: '#cbd5e1', fontSize: '11px' }}>-</span>
                                )}
                              </td>

                              <td style={tdStyle}>
                                {item.lab_consumables && item.lab_consumables.length > 0 ? (
                                  <>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedLabItems(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                                      }}
                                      style={{ 
                                        fontSize: '10px', 
                                        color: '#7c3aed', 
                                        backgroundColor: '#f5f3ff', 
                                        border: '1px solid #ddd6fe', 
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
                                      <ShoppingBag size={10} /> LAB 耗材 ({item.lab_consumables.length})
                                    </button>
                                    {expandedLabItems[item.id] && (
                                      <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '4px', borderLeft: '2px solid #ddd6fe' }}>
                                        {item.lab_consumables.map((cons, idx) => (
                                          <div key={idx} style={{ fontSize: '10px', color: '#6d28d9', fontWeight: 'normal' }}>
                                            • {cons.brand} {cons.model} <span style={{ fontWeight: '800' }}>x{cons.quantity}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span style={{ color: '#cbd5e1', fontSize: '11px' }}>無號材</span>
                                )}
                              </td>

                              <td style={tdStyle}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                                    <User size={14} color="#64748b" /> {item.client || '--'}
                                  </div>
                                  {(item.partner_contact || item.partner_phone) && (
                                    <div style={{ fontSize: '11px', color: '#64748b', paddingLeft: '18px' }}>
                                      {item.partner_contact} {item.partner_phone}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td style={tdStyle}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <MapPin size={14} color="#64748b" /> {item.location || '--'}
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
                                <button onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
                                  <MoreHorizontal size={20} />
                                </button>
                                {activeMenuId === item.id && (
                                  <div style={{ position: 'absolute', right: 0, top: '100%', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 9999, padding: '8px', minWidth: '180px', display: 'flex', flexDirection: 'column', marginTop: '4px' }}>
                                    <button onClick={() => handleEditClick(item)} style={menuButtonStyle}><Edit2 size={14} /> 編輯詳細資訊</button>
                                    <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />
                                    <button onClick={() => handleUpdateStatus(item.id, item.sn, 'ACTIVE', '在庫')} style={{ ...menuButtonStyle, color: '#059669' }}><CheckCircle size={14} /> 標記為在庫</button>
                                    <button onClick={() => handleUpdateStatus(item.id, item.sn, 'SHIPPED', '已出貨')} style={{ ...menuButtonStyle, color: '#2563eb' }}><ShoppingBag size={14} /> 標記為出貨</button>
                                    <button onClick={() => handleUpdateStatus(item.id, item.sn, 'REPAIRING', '異常維修')} style={{ ...menuButtonStyle, color: '#d97706' }}><Wrench size={14} /> 標記為維修</button>
                                    <button onClick={() => handleUpdateStatus(item.id, item.sn, 'SCRAPPED', '報廢')} style={{ ...menuButtonStyle, color: '#dc2626' }}><ShieldAlert size={14} /> 標記為報廢</button>
                                    <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />
                                    <button onClick={() => handleDelete(item.id, item.sn)} style={{ ...menuButtonStyle, color: '#e11d48' }}><Trash2 size={14} /> 刪除紀錄</button>
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
                      <span style={{ display: 'flex', alignItems: 'center', fontWeight: '800', color: '#475569' }}>第 {currentPage} 頁 / 共 {totalPages} 頁</span>
                      <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={{ ...navBtnStyle, opacity: currentPage === totalPages ? 0.5 : 1 }}>下一頁</button>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '100px', color: '#94a3b8', fontSize: '14px' }}>未找到符合條件的設備</div>
              )
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px dashed #e2e8f0', marginTop: '20px' }}>
            <div style={{ color: '#94a3b8', fontSize: '15px', fontWeight: '500' }}>
              請點擊上方統計卡片，或從左側選單選擇品牌來查看詳細清單
            </div>
            <div style={{ color: '#cbd5e1', fontSize: '12px', marginTop: '8px' }}>
              您也可以在右上角使用搜尋功能直接查找
            </div>
          </div>
        )}
      </div>

      {showEditModal && editItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'white', width: '680px', padding: '32px', borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900' }}>修改詳細設備資訊</h2>
              <X size={24} style={{ cursor: 'pointer' }} onClick={() => setShowEditModal(false)} />
            </div>
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
                <div><label style={editLabelStyle}>序號 / SN</label><input type="text" value={editItem.sn || ''} onChange={(e) => setEditItem({...editItem, sn: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>主機名稱 (HostName)</label><input type="text" value={editItem.hostname || ''} onChange={(e) => setEditItem({...editItem, hostname: e.target.value})} style={editInputStyle} /></div>
              </div>

              <div><label style={editLabelStyle}>規格 (Specification)</label><textarea value={editItem.specification} onChange={(e) => setEditItem({...editItem, specification: e.target.value})} style={{ ...editInputStyle, minHeight: '80px', lineHeight: '1.5' }} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>客戶名稱</label><select value={editItem.client || ''} onChange={(e) => setEditItem({...editItem, client: e.target.value})} style={editInputStyle}>{customers.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label style={editLabelStyle}>放置位置 (Location)</label><input type="text" value={editItem.location || ''} onChange={(e) => setEditItem({...editItem, location: e.target.value})} style={editInputStyle} /></div>
              </div>
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>安裝日期 (Project Date)</label><input type="date" value={editItem.installed_date || ''} onChange={(e) => setEditItem({...editItem, installed_date: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>系統日期 (System Date)</label><input type="date" value={editItem.system_date || ''} onChange={(e) => setEditItem({...editItem, system_date: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>原廠保固到期 (Warranty Expire)</label><input type="date" value={editItem.warranty_expire || ''} onChange={(e) => setEditItem({...editItem, warranty_expire: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>客戶保固到期 (Cust Warranty)</label><input type="date" value={editItem.customer_warranty_expire || ''} onChange={(e) => setEditItem({...editItem, customer_warranty_expire: e.target.value})} style={editInputStyle} /></div>
              </div>
              {customFieldDefs.filter(f => isFieldVisible(editItem.brand, f.id)).length > 0 && (
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                  <div style={{ fontSize: '15px', fontWeight: '900', color: '#2563eb', marginBottom: '16px' }}>自訂設備屬性</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {customFieldDefs.filter(f => isFieldVisible(editItem.brand, f.id)).map(f => {
                      let attrs = {};
                      try { attrs = typeof editItem.custom_attributes === 'string' ? JSON.parse(editItem.custom_attributes) : (editItem.custom_attributes || {}); } catch { attrs = {}; }
                      const val = f.isNative ? editItem[f.id] : attrs[f.id];
                      return (
                        <div key={f.id}>
                          <label style={{ ...editLabelStyle, color: f.color || '#475569' }}>{f.label}</label>
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
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '24px' }}>
                <button onClick={handleUpdate} style={{ flex: 1, padding: '14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Save size={18}/> 儲存變更</button>
                <button onClick={() => setShowEditModal(false)} style={{ padding: '14px 24px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfigModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'white', width: '600px', padding: '32px', borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900' }}>自訂欄位設定</h2>
              <X size={24} style={{ cursor: 'pointer' }} onClick={() => setShowConfigModal(false)} />
            </div>
            
            <div style={{ marginBottom: '32px' }}>
               <h3 style={{ fontSize: '16px', color: '#2563eb', marginBottom: '16px', fontWeight: '900' }}>1. 欄位管理</h3>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 {customFieldDefs.map((def, i) => (
                   <div key={def.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                     <input type="color" value={def.color || '#1890ff'} onChange={(e) => {
                       const newDefs = [...customFieldDefs]; newDefs[i].color = e.target.value; setCustomFieldDefs(newDefs);
                     }} style={{ width: '36px', height: '36px', border: '1px solid #e2e8f0', cursor: 'pointer' }} />
                     <input type="text" value={def.label} onChange={(e) => {
                       const newDefs = [...customFieldDefs]; newDefs[i].label = e.target.value; setCustomFieldDefs(newDefs);
                     }} style={{ ...editInputStyle, flex: 1 }} />
                     {!def.isNative && (
                       <button onClick={() => setCustomFieldDefs(customFieldDefs.filter(d => d.id !== def.id))} style={{ color: '#ef4444', border: 'none', background: 'none' }}><Trash2 size={18}/></button>
                     )}
                   </div>
                 ))}
                 <button onClick={() => setCustomFieldDefs([...customFieldDefs, { id: 'custom_'+Date.now(), label: '新欄位', isNative: false }])} style={{ padding: '10px', border: '2px dashed #e2e8f0', borderRadius: '10px', color: '#2563eb', cursor: 'pointer' }}>+ 新增欄位</button>
               </div>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '16px', color: '#2563eb', marginBottom: '16px', fontWeight: '900' }}>2. 顯示欄位</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Array.from(new Set(items.map(i => i.brand).filter(Boolean))).map(brand => (
                  <div key={brand} style={{ padding: '16px', border: '1px solid #f1f5f9', borderRadius: '12px' }}>
                    <div style={{ fontWeight: 900, marginBottom: '8px' }}>{brand}</div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {customFieldDefs.map(def => (
                        <label key={def.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
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
                await window.electronAPI.namedQuery('upsertSystemSetting', ['customFieldDefinitions', customFieldDefs]);
                await window.electronAPI.namedQuery('upsertSystemSetting', ['brandFieldConfigs', brandFieldConfigs]);
                alert('設定已儲存'); setShowConfigModal(false); fetchSettings();
              }} style={{ flex: 1, padding: '14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700 }}>儲存設定</button>
              <button onClick={() => setShowConfigModal(false)} style={{ padding: '14px 24px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px' }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceList;
