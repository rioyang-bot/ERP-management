import React, { useState, useEffect, useCallback } from 'react';
import { Search, FileText, ShoppingCart, Filter, Calendar, ExternalLink, ChevronDown, ChevronRight, Package, Truck, CheckCircle2 } from 'lucide-react';

const ProcurementList = () => {
  const [purchaseRecords, setPurchaseRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedOrders, setExpandedOrders] = useState(new Set());

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const res = await window.electronAPI.dbQuery(`
      SELECT pr.*, p.name as partner_name, c.name as category_name, u.full_name as purchaser_name
      FROM purchase_records pr
      LEFT JOIN partners p ON pr.partner_id = p.id
      LEFT JOIN categories c ON pr.category_id = c.id
      LEFT JOIN users u ON pr.purchaser_id = u.id
      ORDER BY pr.created_at DESC
    `);
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

  const orders = Object.values(ordersMap).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const filteredOrders = orders.filter(order => 
    order.order_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.partner_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.items.some(item => item.specification.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const statusColors = {
    'ORDERED': { bg: '#e3f2fd', color: '#1976d2', label: '已下單' },
    'PARTIAL': { bg: '#fff3e0', color: '#e65100', label: '部分入庫' },
    'COMPLETED': { bg: '#e8f5e9', color: '#2e7d32', label: '結案' }
  };

  return (
    <div className="procurement-list-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '8px' }}>採購列表 (Procurement Overview)</h1>
          <p style={{ color: '#666', fontSize: '0.95rem' }}>管理所有採購單 (PO) 的品項分佈與入庫進度。</p>
        </div>
        
        <div style={{ display: 'flex', gap: '16px' }}>
           <div style={{ backgroundColor: '#fff', padding: '12px 24px', borderRadius: '12px', border: '1px solid #eee', display: 'flex', gap: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 600 }}>總採購單</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{orders.length} <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 400 }}>單 ({purchaseRecords.length} 品項)</span></div>
              </div>
              <div style={{ width: '1px', backgroundColor: '#eee' }}></div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 600 }}>總處理進度</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2e7d32' }}>
                  {Math.round((orders.filter(o => o.status === 'COMPLETED').length / (orders.length || 1)) * 100)}%
                </div>
              </div>
           </div>
        </div>
      </div>

      <div className="card-surface" style={{ padding: '0' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fafafa' }}>
          <div style={{ position: 'relative' }}>
            <input 
              type="text" 
              placeholder="搜尋 PO 單號、供應商或品項規格..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ 
                padding: '10px 16px 10px 42px', 
                borderRadius: '10px', 
                border: '1px solid #ddd', 
                fontSize: '0.9rem', 
                width: '360px',
                outline: 'none',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
              }}
            />
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
             <button className="btn-secondary" style={actionButtonStyle} onClick={fetchRecords}>
                <Calendar size={16} /> 重新整理
             </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#fff', textAlign: 'left', borderBottom: '1px solid #eee' }}>
                <th style={{ ...thStyle, width: '40px' }}></th>
                <th style={thStyle}>採購單號 / 日期</th>
                <th style={thStyle}>供應商 / 採購員</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>品項數</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>總到貨進度</th>
                <th style={thStyle}>狀態</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ padding: '60px', textAlign: 'center', color: '#999' }}>資料載入中...</td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: '60px', textAlign: 'center', color: '#999' }}>未找到符合條件的採購單</td></tr>
              ) : (
                filteredOrders.map(order => (
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
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-color)' }}>{order.order_no}</div>
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
                    </tr>
                    
                    {/* Collapsible Details */}
                    {expandedOrders.has(order.order_no) && (
                      <tr>
                        <td colSpan="6" style={{ padding: '0', backgroundColor: '#fdfdfd' }}>
                          <div style={{ padding: '20px 24px 20px 72px', borderBottom: '1px solid #eee' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #eee', overflow: 'hidden' }}>
                              <thead>
                                <tr style={{ backgroundColor: '#f9fafb', textAlign: 'left', borderBottom: '1px solid #eee' }}>
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
                                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.specification}</div>
                                      <div style={{ fontSize: '0.75rem', color: '#999' }}>{item.category_name} · {item.brand || '--'}</div>
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
        </div>
      </div>

      <style>{`
        .row-hover-effect:hover {
          background-color: #fcfdfe !important;
        }
      `}</style>
    </div>
  );
};

const thStyle = { padding: '16px 24px', fontSize: '0.85rem', fontWeight: 600, color: '#777' };
const innerThStyle = { padding: '10px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#888' };
const innerTdStyle = { padding: '12px 16px', fontSize: '0.85rem', color: '#555' };
const actionButtonStyle = { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '0.85rem' };

export default ProcurementList;
