import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, AlertTriangle, TrendingUp } from 'lucide-react';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalValue: 0,
    lowStock: 0,
    draftOrders: 0,
    totalItems: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      const queries = [
        'SELECT COUNT(*) as total_items FROM v_inventory_summary',
        'SELECT COUNT(*) as low_stock FROM v_inventory_summary WHERE available_qty < safety_stock',
        'SELECT COUNT(*) as draft_orders FROM inbound_orders WHERE status = \'DRAFT\''
      ];

      const results = await Promise.all(queries.map(q => window.electronAPI.dbQuery(q)));
      
      if (!ignore && results.every(r => r.success)) {
        setStats({
          totalItems: results[0].rows[0].total_items || 0,
          lowStock: results[1].rows[0].low_stock || 0,
          draftOrders: results[2].rows[0].draft_orders || 0
        });
      }
      if (!ignore) setLoading(false);
    };
    load();
    return () => { ignore = true; };
  }, []);

  return (
    <div className="dashboard-container">
      <h1 className="page-title" style={{ marginBottom: '24px' }}>數據總覽 (Dashboard)</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '32px' }}>
        {/* 品項總數 */}
        <div className="card-surface" style={{ padding: '24px', margin: 0, borderLeft: '4px solid #388e3c' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>存貨品項總數</p>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {loading ? '...' : stats.totalItems} <span style={{fontSize: '0.9rem', fontWeight: 400}}>{!loading && '項'}</span>
              </h2>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '8px', color: '#388e3c' }}>
              <Package size={24} />
            </div>
          </div>
        </div>
 
        {/* 低庫存警告 */}
        <div className="card-surface" style={{ padding: '24px', margin: 0, borderLeft: `4px solid ${!loading && stats.lowStock > 0 ? '#d32f2f' : '#ccc'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>低庫存預警</p>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: !loading && stats.lowStock > 0 ? '#d32f2f' : 'var(--text-main)' }}>
                {loading ? '...' : stats.lowStock} <span style={{fontSize: '0.9rem', fontWeight: 400}}>{!loading && '項'}</span>
              </h2>
            </div>
            <div style={{ padding: '10px', backgroundColor: !loading && stats.lowStock > 0 ? '#ffebee' : '#f5f5f5', borderRadius: '8px', color: !loading && stats.lowStock > 0 ? '#d32f2f' : '#666' }}>
              <AlertTriangle size={24} />
            </div>
          </div>
        </div>
 
        {/* 待處理單據 */}
        <div className="card-surface" style={{ padding: '24px', margin: 0, borderLeft: '4px solid #f57c00' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '8px' }}>待處理進貨單</p>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {loading ? '...' : stats.draftOrders} <span style={{fontSize: '0.9rem', fontWeight: 400}}>{!loading && '張'}</span>
              </h2>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#fff3e0', borderRadius: '8px', color: '#f57c00' }}>
              <ShoppingCart size={24} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        <div className="card-surface" style={{ minHeight: '300px' }}>
          <h3 style={{ marginBottom: '20px' }}>近期入庫趨勢</h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px dashed #ccc', color: '#888' }}>
            圖表模組載入中...
          </div>
        </div>
        
        <div className="card-surface" style={{ minHeight: '300px' }}>
          <h3 style={{ marginBottom: '20px' }}>快速維護</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button style={{ padding: '12px', textAlign: 'left', borderRadius: '8px', border: '1px solid #eee', backgroundColor: '#fff', cursor: 'pointer', hover: { backgroundColor: '#f0f0f0' } }}>
              生成本月庫存報表
            </button>
            <button style={{ padding: '12px', textAlign: 'left', borderRadius: '8px', border: '1px solid #eee', backgroundColor: '#fff', cursor: 'pointer' }}>
              檢查異常 SN 紀錄
            </button>
            <button style={{ padding: '12px', textAlign: 'left', borderRadius: '8px', border: '1px solid #eee', backgroundColor: '#fff', cursor: 'pointer' }}>
              更新供應商聯絡清單
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
