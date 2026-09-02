import React, { useState, useEffect, useCallback } from 'react';
import { Search, FileText, ShoppingCart, Filter, Calendar, ExternalLink, ChevronDown, ChevronRight, Package, Truck, CheckCircle2, Trash2, Edit2, X, Save, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ProcurementRegistration from './Purchasing';
import PurchaseOrderRegistrationModal from '../components/PurchaseOrderRegistrationModal';
import { logDelete } from '../utils/auditLogger';
import { usePageSize } from '../utils/usePageSize';
import PageSizeSelector from '../components/common/PageSizeSelector';

const ProcurementList = ({ isSplitMode = false }) => {
  const navigate = useNavigate();
  const [purchaseRecords, setPurchaseRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [searchStatus, setSearchStatus] = useState('ALL');
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
  }, [searchTerm, searchField, searchStatus, startDate, endDate]);

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
        logDelete('PURCHASE', orderNo, '採購單', `刪除整筆採購單 [${orderNo}]`, { orderNo });
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
    
    if (searchStatus !== 'ALL' && order.status !== searchStatus) {
      return false;
    }

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
    'ORDERED': { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', label: '已下單' },
    'PARTIAL': { bg: 'rgba(249, 115, 22, 0.15)', color: '#f97316', label: '部分入庫' },
    'COMPLETED': { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', label: '已結案入庫' }
  };


  const [itemsPerPage, setItemsPerPage] = usePageSize('procurement_list', 10);
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;
  const currentOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="procurement-list-container" style={isSplitMode ? { padding: 0, minHeight: 'auto', backgroundColor: 'transparent' } : {}}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
              <ShoppingCart size={26} color="var(--primary-color)" /> 採購列表(Purchase Order List)
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>管理所有採購單 (PO) 的品項分佈與入庫進度。</p>
          </div>
          {!isSplitMode && (
            <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <button 
                onClick={() => setShowAddModal(true)} 
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
                ➕ 新增採購單 (New PO)
              </button>
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
           <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '24px', boxShadow: 'var(--card-shadow)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>待處理採購單</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f97316' }}>
                  {orders.filter(o => o.status !== 'COMPLETED').length} <span style={{ fontSize: '0.8rem', fontWeight: 400, opacity: 0.8 }}>單</span>
                </div>
              </div>
           </div>
        </div>
      </div>

      <div className="card-surface" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select 
              value={searchField} 
              onChange={e => setSearchField(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--input-border)', outline: 'none', fontSize: '0.9rem', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', cursor: 'pointer', minWidth: '130px' }}
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
                  border: '1px solid var(--input-border)', 
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  fontSize: '0.9rem', 
                  width: '320px',
                  outline: 'none'
                }}
              />
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
            </div>
            
            <select
              value={searchStatus}
              onChange={e => setSearchStatus(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--input-border)', outline: 'none', fontSize: '0.9rem', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', cursor: 'pointer', minWidth: '120px' }}
            >
              <option value="ALL">所有狀態</option>
              <option value="ORDERED">已下單</option>
              <option value="PARTIAL">部分入庫</option>
              <option value="COMPLETED">已結案入庫</option>
            </select>
            
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

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--table-header-bg)' }}>
                <th style={{ ...thStyle, width: '40px' }}></th>
                <th style={thStyle}>採購單號 / 日期</th>
                <th style={thStyle}>供應商 / 採購員</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>品項數</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>總到貨進度</th>
                <th style={thStyle}>狀態</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>資料載入中...</td></tr>
              ) : currentOrders.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>未找到符合條件的採購單</td></tr>
              ) : (
                currentOrders.map(order => (
                  <React.Fragment key={order.order_no}>
                    <tr 
                      onClick={() => toggleOrder(order.order_no)}
                      style={{ 
                        borderBottom: '1px solid var(--table-border)', 
                        cursor: 'pointer',
                        backgroundColor: expandedOrders.has(order.order_no) ? 'var(--bg-surface-hover)' : 'transparent',
                        transition: 'background-color 0.2s',
                        color: 'var(--text-main)'
                      }} 
                      className="row-hover-effect"
                    >
                      <td style={{ padding: '16px 8px 16px 24px' }}>
                        {expandedOrders.has(order.order_no) ? <ChevronDown size={20} color="var(--text-muted)" /> : <ChevronRight size={20} color="var(--text-muted)" />}
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-color)' }}>{order.order_no}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{new Date(order.created_at).toLocaleDateString()} {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{order.partner_name || '未指定'}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{order.purchaser_name || '系統'}</div>
                      </td>
                      <td style={{ padding: '16px 24px', textAlign: 'center', fontWeight: 600, color: 'var(--text-main)' }}>
                        {order.items.length} 項
                      </td>
                      <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                         <div style={{ fontSize: '0.9rem', fontWeight: 700, color: order.receivedQty === order.totalQty ? '#22c55e' : (order.receivedQty > 0 ? '#f97316' : 'var(--text-muted)') }}>
                           {order.receivedQty} / {order.totalQty}
                         </div>
                         <div style={{ height: '4px', backgroundColor: 'var(--border-color)', borderRadius: '10px', marginTop: '6px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', backgroundColor: order.receivedQty === order.totalQty ? '#22c55e' : '#f59e0b', width: `${(order.receivedQty / order.totalQty) * 100}%` }}></div>
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
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                            {order.status !== 'COMPLETED' ? (
                              <>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleEditOrder(order); }} 
                                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: 0, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}
                                  title="修改採購單"
                                  aria-label="修改採購單"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order.order_no); }} 
                                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: 0, backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}
                                  title="刪除採購單"
                                  aria-label="刪除採購單"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>唯讀紀錄</span>
                            )}
                          </div>
                      </td>
                    </tr>
                    
                    {/* Collapsible Details */}
                    {expandedOrders.has(order.order_no) && (
                      <tr>
                        <td colSpan="7" style={{ padding: '0', backgroundColor: 'var(--bg-surface-subtle)' }}>
                          <div style={{ padding: '20px 24px 20px 72px', borderBottom: '1px solid var(--border-color)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                              <thead>
                                <tr style={{ backgroundColor: 'var(--table-header-bg)', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                                  <th style={innerThStyle}>廠牌 / 型號</th>
                                  <th style={innerThStyle}>規格 (Item Specification)</th>
                                  <th style={{ ...innerThStyle, textAlign: 'center' }}>數量</th>
                                  <th style={{ ...innerThStyle, textAlign: 'center' }}>已到貨</th>
                                  <th style={innerThStyle}>狀態</th>
                                </tr>
                              </thead>
                              <tbody>
                                {order.items.map(item => (
                                  <tr key={item.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                    <td style={innerTdStyle}>
                                      <div style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{item.brand || '--'}</div>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.model || '--'}</div>
                                    </td>
                                    <td style={innerTdStyle}>
                                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>{item.specification}</div>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.category_name}</div>
                                    </td>
                                    <td style={{ ...innerTdStyle, textAlign: 'center', color: 'var(--text-main)' }}>{item.quantity}</td>
                                    <td style={{ ...innerThStyle, textAlign: 'center', fontWeight: 700, color: item.received_quantity === item.quantity ? '#22c55e' : '#f97316' }}>{item.received_quantity}</td>
                                    <td style={innerTdStyle}>
                                      <span style={{ fontSize: '0.75rem', color: statusColors[item.status]?.color, fontWeight: 600 }}>● {statusColors[item.status]?.label}</span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', gap: '12px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', flexWrap: 'wrap' }}>
            <PageSizeSelector pageSize={itemsPerPage} onChange={(newSize) => { setItemsPerPage(newSize); setCurrentPage(1); }} />
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
      </div>

      {showEditModal && editingOrder && (
        <div style={modalOverlayStyle}>
          <div className="card-surface" style={{ ...modalContentStyle, width: '60vw', padding: '24px 32px' }}>
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

      {/* 新增採購單 Modal */}
      <PurchaseOrderRegistrationModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchRecords}
      />

      <style>{`
        .row-hover-effect:hover {
          background-color: var(--table-row-hover) !important;
        }
      `}</style>
    </div>
  );
};

const thStyle = { padding: '12px 24px', fontSize: '0.95rem', fontWeight: 800, color: 'var(--table-header-text)' };
const innerThStyle = { padding: '10px 16px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' };
const innerTdStyle = { padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-main)' };
const actionButtonStyle = { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '0.85rem' };
const iconButtonStyle = { padding: '6px', borderRadius: '6px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer' };
const modalOverlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' };
const modalContentStyle = { width: '800px', maxHeight: '85vh', padding: '32px', borderRadius: '16px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', overflow: 'hidden', display: 'flex', flexDirection: 'column' };
const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '0.9rem', boxSizing: 'border-box' };

export default ProcurementList;
