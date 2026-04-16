import React, { useState, useEffect, useCallback } from 'react';
import { Search, FileText, ShoppingCart, Filter, Calendar, ExternalLink } from 'lucide-react';

const ProcurementList = () => {
  const [purchaseRecords, setPurchaseRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

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
    const init = async () => {
      await fetchRecords();
    };
    init();
  }, [fetchRecords]);

  const filteredRecords = purchaseRecords.filter(r => 
    r.order_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.specification.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.partner_name?.toLowerCase().includes(searchTerm.toLowerCase())
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
          <h1 className="page-title" style={{ marginBottom: '8px' }}>採購列表 (Procurement List)</h1>
          <p style={{ color: '#666', fontSize: '0.95rem' }}>檢視所有採購單的狀態、入庫進度與單價詳情。</p>
        </div>
        
        <div style={{ display: 'flex', gap: '16px' }}>
           <div style={{ backgroundColor: '#fff', padding: '10px 20px', borderRadius: '12px', border: '1px solid #eee', display: 'flex', gap: '24px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 600 }}>總採購數</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{purchaseRecords.length}</div>
              </div>
              <div style={{ width: '1px', backgroundColor: '#eee' }}></div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 600 }}>待入庫</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e65100' }}>{purchaseRecords.filter(r => r.status !== 'COMPLETED').length}</div>
              </div>
           </div>
        </div>
      </div>

      <div className="card-surface" style={{ padding: '0' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <input 
              type="text" 
              placeholder="搜尋單號、廠商或規格..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ 
                padding: '10px 16px 10px 42px', 
                borderRadius: '10px', 
                border: '1px solid #ddd', 
                fontSize: '0.95rem', 
                width: '320px',
                outline: 'none'
              }}
            />
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
             <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}>
                <Filter size={16} /> 篩選
             </button>
             <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }} onClick={fetchRecords}>
                <Calendar size={16} /> 重新整理
             </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-light)', textAlign: 'left' }}>
                <th style={{ padding: '16px 24px', fontSize: '0.85rem', fontWeight: 600, color: '#666' }}>狀態</th>
                <th style={{ padding: '16px 24px', fontSize: '0.85rem', fontWeight: 600, color: '#666' }}>採購單號</th>
                <th style={{ padding: '16px 24px', fontSize: '0.85rem', fontWeight: 600, color: '#666' }}>規格 / 廠商 / 類別</th>
                <th style={{ padding: '16px 24px', fontSize: '0.85rem', fontWeight: 600, color: '#666' }}>採購單價</th>
                <th style={{ padding: '16px 24px', fontSize: '0.85rem', fontWeight: 600, color: '#666', textAlign: 'center' }}>採購量</th>
                <th style={{ padding: '16px 24px', fontSize: '0.85rem', fontWeight: 600, color: '#666', textAlign: 'center' }}>已入庫</th>
                <th style={{ padding: '16px 24px', fontSize: '0.85rem', fontWeight: 600, color: '#666' }}>總計金額</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ padding: '60px', textAlign: 'center', color: '#999' }}>資料載入中...</td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '60px', textAlign: 'center', color: '#999' }}>未找到符合條件的採購紀錄</td></tr>
              ) : (
                filteredRecords.map(record => (
                  <tr key={record.id} style={{ borderBottom: '1px solid #f0f0f0' }} className="row-hover-effect">
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ 
                        padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
                        backgroundColor: statusColors[record.status]?.bg, color: statusColors[record.status]?.color
                      }}>
                        {statusColors[record.status]?.label}
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: '0.9rem', color: '#444', fontWeight: 600 }}>{record.order_no}</td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-main)' }}>{record.specification}</div>
                      <div style={{ fontSize: '0.85rem', color: '#888', marginTop: '2px' }}>
                        <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>[{record.category_name}]</span> {record.partner_name} · {record.brand || '未指定'}
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: '0.95rem', color: '#444', fontWeight: 500 }}>
                       ${Number(record.unit_price).toLocaleString()}
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'center', fontSize: '0.95rem' }}>
                      {record.quantity} {record.unit}
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                       <div style={{ 
                         fontSize: '0.95rem', fontWeight: 700, 
                         color: record.received_quantity === record.quantity ? '#2e7d32' : (record.received_quantity > 0 ? '#e65100' : '#d32f2f') 
                       }}>
                         {record.received_quantity}
                       </div>
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: '1rem', fontWeight: 800, color: 'var(--primary-color)' }}>
                      ${(record.unit_price * record.quantity).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .row-hover-effect:hover {
          background-color: #f8fbff !important;
        }
      `}</style>
    </div>
  );
};

export default ProcurementList;
