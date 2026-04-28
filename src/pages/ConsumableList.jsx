import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Edit2, Trash2, X, Save, MoreHorizontal, ArrowLeftRight, ClipboardList, ShoppingBag, AlertTriangle } from 'lucide-react';

const editLabelStyle = { display: 'block', fontWeight: 800, fontSize: '13px', marginBottom: '6px', color: '#475569' };
const editInputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '13px', boxSizing: 'border-box' };
const modalOverlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)', padding: '20px' };
const modalContentStyle = { backgroundColor: 'white', width: '500px', padding: '32px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' };

const ConsumableList = () => {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const typeFilter = searchParams.get('type');
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [editItem, setEditItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferData, setTransferData] = useState({ 
    itemId: null, 
    direction: 'TO_LAB', // 'TO_LAB' or 'TO_STOCK'
    quantity: 1, 
    deviceSn: '', 
    note: '' 
  });
  const [allAssets, setAllAssets] = useState([]);
  const [currentLabUsage, setCurrentLabUsage] = useState([]);
  const [labAssignments, setLabAssignments] = useState([]);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [activeItemName, setActiveItemName] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);

  const fetchConsumables = useCallback(async () => {
    setLoading(true);
    let res;
    if (typeFilter) {
      res = await window.electronAPI.namedQuery('fetchConsumablesListByType', [typeFilter]);
    } else {
      res = await window.electronAPI.namedQuery('fetchConsumablesList');
    }
    if (res.success) setItems(res.rows);
    setLoading(false);
  }, [typeFilter]);

  useEffect(() => {
    fetchConsumables();
    setCurrentPage(1);
  }, [fetchConsumables, searchTerm, typeFilter]);

  const handleDelete = async (id, specification) => {
    if (!window.confirm(`確定要刪除耗材 [${specification}] 嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteConsumableMaster', [id]);
    if (res.success) {
      fetchConsumables();
    }
  };

  const handleUpdate = async () => {
    if (!editItem.specification || !editItem.model) return alert('請填寫必填欄位');
    const res = await window.electronAPI.namedQuery('updateConsumableMaster', [
        editItem.brand, editItem.type, editItem.model, 
        editItem.specification, editItem.unit, editItem.safety_stock,
        editItem.id
    ]);
    if (res.success) { setShowEditModal(false); fetchConsumables(); }
  };

  const handleTransferSubmit = async () => {
    const { itemId, direction, quantity, deviceSn, note } = transferData;
    if (quantity <= 0) return alert('請輸入大於 0 的數量');
    
    const targetItem = items.find(i => i.id === itemId);
    if (!targetItem) return;

    // 1. 檢查庫存是否足夠
    if (direction === 'TO_LAB' && targetItem.stock_qty < quantity) {
      return alert(`❌ Stock 庫存不足！\n目前庫存：${targetItem.stock_qty}\n欲移動數量：${quantity}`);
    }
    if (direction === 'TO_STOCK' && targetItem.lab_qty < quantity) {
      return alert(`❌ LAB 庫存不足！\n目前 LAB 數量：${targetItem.lab_qty}\n欲移回數量：${quantity}`);
    }

    // 2. 檢查序號對應
    let finalAssetId = null;
    const currentDeviceSn = (deviceSn || '').trim();
    
    if (currentDeviceSn) {
      const assetRes = await window.electronAPI.namedQuery('findAssetBySn', [currentDeviceSn]);
      if (assetRes.success && assetRes.rows.length > 0) {
        finalAssetId = assetRes.rows[0].id;
      } else {
        return alert(`❌ 無法移動：找不到序號為 [${currentDeviceSn}] 的設備。`);
      }
    } else if (direction === 'TO_LAB') {
      return alert('⚠️ 移至 LAB 時，請選擇欲對應的設備序號');
    }

    const query = direction === 'TO_LAB' ? 'transferStockToLab' : 'transferLabToStock';
    const res = await window.electronAPI.namedQuery(query, [quantity, itemId]);
    
    if (res.success) {
      // 只有在有選擇設備或移至 LAB 時才紀錄詳細 assignment
      if (finalAssetId || direction === 'TO_LAB') {
        const insertRes = await window.electronAPI.namedQuery('insertLabAssignment', [
          itemId, 
          finalAssetId, 
          direction === 'TO_LAB' ? quantity : -quantity, 
          direction === 'TO_LAB' ? note : `(從 ${currentDeviceSn || '未知設備'} 移回 Stock) ${note}`
        ]);
        if (!insertRes.success) {
          console.error('Assignment Log Error:', insertRes.error);
          // 不直接將系統錯誤顯示給使用者
        }
      }
      setShowTransferModal(false);
      fetchConsumables();
    } else {
      // 遵循規範 2：避免直接輸出系統預設錯誤訊息或日誌
      alert('⚠️ 庫存移動處理失敗，請確認資料格式或聯絡技術人員。');
    }
  };

  const viewAssignments = async (item) => {
    setActiveItemName(`${item.brand} ${item.type} - ${item.model}`);
    const res = await window.electronAPI.namedQuery('fetchLabAssignments', [item.id]);
    if (res.success) {
      setLabAssignments(res.rows);
      setShowAssignmentModal(true);
    }
  };

  const fetchAssets = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchAllAssetsForSelect');
    if (res.success) setAllAssets(res.rows);
  }, []);

  const fetchItemLabUsage = useCallback(async (itemId) => {
    const res = await window.electronAPI.namedQuery('fetchCurrentLabUsage', [itemId]);
    if (res.success) setCurrentLabUsage(res.rows);
  }, []);

  useEffect(() => {
    if (showTransferModal) {
      fetchAssets();
      if (transferData.itemId) fetchItemLabUsage(transferData.itemId);
    }
  }, [showTransferModal, transferData.itemId, fetchAssets, fetchItemLabUsage]);

  const filteredItems = items.filter(item => {
    const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(t => t);
    if (searchTerms.length === 0) return true;
    
    return searchTerms.every(term => 
      (item.specification || '').toLowerCase().includes(term) || 
      (item.brand || '').toLowerCase().includes(term) || 
      (item.model || '').toLowerCase().includes(term) || 
      (item.type || '').toLowerCase().includes(term)
    );
  });

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // --- 儀表板拖曳邏輯 ---
  const [layoutMap, setLayoutMap] = useState(() => {
    try {
      const saved = localStorage.getItem('consumable_list_layout_map');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error('Failed to parse layoutMap:', e);
      return {};
    }
  });
  const [draggingCardKey, setDraggingCardKey] = useState(null);

  const handleSlotDragOver = (e) => e.preventDefault();
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
    localStorage.setItem('consumable_list_layout_map', JSON.stringify(newMap));
    setDraggingCardKey(null);
  };

  const handleCardClick = (st) => {
    const target = `${st.brand} ${st.model}`;
    setSearchTerm(prev => prev === target ? '' : target);
    setCurrentPage(1);
  };

  const renderStats = () => {
    const statsMap = filteredItems.reduce((acc, curr) => {
      const brandStr = curr.brand || '未知';
      const key = `${brandStr} - ${curr.type} - ${curr.model}`;
      if (!acc[key]) acc[key] = { key, brand: brandStr, type: curr.type, model: curr.model, qty: 0, safety: 0 };
      acc[key].qty += (Number(curr.stock_qty || 0) + Number(curr.lab_qty || 0));
      acc[key].safety = Number(curr.safety_stock || 0);
      return acc;
    }, {});

    const allKeys = Object.keys(statsMap);
    if (allKeys.length === 0) return null;

    if (typeFilter || searchTerm) {
      const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(t => t);
      const activeStats = allKeys
        .filter(k => {
          const lk = k.toLowerCase();
          return searchTerms.every(t => lk.includes(t));
        })
        .map(k => statsMap[k]);
      return (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          {activeStats.map(st => (
            <div key={st.key} onClick={() => handleCardClick(st)} style={{ backgroundColor: 'white', padding: '10px', borderRadius: '12px', border: '2px solid #2563eb', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.1)', cursor: 'pointer', minWidth: '220px', position: 'relative' }}>
              {st.qty <= st.safety && (
                <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                  <AlertTriangle size={18} color="#ef4444" fill="white" />
                </div>
              )}
              <div style={{ fontSize: '11px', fontWeight: '900', color: '#1e293b', marginBottom: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                <ShoppingBag size={12} color="#2563eb" style={{ marginRight: '4px' }} /> {st.brand} <span style={{ color: '#64748b', fontSize: '10px', fontWeight: '500' }}>{st.type} - {st.model}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Total 庫存</span>
                <span style={{ fontSize: '18px', fontWeight: '900', color: (st.qty) <= st.safety ? '#ef4444' : '#059669' }}>{st.qty}</span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // 1. 自動清理佈局：移除已不存在於 allKeys 的 Key
    const cleanedLayoutMap = {};
    Object.entries(layoutMap).forEach(([idx, key]) => {
      if (allKeys.includes(key)) cleanedLayoutMap[idx] = key;
    });

    const assignedKeys = Object.values(cleanedLayoutMap);
    const missingKeys = allKeys.filter(k => !assignedKeys.includes(k));
    if (missingKeys.length > 0 || Object.keys(cleanedLayoutMap).length !== Object.keys(layoutMap).length) {
      const updatedMap = { ...cleanedLayoutMap };
      let cur = 0;
      missingKeys.forEach(key => { while (updatedMap[cur]) cur++; updatedMap[cur] = key; });
      setLayoutMap(updatedMap);
      localStorage.setItem('consumable_list_layout_map', JSON.stringify(updatedMap));
    }

    const maxIdx = Object.keys(cleanedLayoutMap).reduce((m, c) => Math.max(m, parseInt(c)), -1);
    const rows = Math.max(1, Math.ceil((maxIdx + 1) / 6) + (draggingCardKey ? 1 : 0));
    const slotsCount = rows * 6;
    const slots = Array.from({ length: slotsCount });

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', marginBottom: '24px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
        {slots.map((_, idx) => {
          const st = statsMap[layoutMap[idx]];
          return (
            <div key={idx} onDragOver={handleSlotDragOver} onDrop={(e) => handleDropOnSlot(e, idx)} style={{ minHeight: '100px', borderRadius: '12px', border: draggingCardKey ? '1px dashed #cbd5e1' : '1px solid transparent', backgroundColor: draggingCardKey ? 'rgba(255,255,255,0.5)' : 'transparent' }}>
              {st && (
                <div draggable onDragStart={(e) => handleCardDragStart(e, st.key)} onClick={() => handleCardClick(st)} style={{ backgroundColor: 'white', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', opacity: draggingCardKey === st.key ? 0.3 : 1, position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                  {st.qty <= st.safety && (
                    <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                      <AlertTriangle size={16} color="#ef4444" fill="white" />
                    </div>
                  )}
                  <div style={{ fontSize: '11px', fontWeight: '900', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={st.key}>
                    <ShoppingBag size={12} color="#64748b" style={{ marginRight: '4px' }} /> {st.brand} <span style={{ color: '#64748b', fontSize: '10px', fontWeight: '500' }}>{st.type} - {st.model}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>Total</div>
                    <div style={{ fontSize: '18px', fontWeight: '900', color: st.qty <= st.safety ? '#ef4444' : '#059669' }}>{st.qty}</div>
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
  const thStyle = { textAlign: 'left', padding: '14px', borderBottom: '2px solid #f1f5f9', color: '#1e293b', fontSize: '12px', fontWeight: '900' };
  const tdStyle = { padding: '14px', fontSize: '13px' };
  const menuButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    background: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#475569',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.2s'
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#1e293b', cursor: 'pointer' }} onClick={() => setSearchTerm('')}>
            {typeFilter ? `${typeFilter} - 耗材清單` : '耗材列表 (Consumable List)'}
          </h1>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input type="text" placeholder="快速搜尋..." value={searchTerm} onChange={(e) => {setSearchTerm(e.target.value); setCurrentPage(1);}} style={{ padding: '10px 12px 10px 42px', borderRadius: '30px', border: '1.5px solid #e2e8f0', width: '300px' }} />
          </div>
        </div>

        {renderStats()}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '100px', color: '#64748b' }}>載入中...</div>
        ) : (typeFilter || searchTerm) ? (
          <>
            <div style={{ marginBottom: '20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                    <th style={{ ...thStyle, width: '220px' }}>廠牌 / 型號 / 類型</th>
                    <th style={{ ...thStyle, width: '150px' }}>規格內容</th>
                    <th style={{ ...thStyle, width: '80px', textAlign: 'center', color: '#2563eb' }}>Stock</th>
                    <th style={{ ...thStyle, width: '80px', textAlign: 'center', color: '#7c3aed' }}>LAB</th>
                    <th style={{ ...thStyle, width: '80px', textAlign: 'center' }}>Total</th>
                    <th style={{ ...thStyle, width: '60px', textAlign: 'center' }}>單位</th>
                    <th style={{ ...thStyle, width: '100px', textAlign: 'center' }}>安全庫存</th>
                    <th style={{ ...thStyle, textAlign: 'center', width: '120px' }}>功能</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 800, color: '#1e293b' }}>{item.brand}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{item.type} - {item.model}</div>
                      </td>
                      <td style={{ ...tdStyle, fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }} title={item.specification}>{item.specification || '--'}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: '#2563eb', textAlign: 'center' }}>{item.stock_qty || 0}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: '#7c3aed', cursor: 'pointer', textDecoration: 'underline', textAlign: 'center' }} onClick={() => viewAssignments(item)}>{item.lab_qty || 0}</td>
                      <td style={{ ...tdStyle, fontWeight: 800, color: (Number(item.stock_qty)+Number(item.lab_qty)) <= Number(item.safety_stock) ? '#ef4444' : '#059669', textAlign: 'center' }}>{(Number(item.stock_qty)||0) + (Number(item.lab_qty)||0)}</td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: '#64748b' }}>{item.unit}</td>
                      <td style={{ ...tdStyle, color: '#64748b', textAlign: 'center' }}>{item.safety_stock}</td>
                      <td style={{ ...tdStyle, textAlign: 'center', width: '120px', position: 'relative' }}>
                        <button onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)} style={{ border: 'none', background: 'none', color: '#64748b', cursor: 'pointer' }}><MoreHorizontal size={20} /></button>
                        {activeMenuId === item.id && (
                          <div style={{ position: 'absolute', right: 0, top: '100%', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)', zIndex: 9999, padding: '8px', minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                            <button onClick={() => { setActiveMenuId(null); setEditItem({ ...item }); setShowEditModal(true); }} style={menuButtonStyle}><Edit2 size={14} /> 編輯詳細資訊</button>
                            <button onClick={() => { setActiveMenuId(null); setTransferData({ itemId: item.id, direction: 'TO_LAB', quantity: 1, deviceSn: '', note: '' }); setShowTransferModal(true); }} style={{ ...menuButtonStyle, color: '#2563eb' }}><ArrowLeftRight size={14} /> 庫存異動 (Stock↔LAB)</button>
                            <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />
                            <button onClick={() => { setActiveMenuId(null); handleDelete(item.item_id || item.id, item.specification); }} style={{ ...menuButtonStyle, color: '#f43f5e', backgroundColor: '#fff1f2' }}><Trash2 size={14} /> 刪除耗材</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
                  <button disabled={currentPage === 1} onClick={() => { setCurrentPage(prev => prev - 1); window.scrollTo(0,0); }} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', fontWeight: 700, opacity: currentPage === 1 ? 0.5 : 1 }}>上一頁</button>
                  <span style={{ display: 'flex', alignItems: 'center', fontWeight: '800', color: '#475569' }}>第 {currentPage} 頁 / 共 {totalPages} 頁</span>
                  <button disabled={currentPage === totalPages} onClick={() => { setCurrentPage(prev => prev + 1); window.scrollTo(0,0); }} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', fontWeight: 700, opacity: currentPage === totalPages ? 0.5 : 1 }}>下一頁</button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px dashed #e2e8f0', marginTop: '20px' }}>
            <div style={{ color: '#94a3b8', fontSize: '15px', fontWeight: '500' }}>請點擊上方統計卡片，或使用搜尋來查看詳細清單</div>
            <div style={{ color: '#cbd5e1', fontSize: '12px', marginTop: '8px' }}>安全庫存低於警告的項目將會以紅色標記</div>
          </div>
        )}
      </div>

      {showEditModal && editItem && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}><h2 style={{ fontSize: '20px', fontWeight: '900' }}>修改耗材資訊</h2><X size={24} style={{ cursor: 'pointer' }} onClick={() => setShowEditModal(false)} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={editLabelStyle}>廠牌 / 類型 / 型號 (鎖定)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" value={editItem.brand || ''} disabled style={{ ...editInputStyle, backgroundColor: '#f1f5f9', width: '30%', cursor: 'not-allowed' }} />
                  <input type="text" value={editItem.type || ''} disabled style={{ ...editInputStyle, backgroundColor: '#f1f5f9', width: '30%', cursor: 'not-allowed' }} />
                  <input type="text" value={editItem.model || ''} disabled style={{ ...editInputStyle, backgroundColor: '#f1f5f9', flex: 1, cursor: 'not-allowed' }} />
                </div>
              </div>
              
              <div>
                <label style={editLabelStyle}>規格內容 *</label>
                <textarea value={editItem.specification} onChange={(e) => setEditItem({...editItem, specification: e.target.value})} style={{ ...editInputStyle, minHeight: '80px', lineHeight: '1.5' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>單位</label><input type="text" value={editItem.unit || ''} onChange={(e) => setEditItem({...editItem, unit: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>安全庫存</label><input type="number" value={editItem.safety_stock} onChange={(e) => setEditItem({...editItem, safety_stock: parseInt(e.target.value) || 0})} style={editInputStyle} /></div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '24px' }}>
                <button onClick={handleUpdate} style={{ flex: 1, padding: '14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>儲存變更</button>
                <button onClick={() => setShowEditModal(false)} style={{ padding: '14px 24px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTransferModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900' }}>庫存移動 (Stock ↔ LAB)</h2>
              <X size={24} style={{ cursor: 'pointer' }} onClick={() => setShowTransferModal(false)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={editLabelStyle}>移動方向</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setTransferData({...transferData, direction: 'TO_LAB'})} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: transferData.direction === 'TO_LAB' ? '#2563eb' : 'white', color: transferData.direction === 'TO_LAB' ? 'white' : '#1e293b', fontWeight: 700, cursor: 'pointer' }}>移至 LAB</button>
                  <button onClick={() => setTransferData({...transferData, direction: 'TO_STOCK'})} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: transferData.direction === 'TO_STOCK' ? '#7c3aed' : 'white', color: transferData.direction === 'TO_STOCK' ? 'white' : '#1e293b', fontWeight: 700, cursor: 'pointer' }}>移回 Stock</button>
                </div>
              </div>
              <div>
                <label style={editLabelStyle}>數量 *</label>
                <input type="number" value={transferData.quantity} onChange={(e) => setTransferData({...transferData, quantity: parseInt(e.target.value)||0})} style={editInputStyle} />
              </div>
              <div>
                <label style={editLabelStyle}>
                  {transferData.direction === 'TO_LAB' ? '輸入或選擇設備 (Device SN) *' : '選擇退回來源設備 (FROM Device SN) *'}
                </label>
                {transferData.direction === 'TO_LAB' ? (
                  <>
                    <input 
                      list="asset-suggestions"
                      placeholder="輸入 SN 或從選單選擇..."
                      value={transferData.deviceSn}
                      onChange={(e) => setTransferData({...transferData, deviceSn: e.target.value})}
                      style={editInputStyle}
                    />
                    <datalist id="asset-suggestions">
                      {allAssets.map(asset => (
                        <option key={asset.id} value={asset.sn}>
                          {asset.hostname ? `${asset.hostname} - ` : ''}{asset.brand} {asset.model}
                        </option>
                      ))}
                    </datalist>
                  </>
                ) : (
                  <select 
                    value={transferData.deviceSn}
                    onChange={(e) => setTransferData({...transferData, deviceSn: e.target.value})}
                    style={editInputStyle}
                  >
                    <option value="">--- 選擇退回來源 ---</option>
                    {currentLabUsage.map(asset => (
                      <option key={asset.asset_id} value={asset.sn}>
                        [{asset.sn}] {asset.hostname ? `${asset.hostname} - ` : ''}{asset.brand} {asset.model} (現有: {asset.current_qty})
                      </option>
                    ))}
                  </select>
                )}
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  {transferData.direction === 'TO_LAB' ? '耗材將撥充至此設備 (可手動輸入或選取)' : '耗材將從此設備扣除並移回庫存'}
                </div>
              </div>
              <div>
                <label style={editLabelStyle}>備註</label>
                <input type="text" placeholder="例如：測試用途、維修領用" value={transferData.note} onChange={(e) => setTransferData({...transferData, note: e.target.value})} style={editInputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={handleTransferSubmit} style={{ flex: 1, padding: '14px', backgroundColor: transferData.direction === 'TO_LAB' ? '#2563eb' : '#7c3aed', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>確認移動</button>
                <button onClick={() => setShowTransferModal(false)} style={{ padding: '14px 24px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAssignmentModal && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalContentStyle, width: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900' }}>LAB 使用紀錄: {activeItemName}</h2>
              <X size={24} style={{ cursor: 'pointer' }} onClick={() => setShowAssignmentModal(false)} />
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
                    <th style={thStyle}>日期</th>
                    <th style={thStyle}>Device</th>
                    <th style={thStyle}>數量</th>
                    <th style={thStyle}>備註</th>
                  </tr>
                </thead>
                <tbody>
                  {labAssignments.length === 0 ? (
                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>尚無詳細使用紀錄</td></tr>
                  ) : (
                    labAssignments.map(la => (
                      <tr key={la.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ ...tdStyle, fontSize: '11px' }}>{new Date(la.created_at).toLocaleString()}</td>
                        <td style={tdStyle}>
                          {la.sn ? (
                            <div>
                              {la.hostname && <div style={{ fontWeight: 800 }}>{la.hostname}</div>}
                              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: la.hostname ? 'normal' : '800' }}>{la.sn}</div>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: la.quantity > 0 ? '#7c3aed' : '#ef4444' }}>{la.quantity > 0 ? `+${la.quantity}` : la.quantity}</td>
                        <td style={tdStyle}>{la.note || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <button onClick={() => setShowAssignmentModal(false)} style={{ width: '100%', marginTop: '24px', padding: '12px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>關閉</button>
          </div>
        </div>
      )}
    </div>
  );
};


export default ConsumableList;
