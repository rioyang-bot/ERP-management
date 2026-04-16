import React, { useState, useEffect, useCallback } from 'react';
import { Search, Edit2, Trash2, ShieldAlert, CheckCircle, Package, Image as ImageIcon, X, Save, AlertTriangle, Wrench, PauseCircle } from 'lucide-react';
import ImageModal from '../components/ImageModal';

const AssetList = () => {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [editItem, setEditItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Status mapping for colors and labels
  const statusConfig = {
    ACTIVE: { label: '正常在庫', color: '#1890ff', bgColor: '#e6f7ff', borderColor: '#91d5ff' },
    REPAIRING: { label: '異常/維修中', color: '#fa8c16', bgColor: '#fff7e6', borderColor: '#ffd591' },
    PENDING_SCRAP: { label: '停用/待報廢', color: '#595959', bgColor: '#f5f5f5', borderColor: '#d9d9d9' },
    SCRAPPED: { label: '已報廢', color: '#f5222d', bgColor: '#fff1f0', borderColor: '#ffccc7' }
  };

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    const res = await window.electronAPI.dbQuery(`
      SELECT i.*, c.name as category_name 
      FROM items i 
      LEFT JOIN categories c ON i.category_id = c.id 
      WHERE c.name = '資訊設備' 
      ORDER BY i.id DESC
    `);
    if (res.success) {
      setItems(res.rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleDelete = async (id, sn) => {
    if (!window.confirm(`確定要刪除資產 [${sn}] 嗎？此操作不可逆，將會移除所有紀錄。`)) return;
    
    const res = await window.electronAPI.dbQuery('DELETE FROM items WHERE id = $1', [id]);
    if (res.success) {
      alert('刪除成功');
      fetchAssets();
    } else {
      alert('刪除失敗：' + res.error);
    }
  };

  const handleUpdateStatus = async (id, sn, newStatus, label) => {
    if (!window.confirm(`確定要將資產 [${sn}] 變更為「${label}」狀態嗎？`)) return;
    
    const res = await window.electronAPI.dbQuery("UPDATE items SET status = $1 WHERE id = $2", [newStatus, id]);
    if (res.success) {
      alert(`已成功變更為 ${label}`);
      fetchAssets();
    } else {
      alert('操作失敗：' + res.error);
    }
  };

  const handleUpdate = async () => {
    if (!editItem.sn || !editItem.specification) return alert('請填寫必填欄位');
    
    const res = await window.electronAPI.dbQuery(
      'UPDATE items SET sn = $1, specification = $2, custodian = $3, purchase_price = $4, currency = $5 WHERE id = $6',
      [editItem.sn, editItem.specification, editItem.custodian, editItem.purchase_price, editItem.currency, editItem.id]
    );

    if (res.success) {
      alert('更新成功');
      setShowEditModal(false);
      fetchAssets();
    } else {
      alert('更新失敗：' + res.error);
    }
  };

  const filteredItems = items.filter(item => 
    item.sn.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.specification.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.custodian && item.custodian.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.brand && item.brand.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Pagination logic
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page on search
  };

  const openPreview = (url) => {
    if (!url) return;
    setPreviewImage(url);
    setModalOpen(true);
  };

  return (
    <div className="asset-list-container">
      <div className="card-surface">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: '4px' }}>資產列表 (Asset List)</h1>
            <p style={{ color: '#666', fontSize: '0.9rem' }}>管理系統內所有資訊設備資產狀態與詳細資料。</p>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
            <input 
              type="text" 
              placeholder="搜尋序號、規格、保管人..." 
              value={searchTerm}
              onChange={handleSearchChange}
              style={{ 
                padding: '10px 12px 10px 40px', 
                borderRadius: '8px', 
                border: '1px solid #ddd', 
                width: '300px',
                fontSize: '0.9rem'
              }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>載入中...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee', color: '#555' }}>
                  <th style={{ padding: '12px' }}>縮圖</th>
                  <th style={{ padding: '12px' }}>廠牌 / 類型</th>
                  <th style={{ padding: '12px' }}>序號 / SN</th>
                  <th style={{ padding: '12px' }}>詳細規格</th>
                  <th style={{ padding: '12px' }}>保管人</th>
                  <th style={{ padding: '12px' }}>狀態</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>管理操作</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map(item => {
                  const config = statusConfig[item.status || 'ACTIVE'];
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f5f5f5', transition: 'background-color 0.2s' }}>
                      <td style={{ padding: '12px' }}>
                        <div 
                          onClick={() => openPreview(item.image_path ? window.getMediaUrl(`erp-media:///${item.image_path}`) : null)}
                          style={{ 
                            width: '40px', height: '40px', borderRadius: '6px', backgroundColor: '#e0e0e0',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: item.image_path ? 'pointer' : 'default', overflow: 'hidden'
                          }}
                        >
                          {item.image_path ? (
                            <img src={window.getMediaUrl(`erp-media:///${item.image_path}`)} alt={item.specification} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <ImageIcon size={20} color="#aaa" />
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{item.brand || '--'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>{item.type}</div>
                      </td>
                      <td style={{ padding: '12px', fontWeight: 500, fontFamily: 'monospace' }}>{item.sn}</td>
                      <td style={{ padding: '12px', fontSize: '0.9rem', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.specification}>
                        {item.specification}
                      </td>
                      <td style={{ padding: '12px' }}>{item.custodian || <span style={{ color: '#ccc' }}>未設定</span>}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ 
                          padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600,
                          backgroundColor: config.bgColor,
                          color: config.color,
                          border: `1px solid ${config.borderColor}`,
                          whiteSpace: 'nowrap'
                        }}>
                          {config.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                          <button 
                            onClick={() => { setEditItem({...item}); setShowEditModal(true); }}
                            style={{ padding: '6px', borderRadius: '6px', border: '1px solid #d9d9d9', backgroundColor: '#fff', cursor: 'pointer', color: '#1890ff' }}
                            title="修改"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleUpdateStatus(item.id, item.sn, 'REPAIRING', '異常/維修中')}
                            style={{ 
                              padding: '6px', borderRadius: '6px', border: '1px solid #d9d9d9', backgroundColor: '#fff', 
                              cursor: 'pointer', color: '#fa8c16' 
                            }}
                            title="異常/維修中"
                          >
                            <Wrench size={16} />
                          </button>
                          <button 
                            onClick={() => handleUpdateStatus(item.id, item.sn, 'PENDING_SCRAP', '停用/待報廢')}
                            style={{ 
                              padding: '6px', borderRadius: '6px', border: '1px solid #d9d9d9', backgroundColor: '#fff', 
                              cursor: 'pointer', color: '#595959' 
                            }}
                            title="停用/待報廢"
                          >
                            <PauseCircle size={16} />
                          </button>
                          <button 
                            onClick={() => handleUpdateStatus(item.id, item.sn, 'SCRAPPED', '已報廢')}
                            disabled={item.status === 'SCRAPPED'}
                            style={{ 
                              padding: '6px', borderRadius: '6px', border: '1px solid #d9d9d9', backgroundColor: '#fff', 
                              cursor: item.status === 'SCRAPPED' ? 'not-allowed' : 'pointer', 
                              color: item.status === 'SCRAPPED' ? '#ccc' : '#f5222d' 
                            }}
                            title="執行報廢"
                          >
                            <ShieldAlert size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(item.id, item.sn)}
                            style={{ padding: '6px', borderRadius: '6px', border: '1px solid #d9d9d9', backgroundColor: '#fff', cursor: 'pointer', color: '#f5222d', opacity: 0.6 }}
                            title="永久刪除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {paginatedItems.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>查無相符的資產項目</td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '24px', paddingBottom: '12px' }}>
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  style={{ 
                    padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', 
                    backgroundColor: '#fff', cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    color: currentPage === 1 ? '#ccc' : '#666'
                  }}
                >
                  上一頁
                </button>
                
                {[...Array(totalPages)].map((_, i) => (
                  <button 
                    key={i + 1}
                    onClick={() => setCurrentPage(i + 1)}
                    style={{ 
                      width: '36px', height: '36px', borderRadius: '6px', border: 'none',
                      backgroundColor: currentPage === i + 1 ? 'var(--primary-color)' : '#f5f5f5',
                      color: currentPage === i + 1 ? 'white' : '#666',
                      fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    {i + 1}
                  </button>
                ))}

                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  style={{ 
                    padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', 
                    backgroundColor: '#fff', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    color: currentPage === totalPages ? '#ccc' : '#666'
                  }}
                >
                  下一頁
                </button>
                
                <span style={{ marginLeft: '12px', fontSize: '0.9rem', color: '#888' }}>
                  共 {filteredItems.length} 筆資料
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 編輯資產 Modal */}
      {showEditModal && editItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card-surface" style={{ width: '500px', padding: '32px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit2 size={24} /> 修改資產資訊
              </h2>
              <X size={24} style={{ cursor: 'pointer', color: '#999' }} onClick={() => setShowEditModal(false)} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>序號 / SN</label>
                <input 
                  type="text" 
                  value={editItem.sn} 
                  onChange={(e) => setEditItem({...editItem, sn: e.target.value})}
                  style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>規格 (Specification)</label>
                <textarea 
                  value={editItem.specification} 
                  onChange={(e) => setEditItem({...editItem, specification: e.target.value})}
                  style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd', minHeight: '80px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>保管人</label>
                  <input 
                    type="text" 
                    value={editItem.custodian || ''} 
                    onChange={(e) => setEditItem({...editItem, custodian: e.target.value})}
                    style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>採購價格 ({editItem.currency})</label>
                  <input 
                    type="number" 
                    value={editItem.purchase_price || 0} 
                    onChange={(e) => setEditItem({...editItem, purchase_price: e.target.value})}
                    style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  onClick={handleUpdate}
                  style={{ 
                    flex: 1, padding: '14px', backgroundColor: 'var(--primary-color)', color: 'white', 
                    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                  }}
                >
                  <Save size={18} /> 確認更新
                </button>
                <button 
                  onClick={() => setShowEditModal(false)}
                  style={{ 
                    padding: '14px 24px', backgroundColor: '#f5f5f5', color: '#666', 
                    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ImageModal isOpen={modalOpen} imageUrl={previewImage} onClose={() => setModalOpen(false)} />
    </div>
  );
};

export default AssetList;
