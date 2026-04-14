import React, { useState } from 'react';
import { Package, CheckCircle, Clock } from 'lucide-react';

const WarehouseReview = () => {
  // 模擬含有金額的待審核清單庫存資料 (倉管視角)
  const [requests, setRequests] = useState([
    {
      id: 1,
      request_no: 'OUT-20260415-001',
      recipient: '王大明企業 (客戶)',
      status: 'PENDING',
      created_at: '2026-04-15 10:30',
      items: [
        { id: 101, name: 'MacBook Pro 16"', qty: 2, purchase_price: 60000, currency: 'TWD', physical_stock: 10 }
      ]
    },
    {
      id: 2,
      request_no: 'OUT-20260415-002',
      recipient: '行銷部 - 陳小美 (內部領用)',
      status: 'PENDING',
      created_at: '2026-04-15 11:15',
      items: [
        { id: 102, name: 'Dell XPS 15', qty: 1, purchase_price: 55000, currency: 'TWD', physical_stock: 3 },
        { id: 103, name: 'Logitech Mouse MX Master 3', qty: 1, purchase_price: 3500, currency: 'TWD', physical_stock: 8 }
      ]
    }
  ]);

  const handleConfirm = (id) => {
    if (window.confirm('確認將此單據出貨？系統將執行 Transaction 實體扣帳並解除虛擬鎖定。')) {
      setRequests(requests.map(req => req.id === id ? { ...req, status: 'SHIPPED' } : req));
      alert('出貨成功！(Transaction COMMIT: 狀態更新成功，稽核日誌已寫入)');
    }
  };

  return (
    <div className="card-surface">
      <h1 className="page-title" style={{ marginBottom: '8px' }}>出貨審核看板 (Warehouse 面板)</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>倉管專用介面。可檢視金額與實體庫存，確認出庫後系統將發起 Transaction 扣減實體數量。</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {requests.map(req => (
          <div key={req.id} style={{ border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
            {/* 單頭區塊 */}
            <div style={{ backgroundColor: req.status === 'PENDING' ? '#fff8e1' : '#e8f5e9', padding: '16px 24px', display: 'flex', borderBottom: '1px solid #e0e0e0', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: req.status === 'PENDING' ? '#f57f17' : '#2e7d32', fontWeight: 600 }}>
                  {req.status === 'PENDING' ? <Clock size={20} /> : <CheckCircle size={20} />}
                  {req.status === 'PENDING' ? '待出貨 (鎖定中)' : '已出貨 (已扣實體)'}
                </div>
                <div>
                  <span style={{ color: '#666', fontSize: '0.9rem', marginRight: '8px' }}>單號:</span>
                  <span style={{ fontWeight: 500 }}>{req.request_no}</span>
                </div>
                <div>
                  <span style={{ color: '#666', fontSize: '0.9rem', marginRight: '8px' }}>對象:</span>
                  <span style={{ fontWeight: 500 }}>{req.recipient}</span>
                </div>
              </div>
              <div style={{ color: '#888', fontSize: '0.85rem' }}>申請時間: {req.created_at}</div>
            </div>

            {/* 明細區塊 */}
            <div style={{ padding: '24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left', color: '#555', fontSize: '0.9rem' }}>
                    <th style={{ paddingBottom: '12px' }}>品項名稱</th>
                    <th style={{ paddingBottom: '12px', textAlign: 'center' }}>實體庫存</th>
                    <th style={{ paddingBottom: '12px', textAlign: 'right' }}>單價</th>
                    <th style={{ paddingBottom: '12px', textAlign: 'center' }}>申請數量</th>
                    <th style={{ paddingBottom: '12px', textAlign: 'right' }}>小計金額</th>
                  </tr>
                </thead>
                <tbody>
                  {req.items.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '16px 0', fontWeight: 500, color: 'var(--primary-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Package size={20} color="#888" /> {item.name}
                        </div>
                      </td>
                      <td style={{ padding: '16px 0', textAlign: 'center', color: '#666' }}>{item.physical_stock}</td>
                      <td style={{ padding: '16px 0', textAlign: 'right', color: '#666' }}>
                        {item.currency} {Number(item.purchase_price).toLocaleString()}
                      </td>
                      <td style={{ padding: '16px 0', textAlign: 'center', fontWeight: 600, fontSize: '1.1rem' }}>{item.qty}</td>
                      <td style={{ padding: '16px 0', textAlign: 'right', fontWeight: 500 }}>
                        {item.currency} {(item.purchase_price * item.qty).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} style={{ padding: '16px 0', textAlign: 'right', fontWeight: 600, color: '#555' }}>總計金額：</td>
                    <td style={{ padding: '16px 0', textAlign: 'right', fontWeight: 600, fontSize: '1.1rem', color: '#1976d2' }}>
                      TWD {req.items.reduce((sum, i) => sum + (i.purchase_price * i.qty), 0).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 操作區塊 */}
              {req.status === 'PENDING' && (
                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => handleConfirm(req.id)}
                    style={{ padding: '12px 24px', backgroundColor: '#2e7d32', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(46,125,50,0.2)' }}
                  >
                    <CheckCircle size={20} />
                    確認實體出貨 (扣帳)
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WarehouseReview;
