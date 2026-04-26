import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Edit2, Trash2, X, Save, Box, Layers, MoreHorizontal } from 'lucide-react';

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

  const filteredItems = items.filter(item => {
    const s = searchTerm.toLowerCase();
    return (item.specification || '').toLowerCase().includes(s) || 
           (item.brand || '').toLowerCase().includes(s) || 
           (item.model || '').toLowerCase().includes(s) || 
           (item.type || '').toLowerCase().includes(s);
  });

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // --- 儀表板拖曳邏輯 ---
  const [layoutMap, setLayoutMap] = useState(() => {
    const saved = localStorage.getItem('consumable_list_layout_map');
    return saved ? JSON.parse(saved) : {};
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

  const handleCardClick = (st) => { setSearchTerm(st.model); setCurrentPage(1); };

  const renderStats = () => {
    const statsMap = filteredItems.reduce((acc, curr) => {
      const key = `${curr.type} - ${curr.model}`;
      if (!acc[key]) acc[key] = { key, type: curr.type, model: curr.model, qty: 0, safety: 0 };
      acc[key].qty += Number(curr.physical_qty || 0);
      acc[key].safety = Number(curr.safety_stock || 0);
      return acc;
    }, {});

    const allKeys = Object.keys(statsMap);
    if (allKeys.length === 0) return null;

    if (typeFilter || searchTerm) {
      const activeStats = allKeys.filter(k => k.toLowerCase().includes(searchTerm.toLowerCase())).map(k => statsMap[k]);
      return (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          {activeStats.map(st => (
            <div key={st.key} onClick={() => handleCardClick(st)} style={{ backgroundColor: 'white', padding: '10px', borderRadius: '12px', border: '2px solid #2563eb', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.1)', cursor: 'pointer', minWidth: '220px' }}>
              <div style={{ fontSize: '13px', fontWeight: '900', color: '#1e293b', marginBottom: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                <Box size={12} color="#2563eb" style={{ marginRight: '4px' }} /> {st.type} <span style={{ color: '#64748b', fontSize: '11px', fontWeight: '500' }}>{st.model}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>現有庫存</span>
                <span style={{ fontSize: '18px', fontWeight: '900', color: st.qty <= st.safety ? '#ef4444' : '#059669' }}>{st.qty}</span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    const assignedKeys = Object.values(layoutMap);
    const missingKeys = allKeys.filter(k => !assignedKeys.includes(k));
    if (missingKeys.length > 0) {
      const updatedMap = { ...layoutMap };
      let cur = 0;
      missingKeys.forEach(key => { while (updatedMap[cur]) cur++; updatedMap[cur] = key; });
      setLayoutMap(updatedMap);
      localStorage.setItem('consumable_list_layout_map', JSON.stringify(updatedMap));
    }

    const maxIdx = Object.keys(layoutMap).reduce((m, c) => Math.max(m, parseInt(c)), -1);
    const baseCount = Math.max(maxIdx + 1, allKeys.length);
    const slotsCount = Math.max(2, Math.ceil(baseCount / 6) + 1) * 6;
    const slots = Array.from({ length: slotsCount });

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', marginBottom: '24px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
        {slots.map((_, idx) => {
          const st = statsMap[layoutMap[idx]];
          return (
            <div key={idx} onDragOver={handleSlotDragOver} onDrop={(e) => handleDropOnSlot(e, idx)} style={{ minHeight: '100px', borderRadius: '12px', border: draggingCardKey ? '1px dashed #cbd5e1' : '1px solid transparent', backgroundColor: draggingCardKey ? 'rgba(255,255,255,0.5)' : 'transparent' }}>
              {st && (
                <div draggable onDragStart={(e) => handleCardDragStart(e, st.key)} onClick={() => handleCardClick(st)} style={{ backgroundColor: 'white', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', opacity: draggingCardKey === st.key ? 0.3 : 1 }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                  <div style={{ fontSize: '12px', fontWeight: '900', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <Box size={12} color="#64748b" style={{ marginRight: '4px' }} /> {st.type} <span style={{ color: '#64748b', fontSize: '10px', fontWeight: '500' }}>{st.model}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>庫存量</div>
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
  const thStyle = { textAlign: 'left', padding: '14px', borderBottom: '2px solid #f1f5f9', color: '#64748b', fontSize: '12px', fontWeight: '700' };
  const tdStyle = { padding: '14px', fontSize: '13px' };

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
                  <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                    <th style={thStyle}>廠牌 / 類型</th>
                    <th style={thStyle}>型號 (Model)</th>
                    <th style={thStyle}>規格內容</th>
                    <th style={thStyle}>單位</th>
                    <th style={{ ...thStyle, width: '100px' }}>目前庫存</th>
                    <th style={{ ...thStyle, width: '100px' }}>安全庫存</th>
                    <th style={{ ...thStyle, textAlign: 'center', width: '80px' }}>功能</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={tdStyle}><b>{item.brand}</b><br/><span style={{ color: '#64748b', fontSize: '11px' }}>{item.type}</span></td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{item.model}</td>
                      <td style={{ ...tdStyle, fontSize: '12px' }}>{item.specification}</td>
                      <td style={tdStyle}>{item.unit}</td>
                      <td style={{ ...tdStyle, fontWeight: 800, color: Number(item.physical_qty) <= Number(item.safety_stock) ? '#ef4444' : '#059669' }}>{item.physical_qty || 0}</td>
                      <td style={{ ...tdStyle, color: '#64748b' }}>{item.safety_stock}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                          <button onClick={() => { setEditItem({ ...item }); setShowEditModal(true); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><Edit2 size={18} /></button>
                          <button onClick={() => handleDelete(item.id, item.specification)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.6 }}><Trash2 size={18} /></button>
                        </div>
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
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'white', width: '500px', padding: '32px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}><h2 style={{ fontSize: '20px', fontWeight: '900' }}>修改耗材資訊</h2><X size={24} style={{ cursor: 'pointer' }} onClick={() => setShowEditModal(false)} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>廠牌</label><input type="text" value={editItem.brand || ''} onChange={(e) => setEditItem({...editItem, brand: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>類型</label><input type="text" value={editItem.type || ''} onChange={(e) => setEditItem({...editItem, type: e.target.value})} style={editInputStyle} /></div>
              </div>
              <div><label style={editLabelStyle}>型號 *</label><input type="text" value={editItem.model || ''} onChange={(e) => setEditItem({...editItem, model: e.target.value})} style={editInputStyle} /></div>
              <div><label style={editLabelStyle}>規格內容 *</label><textarea value={editItem.specification} onChange={(e) => setEditItem({...editItem, specification: e.target.value})} style={{ ...editInputStyle, minHeight: '80px' }} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>單位</label><input type="text" value={editItem.unit || ''} onChange={(e) => setEditItem({...editItem, unit: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>安全庫存</label><input type="number" value={editItem.safety_stock} onChange={(e) => setEditItem({...editItem, safety_stock: parseInt(e.target.value) || 0})} style={editInputStyle} /></div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={handleUpdate} style={{ flex: 1, padding: '14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>儲存變更</button>
                <button onClick={() => setShowEditModal(false)} style={{ padding: '14px 24px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const editLabelStyle = { display: 'block', fontWeight: 800, fontSize: '13px', marginBottom: '6px', color: '#475569' };
const editInputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '13px' };

export default ConsumableList;
