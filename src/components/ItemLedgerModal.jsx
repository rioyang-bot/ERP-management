import React, { useState, useEffect, useCallback } from 'react';
import { X, History, ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft, RefreshCw, Box, Layers, Hash, ChevronLeft, ChevronRight } from 'lucide-react';

const ItemLedgerModal = ({ isOpen, onClose, item }) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchHistory = useCallback(async () => {
    if (!item?.item_master_id) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.namedQuery('fetchItemFlowHistory', [item.item_master_id]);
      if (res.success) {
        let rows = res.rows || [];
        // 如果有指定 SN (例如設備)，只顯示該 SN 的進出紀錄
        if (item.sn) {
          rows = rows.filter(r => r.sn === item.sn);
        }
        setRecords(rows);
        setCurrentPage(1); // 重置頁碼
      } else {
        console.error('Fetch item flow history failed:', res.error);
        alert('載入履歷失敗');
      }
    } catch (err) {
      console.error('Error fetching item history:', err);
    } finally {
      setLoading(false);
    }
  }, [item]);

  useEffect(() => {
    if (isOpen && item) {
      fetchHistory();
    }
  }, [isOpen, item, fetchHistory]);

  if (!isOpen || !item) return null;

  // 取得交易類型的 UI 呈現
  const getTypeDisplay = (type) => {
    switch (type) {
      case 'INBOUND':
        return { label: '進貨入庫', icon: <ArrowDownToLine size={14} />, color: '#10b981', bg: '#d1fae5' };
      case 'OUTBOUND_SALE':
        return { label: '出貨發貨', icon: <ArrowUpFromLine size={14} />, color: '#3b82f6', bg: '#dbeafe' };
      case 'OUTBOUND_LEND':
        return { label: '設備借出', icon: <ArrowRightLeft size={14} />, color: '#d97706', bg: '#fef3c7' };
      default:
        return { label: '未知', icon: <History size={14} />, color: '#64748b', bg: '#f1f5f9' };
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('zh-TW');
    } catch (e) {
      return dateStr;
    }
  };

  // 分頁邏輯
  const totalPages = Math.max(1, Math.ceil(records.length / itemsPerPage));
  const paginatedRecords = records.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const tableStyles = `
    .ledger-table {
      width: 100%;
      border-collapse: collapse;
      background: white;
    }
    .ledger-table th {
      text-align: left;
      padding: 12px;
      font-weight: 700;
      color: #334155;
      border-bottom: 2px solid #e2e8f0;
      background-color: #f8fafc;
      font-size: 13px;
    }
    .ledger-table td {
      padding: 12px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
      color: #334155;
      font-size: 13px;
    }
    .ledger-table tr:hover td {
      background-color: #fbfbfb;
    }
  `;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <style>{tableStyles}</style>
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '900px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}>
        
        {/* Modal Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '10px', backgroundColor: '#f1f5f9', borderRadius: '10px', color: '#6366f1' }}>
              <History size={24} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>品項履歷查詢 (Item Ledger)</h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>單一品項總數量與完整進出貨紀錄</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', color: '#94a3b8', borderRadius: '8px', transition: 'background-color 0.2s' }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            <X size={24} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Item Info Summary Card */}
          <div style={{ display: 'flex', gap: '16px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ flex: 1, borderRight: '1px solid #cbd5e1', paddingRight: '16px' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Box size={14}/> 品項資訊</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{item.brand} {item.model}</div>
              {item.type && <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>類型：{item.type}</div>}
            </div>
            {item.sn && (
              <div style={{ flex: 1, borderRight: '1px solid #cbd5e1', paddingRight: '16px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={14}/> 設備序號 (S/N)</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{item.sn}</div>
              </div>
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Layers size={14}/> 系統總庫存</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#10b981' }}>{item.current_stock ?? '-'}</div>
            </div>
          </div>

          {/* History Table */}
          <div style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>進出貨歷史軌跡 ({records.length} 筆)</span>
              <button onClick={fetchHistory} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                <RefreshCw size={14} className={loading ? 'spinner' : ''} /> 重新整理
              </button>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th style={{ width: '15%' }}>異動日期</th>
                    <th style={{ width: '15%' }}>交易類型</th>
                    <th style={{ width: '20%' }}>單號</th>
                    <th style={{ width: '20%' }}>關聯對象</th>
                    <th style={{ width: '20%' }}>序號 (S/N)</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>數量</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                        <RefreshCw className="spinner" size={24} style={{ marginBottom: '8px', color: '#6366f1' }} /><br/>
                        載入中...
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                        尚無歷史進出紀錄
                      </td>
                    </tr>
                  ) : (
                    paginatedRecords.map((rec, index) => {
                      const display = getTypeDisplay(rec.transaction_type);
                      return (
                        <tr key={`${rec.order_no}-${index}`}>
                          <td style={{ fontWeight: 500 }}>{formatDate(rec.transaction_date)}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', backgroundColor: display.bg, color: display.color, fontWeight: 700, fontSize: '11px' }}>
                              {display.icon} {display.label}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{rec.order_no}</td>
                          <td>{rec.partner_name || '-'}</td>
                          <td>{rec.sn ? <span style={{ fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#f1f5f9', padding: '2px 4px', borderRadius: '4px' }}>{rec.sn}</span> : '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{rec.quantity}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {records.length > 0 && (
              <div style={{ padding: '12px 16px', backgroundColor: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  顯示第 {(currentPage - 1) * itemsPerPage + 1} 到 {Math.min(currentPage * itemsPerPage, records.length)} 筆，共 {records.length} 筆
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{ padding: '4px 8px', border: '1px solid #e2e8f0', backgroundColor: currentPage === 1 ? '#f8fafc' : '#fff', color: currentPage === 1 ? '#94a3b8' : '#334155', borderRadius: '6px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    style={{ padding: '4px 8px', border: '1px solid #e2e8f0', backgroundColor: currentPage === totalPages ? '#f8fafc' : '#fff', color: currentPage === totalPages ? '#94a3b8' : '#334155', borderRadius: '6px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default ItemLedgerModal;
