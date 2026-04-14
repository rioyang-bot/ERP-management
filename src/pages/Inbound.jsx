import React, { useState } from 'react';
import { Plus, Trash2, Save, Send } from 'lucide-react';

const Inbound = () => {
  // 模擬基礎單據資訊
  const [orderNo] = useState(`IN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-001`);
  const [items, setItems] = useState([{ id: 1, itemId: '', sn: '', price: 0, qty: 1 }]);

  const handleAddItem = () => {
    setItems([...items, { id: Date.now(), itemId: '', sn: '', price: 0, qty: 1 }]);
  };

  const handleRemove = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleSubmit = () => {
    if (window.confirm('確認將此單據入庫？這將更新財務單價並增加實體庫存。')) {
      alert('入庫成功！');
      setItems([{ id: Date.now(), itemId: '', sn: '', price: 0, qty: 1 }]);
    }
  };

  return (
    <div className="card-surface">
      <h1 className="page-title">新增進貨單 (Inbound Receipt)</h1>
      
      {/* 單頭資訊 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #eee' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 500 }}>進貨單號 (自動生成)</label>
          <input disabled value={orderNo} style={{ width: '100%', padding: '10px', backgroundColor: '#f1f3f4', border: '1px solid #ddd', borderRadius: '6px', color: '#666' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 500 }}>供應商</label>
          <select style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px' }}>
            <option value="">請選擇供應商</option>
            <option>零件王供應商</option>
            <option>蘋果授權經銷商</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 500 }}>進貨日期</label>
          <input type="date" defaultValue={new Date().toISOString().slice(0,10)} style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px' }} />
        </div>
      </div>

      {/* 明細列表 */}
      <h3 style={{ marginBottom: '16px', color: 'var(--primary-color)' }}>進貨明細</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f8f9fa' }}>
            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: 600 }}>品項</th>
            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: 600 }}>SN(設備序號)</th>
            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: 600 }}>實際採購單價</th>
            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontWeight: 600 }}>數量</th>
            <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ddd', fontWeight: 600 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map(row => (
            <tr key={row.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '12px 8px' }}>
                <select style={{ width: '100%', padding: '8px', borderRadius:'4px', border:'1px solid #ccc' }}>
                  <option value="">選取品項</option>
                  <option>MacBook Pro 16"</option>
                  <option>Dell XPS 15</option>
                </select>
              </td>
              <td style={{ padding: '12px 8px' }}><input placeholder="若是設備請填SN" style={{ width: '100%', padding: '8px', borderRadius:'4px', border:'1px solid #ccc' }} /></td>
              <td style={{ padding: '12px 8px' }}><input type="number" placeholder="0.00" style={{ width: '100%', padding: '8px', borderRadius:'4px', border:'1px solid #ccc' }} /></td>
              <td style={{ padding: '12px 8px' }}><input type="number" defaultValue="1" style={{ width: '100%', padding: '8px', borderRadius:'4px', border:'1px solid #ccc' }} /></td>
              <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                <button onClick={() => handleRemove(row.id)} style={{ background:'none', border:'none', color:'#d32f2f', cursor:'pointer' }} title="移除">
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button onClick={handleAddItem} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#e3f2fd', color: '#1976d2', border: 'none', borderRadius: '6px', cursor: 'pointer', marginBottom: '32px', fontWeight: 500, transition: 'all 0.2s' }}>
        <Plus size={16} /> 加入品項
      </button>

      {/* 底部操作 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', borderTop: '1px solid #eee', paddingTop: '24px' }}>
        <button style={{ padding: '12px 24px', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>儲存草稿</button>
        <button onClick={handleSubmit} style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap:'8px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
          <Send size={18} /> 確認入庫
        </button>
      </div>
    </div>
  );
};

export default Inbound;
