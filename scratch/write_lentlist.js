const fs = require('fs');
const path = require('path');

const lentListContent = `import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Search, RefreshCw, Eye, CornerDownLeft, AlertCircle, History, Clock } from 'lucide-react';

const LentList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('SHIPPED'); // 'SHIPPED' | 'RETURNED'
  const [dnRecords, setDnRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [selectedDN, setSelectedDN] = useState(null);
  const [dnItems, setDnItems] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI.namedQuery('fetchLentRequests');
      if (res.success) {
        setDnRecords(res.rows || []);
      } else {
        setError('無法讀取清單：' + (res.error || '未知錯誤'));
      }
    } catch (err) {
      console.error('Fetch Lent List error:', err);
      setError('連線異常，請檢查伺服器是否正常啟動。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);

  const handleViewDetails = async (dn) => {
    setSelectedDN(dn);
    setIsModalOpen(true);
    setIsDetailLoading(true);
    try {
      const res = await window.electronAPI.namedQuery('fetchDNItems', [dn.id]);
      if (res.success) {
        setDnItems(res.rows);
      } else {
        alert('無法讀取明細：' + res.error);
      }
    } catch (err) {
      console.error('Fetch details error:', err);
      alert('讀取明細失敗');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleReturnToStock = async (dn) => {
    if (!window.confirm(\`確認要將借用單 [\${dn.request_no}] 標記為「已歸還」，並將相關設備入庫嗎？\`)) return;

    try {
      const res = await window.electronAPI.namedQuery('fetchDNItems', [dn.id]);
      if (!res.success) throw new Error('讀取明細失敗');
      const items = res.rows;
      
      for (const item of items) {
        if ((item.category_name === '硬體' || item.category_name === '設備') && item.sn) {
           const updateRes = await window.electronAPI.namedQuery('updateAssetStatusAndLocationBySn', ['ACTIVE', '', item.sn]);
           if (!updateRes.success) throw new Error(\`變更序號 [\${item.sn}] 狀態失敗。\`);
        }
      }

      const finalRes = await window.electronAPI.namedQuery('updateOutboundRequestStatus', ['RETURNED', dn.id]);
      if (!finalRes.success) throw new Error('變更借用單狀態失敗。');

      alert('歸還成功！設備已恢復為在庫狀態。');
      fetchRecords();

    } catch (err) {
      console.error('Return error:', err);
      alert('歸還過程中發生錯誤：\\n' + err.message);
    }
  };

  const filteredRecords = dnRecords.filter(dn => {
    if (dn.status !== activeTab) return false;
    
    const search = searchTerm.toLowerCase();
    if (!search) return true;
    return (dn.request_no || '').toLowerCase().includes(search) ||
           (dn.customer || '').toLowerCase().includes(search) ||
           (dn.project_name || '').toLowerCase().includes(search);
  });

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE) || 1;
  const currentRecords = filteredRecords.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const pendingCount = dnRecords.filter(dn => dn.status === 'SHIPPED').length;

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: '#1e293b' }}>
              <FileText size={26} color="#d97706" /> 硬體/設備借用列表
            </h1>
            <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>檢視所有借出中的設備紀錄，並可查詢歷史歸還紀錄。</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
           <div style={{ backgroundColor: '#fff', padding: '12px 24px', borderRadius: '12px', border: '1px solid #eee', display: 'flex', gap: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 600 }}>未歸還單據</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#d97706' }}>
                  {pendingCount} <span style={{ fontSize: '0.8rem', fontWeight: 400, opacity: 0.8 }}>單</span>
                </div>
              </div>
           </div>
           <button onClick={fetchRecords} className="btn-refresh-vibrant">
             <RefreshCw size={18} className={loading ? 'spinner' : ''} /> 重新整理
           </button>
        </div>
      </div>

      <div className="card-surface" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #eee', backgroundColor: '#fafafa' }}>
          <button 
            onClick={() => setActiveTab('SHIPPED')}
            style={{ 
              padding: '16px 24px', 
              border: 'none', 
              backgroundColor: activeTab === 'SHIPPED' ? '#fff' : 'transparent',
              borderBottom: activeTab === 'SHIPPED' ? '3px solid #d97706' : '3px solid transparent',
              color: activeTab === 'SHIPPED' ? '#d97706' : '#64748b',
              fontWeight: activeTab === 'SHIPPED' ? 800 : 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Clock size={18} /> 借出中 (待歸還)
          </button>
          <button 
            onClick={() => setActiveTab('RETURNED')}
            style={{ 
              padding: '16px 24px', 
              border: 'none', 
              backgroundColor: activeTab === 'RETURNED' ? '#fff' : 'transparent',
              borderBottom: activeTab === 'RETURNED' ? '3px solid #10b981' : '3px solid transparent',
              color: activeTab === 'RETURNED' ? '#10b981' : '#64748b',
              fontWeight: activeTab === 'RETURNED' ? 800 : 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <History size={18} /> 歷史紀錄 (已歸還)
          </button>
        </div>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', gap: '16px', alignItems: 'center', backgroundColor: '#fff' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
            <div className="search-box-vibrant" style={{ flex: 1, maxWidth: '400px' }}>
              <Search size={18} />
              <input 
                type="text" 
                placeholder="搜尋單號、客戶名稱或專案名稱..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {error && (
          <div style={{ margin: '20px', padding: '16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle size={20} />
            <span style={{ fontWeight: 600 }}>{error}</span>
          </div>
        )}

        <div style={{ overflowX: 'auto', padding: '0 24px 24px', backgroundColor: '#fff' }}>
          <table className="vibrant-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
            <thead style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>狀態</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>單據編號</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>借出日期</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>預計歸還日</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>客戶/對象</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>所屬專案</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>建立者</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800, textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>讀取中...</td></tr>
              ) : currentRecords.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  {activeTab === 'SHIPPED' ? '目前尚無借用中單據' : '目前尚無已歸還的歷史紀錄'}
                </td></tr>
              ) : currentRecords.map(dn => (
                <tr key={dn.id} className="row-hover" style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '12px' }}>
                    {dn.status === 'SHIPPED' ? (
                      <span style={{ backgroundColor: '#fef3c7', color: '#d97706', padding: '4px 8px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700 }}>借出中</span>
                    ) : (
                      <span style={{ backgroundColor: '#d1fae5', color: '#059669', padding: '4px 8px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700 }}>已歸還</span>
                    )}
                  </td>
                  <td style={{ padding: '12px', fontWeight: 600 }}>{dn.request_no}</td>
                  <td style={{ padding: '12px' }}>{new Date(dn.shipping_date).toLocaleDateString()}</td>
                  <td style={{ padding: '12px', color: dn.status === 'SHIPPED' ? '#d97706' : '#666', fontWeight: dn.status === 'SHIPPED' ? 600 : 400 }}>
                    {dn.expected_return_date ? new Date(dn.expected_return_date).toLocaleDateString() : '-'}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600 }}>{dn.customer}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                     {dn.project_name ? (
                        <span style={{ fontWeight: 600, color: '#4338ca', backgroundColor: '#e0e7ff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>
                          {dn.project_name}
                        </span>
                     ) : <span style={{ color: '#999', fontSize: '0.85rem' }}>-</span>}
                  </td>
                  <td style={{ padding: '12px', color: '#666', fontSize: '0.9rem' }}>{dn.creator_name || '系統'}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn-action-view" 
                        title="查看明細"
                        onClick={() => handleViewDetails(dn)}
                      >
                        <Eye size={16} />
                      </button>
                      {activeTab === 'SHIPPED' && (
                        <button 
                          style={{ padding: '6px 12px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                          title="歸還入庫"
                          onClick={() => handleReturnToStock(dn)}
                        >
                          <CornerDownLeft size={16} /> 歸還入庫
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px', gap: '12px', borderTop: '1px solid #eee', backgroundColor: '#fff' }}>
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                style={{ padding: '6px 14px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: currentPage === 1 ? '#f5f5f5' : '#fff', color: currentPage === 1 ? '#aaa' : '#333', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                上一頁
              </button>
              <span style={{ fontSize: '0.9rem', color: '#555', fontWeight: 600 }}>
                {currentPage} <span style={{ color: '#aaa', margin: '0 4px' }}>/</span> {totalPages}
              </span>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                style={{ padding: '6px 14px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: currentPage === totalPages ? '#f5f5f5' : '#fff', color: currentPage === totalPages ? '#aaa' : '#333', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                下一頁
              </button>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && selectedDN && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content dn-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '12px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="#d97706" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>借用明細</h3>
                  <span style={{ fontSize: '0.75rem', color: '#666' }}>{selectedDN.request_no}</span>
                </div>
              </div>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            
            <div className="modal-body" style={{ padding: '8px 20px' }}>
              <div className="dn-summary" style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '12px', padding: '10px 16px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0 }}>客戶對象:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem' }}>
                    {selectedDN.customer} 
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0 }}>狀態:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem' }}>
                    {selectedDN.status === 'SHIPPED' ? (
                      <span style={{ color: '#d97706', fontWeight: 700 }}>借出中</span>
                    ) : (
                      <span style={{ color: '#059669', fontWeight: 700 }}>已歸還</span>
                    )}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0 }}>借出日期:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem' }}>{new Date(selectedDN.shipping_date).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="dn-items-list">
                <h4 style={{ marginBottom: '8px', fontSize: '0.85rem', color: '#334155', fontWeight: 800 }}>項目清單 ({dnItems.length})</h4>
                <div className="dn-items-list-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                  <table className="dn-items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 10 }}>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#64748b' }}>類型</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#64748b' }}>項目詳情</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#64748b' }}>序號 (S/N)</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>數量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isDetailLoading ? (
                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>讀取中...</td></tr>
                      ) : dnItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px' }}>
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: '4px', 
                              fontSize: '0.7rem', 
                              fontWeight: 700,
                              backgroundColor: item.category_name === '設備' ? '#e0e7ff' : (item.category_name === '硬體' ? '#fce7f3' : '#f1f5f9'),
                              color: item.category_name === '設備' ? '#4f46e5' : (item.category_name === '硬體' ? '#db2777' : '#64748b')
                            }}>
                              {item.category_name || '其他'}
                            </span>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.85rem' }}>{item.brand} {item.model}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{item.specification}</div>
                          </td>
                          <td style={{ padding: '12px' }}>
                            {item.sn ? (
                              <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                                {item.sn}
                              </span>
                            ) : <span style={{ color: '#aaa', fontSize: '0.8rem' }}>-</span>}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: 'var(--primary-color)' }}>
                            {item.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            
            <div className="modal-footer" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => setIsModalOpen(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LentList;
\`;

fs.writeFileSync(path.join(__dirname, 'src', 'pages', 'LentList.jsx'), lentListContent);
console.log('LentList.jsx updated successfully.');
