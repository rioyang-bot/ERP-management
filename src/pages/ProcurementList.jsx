import React, { useState, useEffect, useCallback } from 'react';
import { Search, FileText, ShoppingCart, Filter, Calendar, ExternalLink, ChevronDown, ChevronRight, Package, Truck, CheckCircle2, Trash2, Edit2, X, Save, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ProcurementRegistration from './Purchasing';

const ProcurementList = ({ isSplitMode = false }) => {
  const navigate = useNavigate();
  const [purchaseRecords, setPurchaseRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const searchOptions = [
    { value: 'all', label: '全部欄位' },
    { value: 'order_no', label: '採購單號' },
    { value: 'partner', label: '供應商' },
    { value: 'item_spec', label: '品項規格' }
  ];

  const [expandedOrders, setExpandedOrders] = useState(new Set());
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, searchField, startDate, endDate]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const res = await window.electronAPI.namedQuery('fetchProcurementList');
    if (res.success) {
      setPurchaseRecords(res.rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => fetchRecords());
  }, [fetchRecords]);

  const toggleOrder = (orderNo) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderNo)) next.delete(orderNo);
      else next.add(orderNo);
      return next;
    });
  };

  const handleDeleteOrder = async (orderNo) => {
    try {
      if (!window.confirm(`確定要刪除整個採購單 ${orderNo} 嗎？此操作不可還原。`)) return;
      
      const res = await window.electronAPI.namedQuery(
        "deletePurchaseRecordList",
        [orderNo]
      );
      
      if (res.success) {
        alert('刪除成功');
        fetchRecords();
      } else {
        alert('刪除失敗：' + res.error);
      }
    } catch (err) {
      console.error(err);
      alert('刪除操作發生錯誤：' + err.message);
    }
  };

  const handleEditOrder = (order) => {
    setEditingOrder(JSON.parse(JSON.stringify(order))); 
    setShowEditModal(true);
  };

  // Group records by PO Number
  const ordersMap = purchaseRecords.reduce((acc, record) => {
    if (!acc[record.order_no]) {
      acc[record.order_no] = {
        order_no: record.order_no,
        partner_name: record.partner_name,
        purchaser_name: record.purchaser_name,
        created_at: record.created_at,
        items: [],
        totalQty: 0,
        receivedQty: 0,
        status: 'COMPLETED'
      };
    }
    acc[record.order_no].items.push(record);
    acc[record.order_no].totalQty += record.quantity;
    acc[record.order_no].receivedQty += (record.received_quantity || 0);
    
    // Determine overall status
    if (record.status !== 'COMPLETED') {
      if (acc[record.order_no].status === 'COMPLETED') {
        acc[record.order_no].status = record.status;
      } else if (record.status === 'ORDERED' && acc[record.order_no].status === 'PARTIAL') {
        // Keep PARTIAL
      } else if (record.status === 'PARTIAL') {
        acc[record.order_no].status = 'PARTIAL';
      }
    }
    
    return acc;
  }, {});
  const orders = Object.values(ordersMap).sort((a, b) => {
    const aIncomplete = a.status !== 'COMPLETED';
    const bIncomplete = b.status !== 'COMPLETED';
    if (aIncomplete && !bIncomplete) return -1;
    if (!aIncomplete && bIncomplete) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const filteredOrders = orders.filter(order => {
    const search = searchTerm.toLowerCase();
    const orderNo = (order.order_no || '').toLowerCase();
    const partner = (order.partner_name || '').toLowerCase();
    
    const matchItems = () => order.items.some(item => {
      const spec = (item.specification || '').toLowerCase();
      const model = (item.model || '').toLowerCase();
      return spec.includes(search) || model.includes(search);
    });

    let matchSearch = true;
    if (searchField === 'all') {
      matchSearch = orderNo.includes(search) ||
             partner.includes(search) ||
             matchItems();
    } else if (searchField === 'order_no') {
      matchSearch = orderNo.includes(search);
    } else if (searchField === 'partner') {
      matchSearch = partner.includes(search);
    } else if (searchField === 'item_spec') {
      matchSearch = matchItems();
    }

    if (!matchSearch) return false;

    if (startDate || endDate) {
      const orderDate = new Date(order.created_at);
      orderDate.setHours(0,0,0,0);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0,0,0,0);
        if (orderDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(0,0,0,0);
        if (orderDate > end) return false;
      }
    }
    return true;
  });

  const statusColors = {
    'ORDERED': { bg: '#e3f2fd', color: '#1976d2', label: '已下單' },
    'PARTIAL': { bg: '#fff3e0', color: '#e65100', label: '部分入庫' },
    'COMPLETED': { bg: '#e8f5e9', color: '#2e7d32', label: '已結案入庫' }
  };


  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE) || 1;
  const currentOrders = filteredOrders.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="procurement-list-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: '#1e293b' }}>
              <ShoppingCart size={26} color="#2563eb" /> 採購列表(Purchase Order List)
            </h1>
            <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>管理所有採購單 (PO) 的品項分佈與入庫進度。</p>
          </div>
          {!isSplitMode && (
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
              <button onClick={() => navigate('/purchasing')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: '#64748b', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
                📝 建檔
              </button>
              <button onClick={() => navigate('/procurement-split')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: '#64748b', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
                ◫ 雙開
              </button>
              <button style={{ padding: '6px 14px', backgroundColor: '#ffffff', color: '#2563eb', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '800', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', cursor: 'default' }}>
                📋 清單
              </button>
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
           <div style={{ backgroundColor: '#fff', padding: '12px 24px', borderRadius: '12px', border: '1px solid #eee', display: 'flex', gap: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 600 }}>待處理採購單</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e65100' }}>
                  {orders.filter(o => o.status !== 'COMPLETED').length} <span style={{ fontSize: '0.8rem', fontWeight: 400, opacity: 0.8 }}>單</span>
                </div>
              </div>

           </div>
           <button onClick={fetchRecords} className="btn-refresh-vibrant">
             <RefreshCw size={18} className={loading ? 'spinner' : ''} /> 重新整理
           </button>
        </div>
      </div>

      <div className="card-surface" style={{ padding: '0' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fafafa' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select 
              value={searchField} 
              onChange={e => setSearchField(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #ddd', outline: 'none', fontSize: '0.9rem', backgroundColor: '#fff', cursor: 'pointer', minWidth: '130px', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}
            >
              {searchOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                placeholder={`搜尋${searchOptions.find(o => o.value === searchField)?.label}...`} 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ 
                  padding: '10px 16px 10px 42px', 
                  borderRadius: '10px', 
                  border: '1px solid #ddd', 
                  fontSize: '0.9rem', 
                  width: '320px',
                  outline: 'none',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                }}
              />
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
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

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #334155' }}>
                <th style={{ ...thStyle, width: '40px' }}></th>
                <th style={thStyle}>採購單號 / 日期</th>
                <th style={thStyle}>供應商 / 採購員</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>品項數</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>總到貨進度</th>
                <th style={thStyle}>狀態</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>功能</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ padding: '60px', textAlign: 'center', color: '#999' }}>資料載入中...</td></tr>
              ) : currentOrders.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '60px', textAlign: 'center', color: '#999' }}>未找到符合條件的採購單</td></tr>
              ) : (
                currentOrders.map(order => (
                  <React.Fragment key={order.order_no}>
                    <tr 
                      onClick={() => toggleOrder(order.order_no)}
                      style={{ 
                        borderBottom: '1px solid #f5f5f5', 
                        cursor: 'pointer',
                        backgroundColor: expandedOrders.has(order.order_no) ? '#f8fbff' : 'transparent',
                        transition: 'background-color 0.2s'
                      }} 
                      className="row-hover-effect"
                    >
                      <td style={{ padding: '16px 8px 16px 24px' }}>
                        {expandedOrders.has(order.order_no) ? <ChevronDown size={20} color="#666" /> : <ChevronRight size={20} color="#666" />}
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-color)' }}>{order.order_no}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '2px' }}>{new Date(order.created_at).toLocaleDateString()} {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <div style={{ fontWeight: 600, color: '#333' }}>{order.partner_name || '未指定'}</div>
                        <div style={{ fontSize: '0.8rem', color: '#888' }}>{order.purchaser_name || '系統'}</div>
                      </td>
                      <td style={{ padding: '16px 24px', textAlign: 'center', fontWeight: 500 }}>
                        {order.items.length} 項
                      </td>
                      <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                         <div style={{ fontSize: '0.9rem', fontWeight: 700, color: order.receivedQty === order.totalQty ? '#2e7d32' : (order.receivedQty > 0 ? '#e65100' : '#888') }}>
                           {order.receivedQty} / {order.totalQty}
                         </div>
                         <div style={{ height: '4px', backgroundColor: '#eee', borderRadius: '10px', marginTop: '6px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', backgroundColor: order.receivedQty === order.totalQty ? '#2e7d32' : '#faad14', width: `${(order.receivedQty / order.totalQty) * 100}%` }}></div>
                         </div>
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <span style={{ 
                          padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
                          backgroundColor: statusColors[order.status]?.bg, color: statusColors[order.status]?.color
                        }}>
                          {statusColors[order.status]?.label}
                        </span>
                      </td>
                      <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                            {order.status !== 'COMPLETED' ? (
                              <>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleEditOrder(order); }} 
                                  style={{ ...iconButtonStyle, color: '#1890ff' }}
                                  title="修改採購單"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order.order_no); }} 
                                  style={{ ...iconButtonStyle, color: '#ff4d4f' }}
                                  title="刪除採購單"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            ) : (
                              <span style={{ fontSize: '0.7rem', color: '#ccc' }}>唯讀紀錄</span>
                            )}
                          </div>
                      </td>
                    </tr>
                    
                    {/* Collapsible Details */}
                    {expandedOrders.has(order.order_no) && (
                      <tr>
                        <td colSpan="7" style={{ padding: '0', backgroundColor: '#fdfdfd' }}>
                          <div style={{ padding: '20px 24px 20px 72px', borderBottom: '1px solid #eee' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #eee', overflow: 'hidden' }}>
                              <thead>
                                <tr style={{ backgroundColor: '#f9fafb', textAlign: 'left', borderBottom: '1px solid #eee' }}>
                                  <th style={innerThStyle}>廠牌 / 型號</th>
                                  <th style={innerThStyle}>規格 (Item Specification)</th>
                                  <th style={{ ...innerThStyle, textAlign: 'center' }}>數量</th>
                                  <th style={{ ...innerThStyle, textAlign: 'center' }}>已到貨</th>
                                  <th style={innerThStyle}>狀態</th>
                                </tr>
                              </thead>
                              <tbody>
                                {order.items.map(item => (
                                  <tr key={item.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                                    <td style={innerTdStyle}>
                                      <div style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{item.brand || '--'}</div>
                                      <div style={{ fontSize: '0.75rem', color: '#666' }}>{item.model || '--'}</div>
                                    </td>
                                    <td style={innerTdStyle}>
                                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.specification}</div>
                                      <div style={{ fontSize: '0.75rem', color: '#999' }}>{item.category_name}</div>
                                    </td>
                                    <td style={{ ...innerTdStyle, textAlign: 'center' }}>{item.quantity} {item.unit}</td>
                                    <td style={{ ...innerThStyle, textAlign: 'center', fontWeight: 700, color: item.received_quantity === item.quantity ? '#2e7d32' : '#e65100' }}>{item.received_quantity}</td>
                                    <td style={innerTdStyle}>
                                      <span style={{ fontSize: '0.75rem', color: statusColors[item.status]?.color }}>● {statusColors[item.status]?.label}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
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

      {showEditModal && editingOrder && (
        <div style={modalOverlayStyle}>
          <div className="card-surface" style={{ ...modalContentStyle, width: '90vw', padding: '24px 32px' }}>
            <ProcurementRegistration 
              editMode={true} 
              initOrderNo={editingOrder.order_no} 
              onClose={() => { 
                setShowEditModal(false); 
                fetchRecords(); 
              }} 
            />
          </div>
        </div>
      )}

      <style>{`
        .row-hover-effect:hover {
          background-color: #fcfdfe !important;
        }
      `}</style>
    </div>
  );
};

const thStyle = { padding: '12px 24px', fontSize: '0.95rem', fontWeight: 800, color: '#000' };
const innerThStyle = { padding: '10px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#888' };
const innerTdStyle = { padding: '12px 16px', fontSize: '0.85rem', color: '#555' };
const actionButtonStyle = { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '0.85rem' };
const iconButtonStyle = { padding: '6px', borderRadius: '6px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer' };
const modalOverlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' };
const modalContentStyle = { width: '800px', maxHeight: '85vh', padding: '32px', borderRadius: '16px', backgroundColor: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column' };
const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#aaa', marginBottom: '6px' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.9rem', boxSizing: 'border-box' };

export default ProcurementList;
