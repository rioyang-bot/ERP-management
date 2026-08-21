import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Search, Filter, Eye, RefreshCw, AlertCircle, Trash2, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DNList = ({ isSplitMode = false }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const searchOptions = [
    { value: 'all', label: '全部欄位' },
    { value: 'request_no', label: 'D/N 單號' },
    { value: 'customer', label: '客戶名稱' }
  ];

  const [dnRecords, setDnRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [selectedDN, setSelectedDN] = useState(null);
  const [dnItems, setDnItems] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, searchField, startDate, endDate]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI.namedQuery('fetchDNList');
      if (res.success) {
        setDnRecords(res.rows || []);
      } else {
        setError('無法讀取清單：' + (res.error || '未知錯誤'));
      }
    } catch (err) {
      console.error('Fetch DN List error:', err);
      if (err.message.includes('JSON')) {
        setError('伺服器資料解析失敗，請嘗試重新整理。');
      } else {
        setError('連線異常，請檢查伺服器是否正常啟動。');
      }
    } finally {
      setLoading(false);
    }
  }, []);

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

  const handleDelete = async (dn) => {
    if (!window.confirm(`確定要刪除出貨單 [${dn.request_no}] 嗎？\n此動作將一併移除所有關聯明細。`)) return;

    try {
      const res = await window.electronAPI.namedQuery('deleteOutboundRequest', [dn.id]);
      if (res.success) {
        alert('刪除成功');
        fetchRecords();
      } else {
        alert('刪除失敗：' + res.error);
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('刪除過程中發生錯誤');
    }
  };

  const handleConfirmDelivery = async () => {
    if (!selectedDN || !dnItems.length) return;
    if (!window.confirm(`確認要將出貨單 [${selectedDN.request_no}] 狀態設定為已出貨並扣除庫存嗎？`)) return;

    setIsConfirming(true);
    try {
      // 階段一：事前驗證 (Pre-check)
      for (const item of dnItems) {
        if (item.category_name === '耗材') {
          const res = await window.electronAPI.namedQuery('checkItemStock', [item.item_id]);
          if (!res.success || !res.rows.length) {
            throw new Error(`【${item.brand} ${item.model}】查無庫存資料，無法作業。`);
          }
          const currentStock = res.rows[0].stock_qty;
          if (currentStock < item.quantity) {
            throw new Error(`【${item.brand} ${item.model}】數量不足無法扣除 (目前庫存: ${currentStock}, 需要: ${item.quantity})。`);
          }
        } else if (item.category_name === '硬體' || item.category_name === '設備') {
          if (!item.sn) {
            throw new Error(`【${item.brand} ${item.model}】沒有對應的序號，無法出貨。`);
          }
          const res = await window.electronAPI.namedQuery('checkAssetActive', [item.sn]);
          if (!res.success || !res.rows.length) {
            throw new Error(`【${item.brand} ${item.model}】序號 ${item.sn} 查不到有效資料。`);
          }
          if (res.rows[0].status !== 'ACTIVE') {
            throw new Error(`【${item.brand} ${item.model}】序號 ${item.sn} 狀態為 ${res.rows[0].status}，非可用(ACTIVE)狀態。`);
          }
        }
      }

      // 階段二：正式變更 (Commit)
      for (const item of dnItems) {
        if (item.category_name === '耗材') {
           const res = await window.electronAPI.namedQuery('updateStockQtyOnOutbound', [item.quantity, item.item_id]);
           if (!res.success) throw new Error(`扣除耗材 [${item.brand} ${item.model}] 庫存時發生錯誤。`);
        } else if (item.category_name === '硬體' || item.category_name === '設備') {
           const destLocation = item.location || selectedDN.location;
           const assetStatus = selectedDN.request_type === 'LEND' ? 'LENT' : 'SHIPPED';
           const res = await window.electronAPI.namedQuery('updateAssetStatusAndLocationBySn', [assetStatus, destLocation, item.sn]);
           if (!res.success) throw new Error(`變更序號 [${item.sn}] 狀態時發生錯誤。`);
        }
      }

      // 更新出貨單狀態
      const finalRes = await window.electronAPI.namedQuery('updateOutboundRequestStatus', ['SHIPPED', selectedDN.id]);
      if (!finalRes.success) throw new Error('變更出貨單主檔狀態時發生錯誤。');

      alert('出貨成功！狀態已變更且相關庫存已扣除。');
      setIsModalOpen(false);
      fetchRecords();

    } catch (err) {
      console.error('Confirm delivery error:', err);
      // Fallback 秀出告警視窗 (透過原生 alert, 未來可更換為自訂 Modal)
      alert('⚠️ 異常告警\n\n確認出貨失敗：\n' + err.message);
    } finally {
      setIsConfirming(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const filteredRecords = dnRecords.filter(dn => {
    const search = searchTerm.toLowerCase();
    
    let matchSearch = true;
    if (searchField === 'all') {
      matchSearch = (dn.request_no || '').toLowerCase().includes(search) ||
             (dn.customer || '').toLowerCase().includes(search);
    } else if (searchField === 'request_no') {
      matchSearch = (dn.request_no || '').toLowerCase().includes(search);
    } else if (searchField === 'customer') {
      matchSearch = (dn.customer || '').toLowerCase().includes(search);
    }

    if (!matchSearch) return false;

    if (startDate || endDate) {
      const dnDate = new Date(dn.created_at || dn.shipping_date);
      dnDate.setHours(0,0,0,0);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0,0,0,0);
        if (dnDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(0,0,0,0);
        if (dnDate > end) return false;
      }
    }
    return true;
  });

  const sortedAndFiltered = [...filteredRecords].sort((a, b) => {
    const aIncomplete = a.status !== 'SHIPPED';
    const bIncomplete = b.status !== 'SHIPPED';
    if (aIncomplete && !bIncomplete) return -1;
    if (!aIncomplete && bIncomplete) return 1;
    return new Date(b.shipping_date) - new Date(a.shipping_date);
  });

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(sortedAndFiltered.length / ITEMS_PER_PAGE) || 1;
  const currentRecords = sortedAndFiltered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const pendingCount = dnRecords.filter(dn => dn.status !== 'SHIPPED').length;

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
              <FileText size={26} color="var(--primary-color)" /> 出貨單列表 (Delivery Note List)
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>檢視所有出貨紀錄、追蹤出單進度並執行扣庫存作業。</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
           <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '24px', boxShadow: 'var(--card-shadow)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>待處理出貨單</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f97316' }}>
                  {pendingCount} <span style={{ fontSize: '0.8rem', fontWeight: 400, opacity: 0.8 }}>單</span>
                </div>
              </div>

           </div>
           {!isSplitMode && (
             <button
               onClick={() => navigate('/outbound-split')}
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
               <FileText size={18} /> 新增出貨單 (D/N Reg)
             </button>
           )}
        </div>
      </div>

      <div className="card-surface" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '16px', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
            <select 
              value={searchField} 
              onChange={e => setSearchField(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--input-border)', outline: 'none', fontSize: '0.9rem', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', cursor: 'pointer', minWidth: '130px' }}
            >
              {searchOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div style={{ position: 'relative', width: '320px' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
              <input 
                type="text" 
                placeholder={`搜尋${searchOptions.find(o => o.value === searchField)?.label}...`} 
                style={{ width: '100%', padding: '10px 10px 10px 40px', borderRadius: '10px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '0.9rem', boxSizing: 'border-box' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)' }}>
              <Calendar size={18} color="var(--text-subtle)" />
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '0.9rem', color: 'var(--text-main)', background: 'transparent' }} 
              />
              <span style={{ color: 'var(--text-subtle)' }}>-</span>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '0.9rem', color: 'var(--text-main)', background: 'transparent' }} 
              />
            </div>
          </div>
        </div>

        <div style={{ padding: '24px' }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px', backgroundColor: '#fff5f5', color: '#d32f2f', borderRadius: '8px', marginBottom: '20px' }}>
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--table-header-bg)' }}>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>D/N 單號</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>出貨日期</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>客戶/對象</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>項目數</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>建立者</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>狀態</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>讀取中...</td></tr>
              ) : currentRecords.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>目前尚無出貨單資料</td></tr>
              ) : currentRecords.map(dn => (
                <tr key={dn.id} className="row-hover" style={{ borderBottom: '1px solid var(--table-border)', color: 'var(--text-main)' }}>
                  <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                    {dn.request_no}
                    {dn.request_type === 'LEND' && (
                      <span style={{ marginLeft: '8px', fontSize: '0.75rem', backgroundColor: '#eab308', color: 'white', padding: '2px 6px', borderRadius: '4px', verticalAlign: 'middle' }}>
                        借用單
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{new Date(dn.shipping_date).toLocaleDateString()}</td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{dn.customer}</span>
                      {dn.contact_info && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', backgroundColor: 'var(--bg-surface-subtle)', padding: '2px 8px', borderRadius: '4px' }}>
                          {dn.contact_info}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>{dn.item_count}</span> 項
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{dn.creator_name || '系統'}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ 
                      padding: '4px 10px', 
                      borderRadius: '12px', 
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      backgroundColor: dn.status === 'SHIPPED' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(249, 115, 22, 0.15)',
                      color: dn.status === 'SHIPPED' ? '#22c55e' : '#f97316'
                    }}>
                      {dn.status === 'PENDING' ? '已建立' : (dn.status === 'SHIPPED' ? '已出貨' : dn.status)}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: 'var(--primary-bg)', color: 'var(--primary-color)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                        title="查看詳情"
                        onClick={() => handleViewDetails(dn)}
                      >
                        <Eye size={16} /> 檢視
                      </button>
                      <button 
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                        title="刪除單據"
                        onClick={() => handleDelete(dn)}
                      >
                        <Trash2 size={16} /> 刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px', gap: '12px', borderTop: '1px solid #eee', backgroundColor: '#fafafa' }}>
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
      </div>

      {/* 明細彈窗 */}
      {isModalOpen && selectedDN && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content dn-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '12px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="var(--primary-color)" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>出貨單明細</h3>
                  <span style={{ fontSize: '0.75rem', color: '#666' }}>{selectedDN.request_no}</span>
                </div>
              </div>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            
            <div className="modal-body" style={{ padding: '8px 20px' }}>
              <div className="dn-summary" style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '12px', padding: '10px 16px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0 }}>客戶對象:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem' }}>
                    {selectedDN.customer} 
                    {selectedDN.contact_info && <span style={{ color: '#64748b', fontWeight: 400, marginLeft: '8px' }}>({selectedDN.contact_info})</span>}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0 }}>出貨日期:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem' }}>{new Date(selectedDN.shipping_date).toLocaleDateString()}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0 }}>出貨地點:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem' }}>{selectedDN.location || '-'}</span>
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
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#64748b' }}>發送位置</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isDetailLoading ? (
                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>讀取中...</td></tr>
                      ) : dnItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 12px' }}>
                            <span className="type-badge-mini">{item.type}</span>
                          </td>
                          <td style={{ padding: '6px 12px' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1e293b' }}>{item.brand} {item.model}</div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{item.specification}</div>
                          </td>
                          <td style={{ padding: '6px 12px' }}>
                            {item.sn && (
                              <code style={{ fontSize: '0.75rem', backgroundColor: '#f1f5f9', padding: '1px 4px', borderRadius: '3px', color: '#475569', border: '1px solid #e2e8f0' }}>
                                {item.sn}
                              </code>
                            )}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>{item.quantity}</span> <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.unit}</span>
                          </td>
                          <td style={{ padding: '6px 12px', fontSize: '0.8rem', color: '#475569' }}>
                            {item.location || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {selectedDN.status === 'PENDING' && (
              <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  className="btn-primary" 
                  onClick={handleConfirmDelivery}
                  disabled={isConfirming}
                  style={{ padding: '8px 24px', opacity: isConfirming ? 0.7 : 1 }}
                >
                  {isConfirming ? '處理中...' : '確認出貨'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .row-hover:hover { background-color: #f0f7ff; }
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        .btn-action-view, .btn-action-delete {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          border: none;
          cursor: pointer;
        }

        .btn-action-view {
          background-color: #e0e7ff;
          color: #4338ca;
        }

        .btn-action-view:hover {
          background-color: #4338ca;
          color: white;
          transform: translateY(-2px) scale(1.05);
          box-shadow: 0 4px 6px -1px rgba(67, 56, 202, 0.3);
        }

        .btn-action-delete {
          background-color: #fee2e2;
          color: #b91c1c;
        }

        .btn-action-delete:hover {
          background-color: #b91c1c;
          color: white;
          transform: translateY(-2px) scale(1.05);
          box-shadow: 0 4px 6px -1px rgba(185, 28, 28, 0.3);
        }

        .btn-primary, .btn-secondary {
          border-radius: 50px !important;
          padding-left: 20px !important;
          padding-right: 20px !important;
          transition: all 0.3s ease;
        }

        .dn-modal { 
          width: 60vw; 
          max-width: 95vw; 
          background-color: white;
          border-radius: 12px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
          border: 1px solid #e2e8f0;
          overflow: hidden;
          position: relative;
          animation: modalFadeIn 0.3s ease-out;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999;
          animation: overlayFadeIn 0.2s ease-out;
        }

        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .dn-summary {
          border-left: 4px solid var(--primary-color);
          background: linear-gradient(to right, #f8fafc, #ffffff);
          box-shadow: inset 0 0 0 1px #e2e8f0;
        }

        .dn-items-table tr:nth-child(even) {
          background-color: #f9fafb;
        }

        .dn-items-table tr:hover {
          background-color: #f1f5f9;
        }
        
        .summary-label { 
          font-size: 0.7rem; 
          color: #64748b; 
          font-weight: 800; 
          text-transform: uppercase; 
          letter-spacing: 0.025em;
          margin-bottom: 2px; 
        }

        .summary-value { 
          font-weight: 700; 
          color: #0f172a; 
        }
        
        .type-badge-mini {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.65rem;
          font-weight: 800;
          background-color: #e2e8f0;
          color: #475569;
          border: 1px solid #cbd5e1;
          display: inline-block;
          white-space: nowrap;
        }

        .dn-items-list-container {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
          background-color: #ffffff;
        }

        .close-btn {
          position: absolute;
          top: 12px;
          right: 16px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #64748b;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 1.2rem;
          transition: all 0.2s;
          padding-bottom: 2px;
          z-index: 20;
        }

        .close-btn:hover {
          background-color: #ef4444;
          color: white;
          border-color: #ef4444;
          transform: rotate(90deg);
        }
      `}</style>
    </div>
  );
};

export default DNList;
