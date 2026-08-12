import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Search, Filter, Eye, RefreshCw, AlertCircle, Trash2 } from 'lucide-react';

const DNList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dnRecords, setDnRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [selectedDN, setSelectedDN] = useState(null);
  const [dnItems, setDnItems] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

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
           const res = await window.electronAPI.namedQuery('updateAssetStatusAndLocationBySn', ['SHIPPED', destLocation, item.sn]);
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

  const filteredRecords = dnRecords.filter(dn => 
    dn.request_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (dn.customer && dn.customer.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: '#1e293b' }}>
            <FileText size={26} color="#2563eb" /> 出貨單列表 (D/N List)
          </h1>
        </div>
        <button onClick={fetchRecords} className="btn-refresh-vibrant">
          <RefreshCw size={18} className={loading ? 'spinner' : ''} /> 重新整理
        </button>
      </div>

      <div className="card-surface" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input 
              type="text" 
              placeholder="搜尋 D/N 單號或客戶..." 
              style={{ width: '100%', padding: '10px 10px 10px 40px', borderRadius: '10px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.9rem' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="btn-filter-vibrant">
            <Filter size={18} /> 篩選
          </button>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px', backgroundColor: '#fff5f5', color: '#d32f2f', borderRadius: '8px', marginBottom: '20px' }}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #334155' }}>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>D/N 單號</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>出貨日期</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>客戶/對象</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>所屬專案</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>項目數</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>建立者</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>狀態</th>
                <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>讀取中...</td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>目前尚無出貨單資料</td></tr>
              ) : filteredRecords.map(dn => (
                <tr key={dn.id} className="row-hover" style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '12px', fontWeight: 600 }}>{dn.request_no}</td>
                  <td style={{ padding: '12px' }}>{new Date(dn.shipping_date).toLocaleDateString()}</td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600 }}>{dn.customer}</span>
                      {dn.contact_info && (
                        <span style={{ fontSize: '0.8rem', color: '#64748b', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                          {dn.contact_info}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                     {dn.project_name ? (
                        <span style={{ fontWeight: 600, color: '#4338ca', backgroundColor: '#e0e7ff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>
                          {dn.project_name}
                        </span>
                     ) : <span style={{ color: '#999', fontSize: '0.85rem' }}>-</span>}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{dn.item_count}</span> 項
                  </td>
                  <td style={{ padding: '12px', color: '#666', fontSize: '0.9rem' }}>{dn.creator_name || '系統系統'}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ 
                      padding: '4px 10px', 
                      borderRadius: '12px', 
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      backgroundColor: dn.status === 'SHIPPED' ? '#e8f5e9' : '#fff3e0',
                      color: dn.status === 'SHIPPED' ? '#2e7d32' : '#ef6c00'
                    }}>
                      {dn.status === 'PENDING' ? '已建立' : (dn.status === 'SHIPPED' ? '已出貨' : dn.status)}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        className="btn-action-view" 
                        title="查看詳情"
                        onClick={() => handleViewDetails(dn)}
                      >
                        <Eye size={16} />
                      </button>
                      <button 
                        className="btn-action-delete" 
                        title="刪除單據"
                        onClick={() => handleDelete(dn)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

        .btn-refresh-vibrant, .btn-filter-vibrant {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
          border-radius: 50px;
          font-weight: 700;
          font-size: 0.9rem;
          border: none;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          color: white;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .btn-refresh-vibrant {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }

        .btn-refresh-vibrant:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px -2px rgba(16, 185, 129, 0.4);
          filter: brightness(1.1);
        }

        .btn-filter-vibrant {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        }

        .btn-filter-vibrant:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px -2px rgba(245, 158, 11, 0.4);
          filter: brightness(1.1);
        }

        .btn-primary, .btn-secondary {
          border-radius: 50px !important;
          padding-left: 20px !important;
          padding-right: 20px !important;
          transition: all 0.3s ease;
        }

        .dn-modal { 
          width: 800px; 
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
