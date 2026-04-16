import React, { useState, useContext, useEffect } from 'react';
import { PackageOpen, AlertTriangle, CheckCircle2, Package, Image as ImageIcon } from 'lucide-react';
import ImageModal from '../components/ImageModal';
import { RoleContext } from '../context/RoleContext';

const Inventory = () => {
  const { role } = useContext(RoleContext);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      const res = await window.electronAPI.dbQuery(
        'SELECT item_id as id, master_sn as sn, item_name as name, safety_stock, purchase_price, currency, image_path as image, physical_qty, locked_qty, available_qty FROM v_inventory_summary'
      );
      if (!ignore && res.success) {
        setInventory(res.rows);
      }
      if (!ignore) setLoading(false);
    };
    load();
    return () => { ignore = true; };
  }, []);

  const openPreview = (url) => {
    if (!url) return;
    setPreviewImage(url);
    setModalOpen(true);
  };

  const totalValue = inventory.reduce((sum, item) => sum + (item.purchase_price * item.physical_qty), 0);
  const pendingRequests = inventory.reduce((sum, item) => sum + item.locked_qty, 0);
  const lowStockCount = inventory.filter(item => item.available_qty < item.safety_stock).length;

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: '24px' }}>庫存總表 (Inventory Dashboard)</h1>
 
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--primary-color)' }}>
          載入中...
        </div>
      )}

      {/* 頂部三個大型數字卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: role === 'WAREHOUSE' ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: '24px', marginBottom: '24px' }}>
        
        {role === 'WAREHOUSE' && (
          <div className="card-surface" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px', margin: 0 }}>
            <div style={{ backgroundColor: '#e3f2fd', padding: '16px', borderRadius: '12px', color: '#1976d2' }}>
              <PackageOpen size={32} />
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '4px' }}>總資產價值 (Total Value)</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-main)' }}>TWD {totalValue.toLocaleString()}</div>
            </div>
          </div>
        )}

        <div className="card-surface" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px', margin: 0 }}>
          <div style={{ backgroundColor: '#f3e5f5', padding: '16px', borderRadius: '12px', color: '#7b1fa2' }}>
            <Package size={32} />
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '4px' }}>待處理申請數 (Locked)</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-main)' }}>{pendingRequests} 件</div>
          </div>
        </div>

        <div className="card-surface" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px', margin: 0, border: lowStockCount > 0 ? '1px solid #ffccbc' : 'none' }}>
          <div style={{ backgroundColor: lowStockCount > 0 ? '#fbe9e7' : '#e8f5e9', padding: '16px', borderRadius: '12px', color: lowStockCount > 0 ? '#d32f2f' : '#2e7d32' }}>
            {lowStockCount > 0 ? <AlertTriangle size={32} /> : <CheckCircle2 size={32} />}
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '4px' }}>低水位品項數 (Low Stock)</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 600, color: lowStockCount > 0 ? '#d32f2f' : '#2e7d32' }}>{lowStockCount} 項</div>
          </div>
        </div>
      </div>

      {/* 庫存列表 */}
      <div className="card-surface">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, color: 'var(--text-main)' }}>各品項庫存狀態明細</h3>
          {lowStockCount > 0 && (
            <button style={{ padding: '8px 16px', backgroundColor: '#fff3e0', color: '#e65100', border: '1px solid #ffe0b2', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
              篩選低庫存品項以進貨
            </button>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f1f3f4', textAlign: 'left' }}>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>縮圖</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>品項名稱 / SN</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd', textAlign: 'center' }}>實體 (Physical)</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd', textAlign: 'center' }}>鎖定 (Locked)</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd', textAlign: 'center' }}>可用 (Available)</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd', textAlign: 'center' }}>安全水位</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map(item => {
              const isLowStock = item.available_qty < item.safety_stock;
              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #eee', backgroundColor: isLowStock ? '#fffaf8' : 'transparent' }}>
                  <td style={{ padding: '12px' }}>
                    <div 
                      onClick={() => openPreview(item.image ? window.getMediaUrl(`erp-media:///${item.image}`) : null)}
                      style={{ 
                        width: '40px', height: '40px', borderRadius: '6px', backgroundColor: '#e0e0e0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: item.image ? 'pointer' : 'default', overflow: 'hidden'
                      }}
                    >
                      {item.image ? (
                        <img src={window.getMediaUrl(`erp-media:///${item.image}`)} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <ImageIcon size={20} color="#aaa" />
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{item.name}</div>
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>{item.sn}</div>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: 500, color: '#555' }}>
                    {item.physical_qty}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: 500, color: '#888' }}>
                    {item.locked_qty}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: isLowStock ? '#d32f2f' : '#2e7d32', fontSize: '1.1rem' }}>
                    {item.available_qty}
                    {isLowStock && <AlertTriangle size={14} style={{ marginLeft: '4px', verticalAlign: 'text-bottom' }} />}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#666' }}>
                    {item.safety_stock}
                  </td>
                </tr>
              );
            })}
            {!loading && inventory.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  目前尚無庫存資料
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ImageModal isOpen={modalOpen} imageUrl={previewImage} onClose={() => setModalOpen(false)} />
    </div>
  );
};

export default Inventory;
