import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Search, Eye, CornerDownLeft, AlertCircle, History, Clock, CheckCircle } from 'lucide-react';
import { logStatusChange } from '../utils/auditLogger';

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
  const [returnModal, setReturnModal] = useState({ show: false, dn: null, date: new Date().toISOString().split('T')[0] });
  const [showOverdue, setShowOverdue] = useState(false);

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
  }, [activeTab, searchTerm, showOverdue]);

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

  const handleReturnToStockClick = (dn) => {
    setReturnModal({ show: true, dn, date: new Date().toISOString().split('T')[0] });
  };

  const executeReturnToStock = async () => {
    const { dn, date } = returnModal;
    if (!dn || !date) return;

    try {
      const res = await window.electronAPI.namedQuery('fetchDNItems', [dn.id]);
      if (!res.success) throw new Error('讀取明細失敗');
      const items = res.rows;
      
      for (const item of items) {
        if ((item.category_name === '硬體' || item.category_name === '設備') && item.sn) {
           const updateRes = await window.electronAPI.namedQuery('updateAssetStatusAndLocationBySn', ['ACTIVE', '', item.sn]);
           if (!updateRes.success) throw new Error(`變更序號 [${item.sn}] 狀態失敗。`);
        }
      }

      const finalRes = await window.electronAPI.namedQuery('updateOutboundRequestReturned', [dn.id, date]);
      if (!finalRes.success) throw new Error('變更借用單狀態失敗。');

      logStatusChange(
        'LENT',
        dn.request_no,
        dn.customer || '借用單',
        'SHIPPED',
        'RETURNED',
        `登記借用單 [${dn.request_no}] 歸還入庫 (歸還日: ${date}, 共 ${items.length} 項品項)`,
        { dnId: dn.id, dnNumber: dn.request_no, customer: dn.customer, returnDate: date, itemsCount: items.length, items: items.map(i => ({ model: i.model, brand: i.brand, sn: i.sn })) }
      );

      alert('歸還成功！設備已恢復為在庫狀態。');
      setReturnModal({ show: false, dn: null, date: '' });
      fetchRecords();

    } catch (err) {
      console.error('Return error:', err);
      alert('歸還過程中發生錯誤：\n' + err.message);
    }
  };

  const filteredRecords = dnRecords.filter(dn => {
    if (dn.status !== activeTab) return false;
    
    if (showOverdue && activeTab === 'SHIPPED') {
      const today = new Date().toISOString().split('T')[0];
      const returnDate = dn.expected_return_date ? new Date(dn.expected_return_date).toISOString().split('T')[0] : null;
      if (!returnDate || returnDate >= today) return false;
    }
    
    const search = searchTerm.toLowerCase();
    if (!search) return true;
    return (dn.request_no || '').toLowerCase().includes(search) ||
           (dn.customer || '').toLowerCase().includes(search) ||
           (dn.project_name || '').toLowerCase().includes(search) ||
           (dn.searchable_items || '').toLowerCase().includes(search);
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
            <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
              <FileText size={26} color="#f59e0b" /> 設備/硬體借用列表 (Device/HW Lent List)
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>檢視所有借出中的設備與硬體紀錄，並可查詢歷史歸還紀錄。</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
           <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '24px', boxShadow: 'var(--card-shadow)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>未歸還單據</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>
                  {pendingCount} <span style={{ fontSize: '0.8rem', fontWeight: 400, opacity: 0.8 }}>單</span>
                </div>
              </div>
           </div>
        </div>
      </div>

      <div className="card-surface" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <button 
            onClick={() => setActiveTab('SHIPPED')}
            style={{ 
              padding: '16px 24px', 
              border: 'none', 
              backgroundColor: activeTab === 'SHIPPED' ? 'var(--bg-surface)' : 'transparent',
              borderBottom: activeTab === 'SHIPPED' ? '3px solid #f59e0b' : '3px solid transparent',
              color: activeTab === 'SHIPPED' ? '#f59e0b' : 'var(--text-muted)',
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
              backgroundColor: activeTab === 'RETURNED' ? 'var(--bg-surface)' : 'transparent',
              borderBottom: activeTab === 'RETURNED' ? '3px solid #10b981' : '3px solid transparent',
              color: activeTab === 'RETURNED' ? '#10b981' : 'var(--text-muted)',
              fontWeight: activeTab === 'RETURNED' ? 800 : 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <CheckCircle size={18} /> 已結案 (歷史紀錄)
          </button>
        </div>

        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', backgroundColor: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
            <div style={{ position: 'relative', width: '320px' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
              <input 
                type="text" 
                placeholder="快速搜尋單號、客戶、專案、S/N..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '10px 12px 10px 40px', borderRadius: '20px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '0.9rem' }}
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')} 
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: '4px', display: 'flex', alignItems: 'center' }}
                >
                  ✕
                </button>
              )}
            </div>
            
            {activeTab === 'SHIPPED' && (
              <button
                onClick={() => setShowOverdue(!showOverdue)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: showOverdue ? 'none' : '1px solid var(--border-color)',
                  backgroundColor: showOverdue ? '#fee2e2' : 'var(--bg-surface-subtle)',
                  color: showOverdue ? '#ef4444' : 'var(--text-muted)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                🚨 僅顯示逾期未還
              </button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ margin: '20px', padding: '16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle size={20} />
            <span style={{ fontWeight: 600 }}>{error}</span>
          </div>
        )}

        <div style={{ overflowX: 'auto', padding: '0 24px 24px', backgroundColor: 'var(--bg-surface)' }}>
          <table className="vibrant-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
            <thead style={{ backgroundColor: 'var(--table-header-bg)', borderBottom: '2px solid var(--border-color)' }}>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>狀態</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>單據編號</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>借出日期</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>預計歸還日</th>
                {activeTab === 'RETURNED' && <th style={{ padding: '12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>實際歸還日</th>}
                <th style={{ padding: '12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>客戶/對象</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>所屬專案</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>建立者</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800, textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>讀取中...</td></tr>
              ) : currentRecords.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  {activeTab === 'SHIPPED' ? '目前尚無借用中單據' : '目前尚無已歸還的歷史紀錄'}
                </td></tr>
              ) : currentRecords.map(dn => (
                <tr key={dn.id} className="row-hover" style={{ borderBottom: '1px solid var(--table-border)', color: 'var(--text-main)' }}>
                  <td style={{ padding: '12px' }}>
                    {dn.status === 'SHIPPED' ? (
                      <span style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '4px 8px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700 }}>借出中</span>
                    ) : (
                      <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '4px 8px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700 }}>已歸還</span>
                    )}
                  </td>
                  <td style={{ padding: '12px', fontWeight: 700, color: 'var(--primary-color)' }}>{dn.request_no}</td>
                  <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{new Date(dn.shipping_date).toLocaleDateString()}</td>
                  <td style={{ padding: '12px', color: dn.status === 'SHIPPED' ? '#f59e0b' : 'var(--text-muted)', fontWeight: dn.status === 'SHIPPED' ? 700 : 400 }}>
                    {dn.expected_return_date ? new Date(dn.expected_return_date).toLocaleDateString() : '-'}
                  </td>
                  {activeTab === 'RETURNED' && (
                    <td style={{ padding: '12px', color: '#10b981', fontWeight: 600 }}>
                      {dn.actual_return_date ? new Date(dn.actual_return_date).toLocaleDateString() : '-'}
                    </td>
                  )}
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{dn.customer}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                     {dn.project_name ? (
                        <span style={{ fontWeight: 600, color: '#818cf8', backgroundColor: 'rgba(99, 102, 241, 0.15)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>
                          {dn.project_name}
                        </span>
                     ) : <span style={{ color: 'var(--text-subtle)', fontSize: '0.85rem' }}>-</span>}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{dn.creator_name || '系統'}</td>
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
                          onClick={() => handleReturnToStockClick(dn)}
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
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px', gap: '12px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)' }}>
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                style={{ padding: '6px 14px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: currentPage === 1 ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)', color: currentPage === 1 ? 'var(--text-subtle)' : 'var(--text-main)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                上一頁
              </button>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {currentPage} <span style={{ color: 'var(--text-subtle)', margin: '0 4px' }}>/</span> {totalPages}
              </span>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                style={{ padding: '6px 14px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: currentPage === totalPages ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)', color: currentPage === totalPages ? 'var(--text-subtle)' : 'var(--text-main)', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                下一頁
              </button>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && selectedDN && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content dn-modal" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="#f59e0b" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>借用明細</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedDN.request_no}</span>
                </div>
              </div>
              <button className="close-btn" onClick={() => setIsModalOpen(false)} style={{ color: 'var(--text-muted)' }}>&times;</button>
            </div>
            
            <div className="modal-body" style={{ padding: '8px 20px' }}>
              <div className="dn-summary" style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '12px', padding: '10px 16px', borderRadius: '8px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0, color: 'var(--text-muted)' }}>客戶對象:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600 }}>
                    {selectedDN.customer} 
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0, color: 'var(--text-muted)' }}>狀態:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem' }}>
                    {selectedDN.status === 'SHIPPED' ? (
                      <span style={{ color: '#f59e0b', fontWeight: 700 }}>借出中</span>
                    ) : (
                      <span style={{ color: '#10b981', fontWeight: 700 }}>已歸還</span>
                    )}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0, color: 'var(--text-muted)' }}>借出日期:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>{new Date(selectedDN.shipping_date).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="dn-items-list">
                <h4 style={{ marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 800 }}>項目清單 ({dnItems.length})</h4>
                <div className="dn-items-list-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                  <table className="dn-items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--table-header-bg)', zIndex: 10 }}>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--table-header-text)' }}>類型</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--table-header-text)' }}>項目詳情</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--table-header-text)' }}>序號 (S/N)</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--table-header-text)', textAlign: 'center' }}>數量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isDetailLoading ? (
                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>讀取中...</td></tr>
                      ) : dnItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--table-border)' }}>
                          <td style={{ padding: '12px' }}>
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: '4px', 
                              fontSize: '0.7rem', 
                              fontWeight: 700,
                              backgroundColor: item.category_name === '設備' ? 'rgba(79, 70, 229, 0.15)' : (item.category_name === '硬體' ? 'rgba(219, 39, 119, 0.15)' : 'var(--bg-surface-subtle)'),
                              color: item.category_name === '設備' ? '#818cf8' : (item.category_name === '硬體' ? '#f472b6' : 'var(--text-muted)')
                            }}>
                              {item.category_name || '其他'}
                            </span>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem' }}>{item.brand} {item.model}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{item.specification}</div>
                          </td>
                          <td style={{ padding: '12px' }}>
                            {item.sn ? (
                              <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '2px 6px', borderRadius: '4px' }}>
                                {item.sn}
                              </span>
                            ) : <span style={{ color: 'var(--text-subtle)', fontSize: '0.8rem' }}>-</span>}
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
            
            <div className="modal-footer" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border-color)' }}>
              <button 
                onClick={() => setIsModalOpen(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', fontWeight: 600, cursor: 'pointer' }}
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {returnModal.show && returnModal.dn && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ width: '400px', padding: '24px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>歸還入庫確認</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
              將單號 <strong style={{ color: 'var(--primary-color)' }}>{returnModal.dn.request_no}</strong> 標記為已歸還，並設定其實際歸還日期。相關設備將同步入庫。
            </p>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-main)' }}>
                歸還入庫日期
              </label>
              <input 
                type="date"
                value={returnModal.date}
                onChange={e => setReturnModal({ ...returnModal, date: e.target.value })}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setReturnModal({ show: false, dn: null, date: '' })}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', fontWeight: 600, cursor: 'pointer' }}
              >
                取消
              </button>
              <button 
                onClick={executeReturnToStock}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#10b981', color: 'white', fontWeight: 600, cursor: 'pointer' }}
              >
                確定歸還
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LentList;
