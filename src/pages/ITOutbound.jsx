import React, { useState } from 'react';
import { ShoppingCart, Send, Plus, Minus, X, Info } from 'lucide-react';
import './ITOutbound.css';

const ITOutbound = () => {
  // 模擬已過濾掉價格的庫存資料
  const [inventory] = useState([
    { id: 1, name: 'MacBook Pro 16"', available_qty: 8, image: '' },
    { id: 2, name: 'Dell XPS 15', available_qty: 2, image: '' },
    { id: 3, name: 'Logitech Mouse MX Master 3', available_qty: 8, image: '' }
  ]);

  const [cart, setCart] = useState([]);

  const handleAddToCart = (item) => {
    const exist = cart.find(c => c.id === item.id);
    if (exist) {
      if (exist.qty < item.available_qty) {
        setCart(cart.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c));
      }
    } else {
      if (item.available_qty > 0) {
        setCart([...cart, { ...item, qty: 1 }]);
      }
    }
  };

  const handleUpdateQty = (id, delta) => {
    setCart(cart.map(c => {
      if (c.id === id) {
        const itemStock = inventory.find(i => i.id === id).available_qty;
        const newQty = Math.max(1, Math.min(itemStock, c.qty + delta));
        return { ...c, qty: newQty };
      }
      return c;
    }));
  };

  const handleRemove = (id) => setCart(cart.filter(c => c.id !== id));

  const handleSubmit = () => {
    if (cart.length === 0) return;
    alert('出貨申請已送出！系統已虛擬鎖定庫存，等待倉管員審核確認。');
    setCart([]);
  };

  return (
    <div className="outbound-layout">
      {/* 左側：設備選擇區 */}
      <div className="asset-selection">
        <h1 className="page-title" style={{ marginBottom: '16px' }}>出貨/領用申請 (IT 面板)</h1>
        
        <div style={{ backgroundColor: '#e3f2fd', color: '#1976d2', padding: '12px 16px', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '24px', fontSize: '0.95rem' }}>
          <Info size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
          <span>請點擊所需發貨的庫存品項加入右側「候選清單」。**系統僅顯示可用庫存**，送出申請後系統將立即扣減可用數（虛擬鎖定），防止重複超領。</span>
        </div>
        
        <div className="asset-grid">
          {inventory.map(item => (
            <div key={item.id} className="asset-card" onClick={() => handleAddToCart(item)}>
              <div className="asset-image-placeholder">
                <span style={{ color: '#999', fontSize: '0.9rem' }}>設備照片縮圖</span>
              </div>
              <div className="asset-info">
                <div className="asset-name">{item.name}</div>
                <div className="asset-stock">
                  可用數量: <span style={{ fontWeight: 600, color: item.available_qty > 0 ? '#2e7d32' : '#d32f2f' }}>
                    {item.available_qty}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右側：玻璃擬態購物車 (Glassmorphism Sidebar) */}
      <div className="cart-sidebar glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <ShoppingCart color="var(--primary-color)" />
          <h2 style={{ fontSize: '1.25rem', color: 'var(--primary-color)' }}>待申請清單</h2>
        </div>

        <div className="cart-items">
          {cart.map(c => (
            <div key={c.id} className="cart-item">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, color: '#333' }}>{c.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '4px' }}>庫存上限: {c.available_qty}</div>
              </div>
              <div className="qty-controls">
                <button onClick={() => handleUpdateQty(c.id, -1)}><Minus size={14}/></button>
                <span>{c.qty}</span>
                <button onClick={() => handleUpdateQty(c.id, 1)}><Plus size={14}/></button>
              </div>
              <button className="remove-btn" onClick={() => handleRemove(c.id)} title="移除"><X size={16}/></button>
            </div>
          ))}
          {cart.length === 0 && (
            <div style={{ textAlign: 'center', color: '#888', padding: '32px 0', fontSize: '0.9rem' }}>
              尚無選擇品項<br/>請從左側點擊加入
            </div>
          )}
        </div>

        <div className="cart-footer">
          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', color: '#555', fontWeight: 500 }}>選擇出庫對象/領用人</label>
          <select style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.1)', marginBottom: '16px', background: 'rgba(255,255,255,0.8)' }}>
            <option>王大明企業 (客戶)</option>
            <option>行銷部 - 陳小美 (內部領用)</option>
          </select>
          <button 
            className="submit-request-btn"
            disabled={cart.length === 0}
            onClick={handleSubmit}
          >
            <Send size={18} /> 提交申請鎖定庫存
          </button>
        </div>
      </div>
    </div>
  );
};
export default ITOutbound;
