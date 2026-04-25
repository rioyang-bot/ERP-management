import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Edit2, Trash2, X, Save } from 'lucide-react';

const ConsumableList = () => {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const typeFilter = searchParams.get('type');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Modal states
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

    if (res.success) {
      setItems(res.rows);
    }
    setLoading(false);
  }, [typeFilter]);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchConsumables();
      setCurrentPage(1); // Reset page when filter changes
    });
  }, [fetchConsumables]);

  const handleDelete = async (id, specification) => {
    if (!window.confirm(`確定要刪除耗材 [${specification}] 嗎？此操作不可逆，將會移除所有紀錄。`)) return;
    const res = await window.electronAPI.namedQuery('deleteConsumableMaster', [id]);
    if (res.success) {
      alert('刪除成功');
      window.dispatchEvent(new Event('db-update'));
      
      const newItems = items.filter(i => i.id !== id);
      if (typeFilter && newItems.length === 0) {
        navigate('/consumable-list');
      } else {
        const newTotalPages = Math.ceil(newItems.length / itemsPerPage);
        if (currentPage > newTotalPages && newTotalPages > 0) {
          setCurrentPage(newTotalPages);
        }
        fetchConsumables();
      }
    } else {
      alert('刪除失敗：' + res.error);
    }
  };

  const handleUpdate = async () => {
    if (!editItem.specification || !editItem.model) return alert('請填寫必填欄位');
    
    const res = await window.electronAPI.namedQuery('updateConsumableMaster', [
        editItem.brand, editItem.type, editItem.model, 
        editItem.specification, editItem.unit, editItem.safety_stock,
        editItem.id
    ]);

    if (res.success) {
      alert('更新成功');
      setShowEditModal(false);
      fetchConsumables();
    } else {
      alert('更新失敗：' + res.error);
    }
  };

  const filteredItems = items.filter(item => {
    const search = searchTerm.toLowerCase();
    const spec = (item.specification || '').toLowerCase();
    const brand = (item.brand || '').toLowerCase();
    const model = (item.model || '').toLowerCase();
    const type = (item.type || '').toLowerCase();

    return spec.includes(search) || 
           brand.includes(search) || 
           model.includes(search) || 
           type.includes(search);
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className="asset-list-container">
      <div className="card-surface">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: '4px' }}>
              {typeFilter ? `${typeFilter} - 耗材清單` : '耗材列表 (Consumable List)'}
            </h1>
            <p style={{ color: '#666', fontSize: '0.9rem' }}>
              {typeFilter ? `顯示類型為 ${typeFilter} 的所有辦公耗材。` : '管理系統內所有辦公耗材、規格資訊及安全庫存。'}
            </p>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
            <input 
              type="text" 
              placeholder="搜尋廠牌、類型、型號、規格內容..." 
              value={searchTerm}
              onChange={handleSearchChange}
              style={{ 
                padding: '10px 12px 10px 40px', 
                borderRadius: '8px', 
                border: '1px solid #ddd', 
                width: '320px',
                fontSize: '0.95rem'
              }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '100px', color: 'var(--primary-color)' }}>載入中...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee', color: '#444' }}>
                  <th style={{ padding: '15px' }}>廠牌 / 類型</th>
                  <th style={{ padding: '15px' }}>型號 (Model)</th>
                  <th style={{ padding: '15px' }}>規格內容 (Specification)</th>
                  <th style={{ padding: '15px' }}>單位</th>
                  <th style={{ padding: '15px' }}>目前庫存</th>
                  <th style={{ padding: '15px' }}>安全庫存</th>
                  <th style={{ padding: '15px', textAlign: 'center' }}>功能</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f5f5f5', transition: 'background-color 0.2s' }}>
                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--primary-color)' }}>{item.brand || '--'}</div>
                      <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>{item.type}</div>
                    </td>
                    <td style={{ padding: '15px', fontWeight: 600 }}>{item.model || '--'}</td>
                    <td style={{ padding: '15px', fontSize: '0.9rem', color: '#444' }}>{item.specification}</td>
                    <td style={{ padding: '15px' }}>{item.unit}</td>
                    <td style={{ padding: '15px' }}>
                      <span style={{ 
                        fontWeight: 800, 
                        color: Number(item.physical_qty) <= Number(item.safety_stock) ? '#d32f2f' : '#2e7d32',
                        fontSize: '1.1rem'
                      }}>
                        {item.physical_qty || 0}
                      </span>
                    </td>
                    <td style={{ padding: '15px' }}>
                      <span style={{ 
                        color: '#666',
                        fontWeight: 400
                      }}>
                        {item.safety_stock}
                      </span>
                    </td>
                    <td style={{ padding: '15px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                        <button 
                          onClick={() => { setEditItem({ ...item }); setShowEditModal(true); }}
                          style={actionButtonStyle}
                          title="修改"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id, item.specification)}
                          style={{ ...actionButtonStyle, color: '#f5222d', opacity: 0.5 }}
                          title="刪除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '32px', paddingBottom: '20px' }}>
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  style={pageNavButtonStyle}
                >
                  上一頁
                </button>
                {[...Array(totalPages)].map((_, i) => (
                  <button 
                    key={i + 1}
                    onClick={() => setCurrentPage(i + 1)}
                    style={{ 
                      width: '38px', height: '38px', borderRadius: '8px', border: 'none',
                      backgroundColor: currentPage === i + 1 ? 'var(--primary-color)' : '#eee',
                      color: currentPage === i + 1 ? 'white' : '#666',
                      fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  style={pageNavButtonStyle}
                >
                  下一頁
                </button>
              </div>
            )}
            {paginatedItems.length === 0 && <div style={{ textAlign: 'center', padding: '60px', color: '#999' }}>查無相符結果</div>}
          </div>
        )}
      </div>

      {/* 編輯耗材 Modal */}
      {showEditModal && editItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="card-surface" style={{ width: '500px', padding: '32px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#333', fontWeight: 800 }}>修改詳細耗材資訊</h2>
              <X size={24} style={{ cursor: 'pointer', color: '#999' }} onClick={() => setShowEditModal(false)} />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>廠牌 (Brand)</label><input type="text" value={editItem.brand || ''} onChange={(e) => setEditItem({...editItem, brand: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>類型 (Type)</label><input type="text" value={editItem.type || ''} onChange={(e) => setEditItem({...editItem, type: e.target.value})} style={editInputStyle} /></div>
              </div>
              <div><label style={editLabelStyle}>型號 (Model) *</label><input type="text" value={editItem.model || ''} onChange={(e) => setEditItem({...editItem, model: e.target.value})} style={editInputStyle} /></div>
              <div><label style={editLabelStyle}>規格內容 (Specification) *</label><textarea value={editItem.specification} onChange={(e) => setEditItem({...editItem, specification: e.target.value})} style={{ ...editInputStyle, minHeight: '80px' }} /></div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>單位 (Unit)</label><input type="text" value={editItem.unit || ''} onChange={(e) => setEditItem({...editItem, unit: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>安全庫存</label><input type="number" value={editItem.safety_stock} onChange={(e) => setEditItem({...editItem, safety_stock: parseInt(e.target.value) || 0})} style={editInputStyle} /></div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', borderTop: '1px solid #eee', paddingTop: '24px' }}>
                <button onClick={handleUpdate} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}>確認儲存變更</button>
                <button onClick={() => setShowEditModal(false)} style={{ padding: '14px 32px', backgroundColor: '#f0f0f0', color: '#666', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const actionButtonStyle = { padding: '8px', borderRadius: '8px', border: '1px solid #eee', backgroundColor: '#fff', cursor: 'pointer', color: '#1890ff', display: 'flex' };
const pageNavButtonStyle = { padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#f5f5f5', cursor: 'pointer', color: '#666', fontWeight: 600 };
const editLabelStyle = { display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px', color: '#666' };
const editInputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box', outline: 'none' };

export default ConsumableList;
