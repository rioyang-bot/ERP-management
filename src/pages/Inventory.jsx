import React, { useState, useContext, useEffect } from 'react';
import { PackageOpen, AlertTriangle, CheckCircle2, Package } from 'lucide-react';
import { RoleContext } from '../context/RoleContext';

const Inventory = () => {
  const { role } = useContext(RoleContext);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showOnlyInStock, setShowOnlyInStock] = useState(true);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      const res = await window.electronAPI.dbQuery(
        'SELECT item_id as id, master_sn as sn, item_name as name, safety_stock, physical_qty, locked_qty, available_qty FROM v_inventory_summary'
      );
      if (!ignore && res.success) {
        setInventory(res.rows);
      }
      if (!ignore) setLoading(false);
    };
    load();
    return () => { ignore = true; };
  }, []);

  const filteredInventory = inventory.filter(item => {
    if (showOnlyInStock) return Number(item.physical_qty) > 0;
    return true;
  });

  const pendingRequests = inventory.reduce((sum, item) => sum + Number(item.locked_qty || 0), 0);
  const lowStockCount = inventory.filter(item => Number(item.available_qty) < Number(item.safety_stock)).length;

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: '24px' }}>庫存總表 (Inventory Dashboard)</h1>
 
      {loading && (
        <div style={{ textAlign: 'center', padding: '100px', color: 'var(--primary-color)' }}>載入中...</div>
      )}

      {/* 頂部大型數字卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px', marginBottom: '24px' }}>
        
        <div className="card-surface" style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '24px' }}>
          <div style={{ backgroundColor: '#f3e5f5', padding: '16px', borderRadius: '16px', color: '#7b1fa2' }}><Package size={32} /></div>
          <div>
            <div style={statLabelStyle}>待處理/鎖定數量</div>
            <div style={statValueStyle}>{Number(pendingRequests)} 件</div>
          </div>
        </div>

        <div className="card-surface" style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '24px', border: lowStockCount > 0 ? '1px solid #ffccbc' : 'none' }}>
          <div style={{ backgroundColor: lowStockCount > 0 ? '#fbe9e7' : '#e8f5e9', padding: '16px', borderRadius: '16px', color: lowStockCount > 0 ? '#d32f2f' : '#2e7d32' }}>
            {lowStockCount > 0 ? <AlertTriangle size={32} /> : <CheckCircle2 size={32} />}
          </div>
          <div>
            <div style={statLabelStyle}>低水位品項數</div>
            <div style={{ ...statValueStyle, color: lowStockCount > 0 ? '#d32f2f' : '#2e7d32' }}>{lowStockCount} 項</div>
          </div>
        </div>
      </div>

      {/* 庫存列表 */}
      <div className="card-surface">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <h3 style={{ margin: 0, color: '#333', fontWeight: 800 }}>即時庫存明細狀態</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#666', cursor: 'pointer', backgroundColor: '#f5f5f5', padding: '6px 12px', borderRadius: '8px' }}>
              <input type="checkbox" checked={showOnlyInStock} onChange={(e) => setShowOnlyInStock(e.target.checked)} />
              僅顯示目前有庫存之品項
            </label>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa', textAlign: 'left' }}>
              <th style={thStyle}>品項名稱 / 識別序號 (Master SN)</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>實體總量</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>鎖定中</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>目前可用</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>安全水位</th>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.map(item => {
              const phys = Number(item.physical_qty || 0);
              const locked = Number(item.locked_qty || 0);
              const avail = Number(item.available_qty || 0);
              const safety = Number(item.safety_stock || 0);
              const isLowStock = avail < safety;

              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #eee', backgroundColor: isLowStock ? '#fffaf8' : 'transparent' }}>
                  <td style={{ padding: '16px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--primary-color)', fontSize: '1rem' }}>{item.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '4px', fontFamily: 'monospace' }}>{item.sn}</div>
                  </td>
                  <td style={{ ...tdStyle, color: phys === 0 ? '#ccc' : '#444' }}>{phys === 0 ? '-' : phys}</td>
                  <td style={{ ...tdStyle, color: locked === 0 ? '#ccc' : '#999' }}>{locked === 0 ? '-' : locked}</td>
                  <td style={{ ...tdStyle, fontWeight: 800, color: isLowStock ? '#d32f2f' : (avail === 0 ? '#ccc' : '#2e7d32'), fontSize: '1.1rem' }}>
                    {avail === 0 ? '-' : avail}
                    {isLowStock && avail > 0 && <AlertTriangle size={14} style={{ marginLeft: '6px', verticalAlign: 'middle' }} />}
                  </td>
                  <td style={tdStyle}>{safety}</td>
                </tr>
              );
            })}
            {!loading && filteredInventory.length === 0 && (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: '80px', color: '#999', fontSize: '1rem' }}>目前尚無庫存資料</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const statLabelStyle = { color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '6px', fontWeight: 500 };
const statValueStyle = { fontSize: '1.8rem', fontWeight: 800, color: '#333' };
const thStyle = { padding: '16px', borderBottom: '2px solid #eee', color: '#666', fontWeight: 700, fontSize: '0.9rem' };
const tdStyle = { padding: '16px', textAlign: 'center', fontWeight: 600 };

export default Inventory;
