import React, { useState, useEffect, useCallback } from 'react';
import { ArrowDownToLine, Search, Filter, Eye, RefreshCw, AlertCircle, Trash2, Calendar, Hash, FileText } from 'lucide-react';

const InboundList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const searchOptions = [
    { value: 'all', label: '全部欄位' },
    { value: 'order_no', label: '進貨單號' },
    { value: 'partner', label: '供應商' },
    { value: 'invoice_no', label: '發票號碼' },
    { value: 'project_name', label: '專案名稱' }
  ];

  const [inboundRecords, setInboundRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, searchField, startDate, endDate]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI.namedQuery('fetchInboundList');
      if (res.success) {
        setInboundRecords(res.rows || []);
      } else {
        setError('無法讀取進貨清單：' + (res.error || '未知錯誤'));
      }
    } catch (err) {
      console.error('Fetch inbound list error:', err);
      setError('伺服器連線異常，請檢查是否正常啟動。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleViewDetails = async (order) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
    setIsDetailLoading(true);
    try {
      const res = await window.electronAPI.namedQuery('fetchInboundItems', [order.id]);
      if (res.success) {
        setOrderItems(res.rows);
      } else {
        alert('無法讀取進貨明細：' + res.error);
      }
    } catch (err) {
      console.error('Fetch details error:', err);
      alert('讀取進貨明細失敗');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const filteredRecords = inboundRecords.filter(order => {
    const search = searchTerm.toLowerCase();
    if (!search) return true;

    const orderNo = (order.order_no || '').toLowerCase();
    const partner = (order.partner_name || '').toLowerCase();
    const invoice = (order.invoice_no || '').toLowerCase();
    const projectName = (order.project_name || '').toLowerCase();

    let matchSearch = true;
    if (searchField === 'all') {
      matchSearch = orderNo.includes(search) || partner.includes(search) || invoice.includes(search) || projectName.includes(search);
    } else if (searchField === 'order_no') {
      matchSearch = orderNo.includes(search);
    } else if (searchField === 'partner') {
      matchSearch = partner.includes(search);
    } else if (searchField === 'invoice_no') {
      matchSearch = invoice.includes(search);
    } else if (searchField === 'project_name') {
      matchSearch = projectName.includes(search);
    }

    if (!matchSearch) return false;

    if (startDate || endDate) {
      const orderDate = new Date(order.created_at);
      orderDate.setHours(0, 0, 0, 0);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (orderDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(0, 0, 0, 0);
        if (orderDate > end) return false;
      }
    }
    return true;
  });

  const sortedAndFiltered = [...filteredRecords]

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(sortedAndFiltered.length / ITEMS_PER_PAGE) || 1;
  const currentRecords = sortedAndFiltered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="inbound-list-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: '#1e293b' }}>
              <ArrowDownToLine size={26} color="#059669" />
              進貨單列表(Stock in List)
            </h1>
            <p style={{ color: '#64748b', fontSize: '13.5px', marginTop: '6px', fontWeight: 500, letterSpacing: '0.3px' }}>
              追查所有入庫單據明細、核銷與對帳關聯。
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={fetchRecords}
            className="btn-refresh-vibrant"
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? "spin-animation" : ""} />
            重新整理
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', gap: '16px', alignItems: 'center', backgroundColor: '#fafafa' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
            <select
              value={searchField}
              onChange={e => setSearchField(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.9rem', backgroundColor: '#fff', cursor: 'pointer', minWidth: '130px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
            >
              {searchOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div style={{ position: 'relative', width: '320px' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder={`搜尋${searchOptions.find(o => o.value === searchField)?.label}...`}
                style={{ width: '100%', padding: '10px 10px 10px 40px', borderRadius: '10px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.9rem', boxSizing: 'border-box', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <Calendar size={18} color="#94a3b8" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '0.9rem', color: '#475569', background: 'transparent' }}
              />
              <span style={{ color: '#cbd5e1' }}>-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '0.9rem', color: '#475569', background: 'transparent' }}
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
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #334155' }}>
                  <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>進貨單號</th>
                  <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>進貨建立時間</th>
                  <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>供應商</th>
                  <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>專案名稱</th>
                  <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>發票號碼</th>
                  <th style={{ padding: '12px', fontSize: '0.95rem', color: '#000', fontWeight: 800 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>讀取中...</td></tr>
                ) : currentRecords.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>目前尚無進貨單資料</td></tr>
                ) : currentRecords.map(order => (
                  <tr key={order.id} className="row-hover" style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{order.order_no}</td>
                    <td style={{ padding: '12px' }}>{new Date(order.created_at).toLocaleString()}</td>
                    <td style={{ padding: '12px', color: order.partner_name ? '#333' : '#94a3b8' }}>{order.partner_name || '無紀錄'}</td>
                    <td style={{ padding: '12px' }}>
                      {order.project_name ? (
                        <span style={{ backgroundColor: '#e0f2fe', color: '#0284c7', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
                          {order.project_name}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>--</span>
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>{order.invoice_no || '--'}</td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleViewDetails(order)}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                        >
                          <Eye size={16} /> 檢視明細
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

      {isModalOpen && selectedOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '900px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={24} color="#059669" />
                  進貨明細單：{selectedOrder.order_no}
                </h2>
                <div style={{ display: 'flex', gap: '20px', color: '#64748b', fontSize: '0.9rem', fontWeight: 500 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> 建立時間：{new Date(selectedOrder.created_at).toLocaleString()}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FileText size={14} /> 供應商：{selectedOrder.partner_name || '無'}</span>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ padding: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕ 關閉
              </button>
            </div>

            <div style={{ padding: '32px', overflowY: 'auto' }}>
              {isDetailLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>正在載入進貨明細資料...</div>
              ) : orderItems.length > 0 ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: '#334155', fontSize: '0.9rem' }}>入庫品項</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: '#334155', fontSize: '0.9rem' }}>類別</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: '#334155', fontSize: '0.9rem' }}>來源採購單</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: '#334155', fontSize: '0.9rem' }}>硬體序號 (S/N)</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#334155', fontSize: '0.9rem' }}>數量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderItems.map((item, idx) => (
                        <tr key={item.id} style={{ borderBottom: idx === orderItems.length - 1 ? 'none' : '1px solid #e2e8f0' }}>
                          <td style={{ padding: '16px', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>{[item.brand, item.model, item.specification].filter(Boolean).join(' ') || item.specification || '未知項目'}</div>
                          </td>
                          <td style={{ padding: '16px', verticalAlign: 'top' }}>
                            <span style={{ padding: '4px 8px', backgroundColor: '#f1f5f9', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                              {item.category_name || '未分類'}
                            </span>
                          </td>
                          <td style={{ padding: '16px', verticalAlign: 'top', fontSize: '0.9rem', color: '#475569' }}>
                            {item.po_order_no || '無 (非採購入庫)'}
                          </td>
                          <td style={{ padding: '16px', verticalAlign: 'top' }}>
                            {item.sn ? (
                              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#16a34a', backgroundColor: '#dcfce7', padding: '4px 8px', borderRadius: '6px' }}>{item.sn}</span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'center', verticalAlign: 'top', fontWeight: 800, color: '#0f172a' }}>
                            {item.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                  此查詢單據無可顯示之有效明細或資料已被移除。
                </div>
              )}
            </div>

            <div style={{ padding: '20px 32px', borderTop: '1px solid #eee', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'flex-end', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ padding: '10px 24px', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#334155' }}
              >
                關閉視窗
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .btn-refresh-vibrant {
          padding: 8px 16px;
          border-radius: 9999px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          font-weight: 700;
          font-size: 0.95rem;
          display: flex;
          align-items: center;
          gap: 8px;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        .btn-refresh-vibrant:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
        }
        .btn-refresh-vibrant:active {
          transform: translateY(1px);
        }
        .btn-refresh-vibrant:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }
        .spin-animation {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        .row-hover:hover {
          background-color: #f8fafc;
        }
      `}</style>
    </div>
  );
};

export default InboundList;
