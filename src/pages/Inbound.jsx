import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, Send, Upload, FileText, Image as ImageIcon } from 'lucide-react';

const Inbound = () => {
  // 實體品項清單
  const [availableItems, setAvailableItems] = useState([]);

  // 模擬基礎單據資訊
  const [orderNo] = useState(() => `IN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*1000)}`);
  const [items, setItems] = useState([{ id: 1, itemId: '', type: '', unit: '', sn: '', price: '', qty: 1 }]);
  const [invoicePreview, setInvoicePreview] = useState(null);
  const [partnerId, setPartnerId] = useState('');
  const [partners, setPartners] = useState([]);

  // 快速新增品項的 Modal 狀態
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddData, setQuickAddData] = useState({ 
    name: '', type_cat: 'ASSET', type: '', brand: '', 
    custodian: '', spec: '', unit: '個' 
  });
  const [activeRowId, setActiveRowId] = useState(null);

  const fetchAvailableItems = useCallback(async () => {
    const res = await window.electronAPI.dbQuery(`
      SELECT i.id, i.specification, i.type, i.brand, i.unit, c.name as cat_name 
      FROM items i 
      LEFT JOIN categories c ON i.category_id = c.id 
      ORDER BY i.id DESC
    `);
    if (res.success) {
      const mapped = res.rows.map(i => ({
        ...i,
        name: i.specification, // 為了相容前端舊有的 .name 引用
        type: i.cat_name === '資訊設備' ? 'ASSET' : 'CONSUMABLE'
      }));
      setAvailableItems(mapped);
    }
  }, []);

  const fetchPartners = useCallback(async () => {
    const res = await window.electronAPI.dbQuery("SELECT id, name FROM partners WHERE partner_type = 'SUPPLIER'");
    if (res.success) {
      setPartners(res.rows);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    
    const load = async () => {
      await fetchAvailableItems();
      if (!ignore) await fetchPartners();
    };

    load();
    return () => { ignore = true; };
  }, [fetchAvailableItems, fetchPartners]);

  const handleInvoiceChange = (e) => {
    const file = e.target.files[0];
    if (file) setInvoicePreview(URL.createObjectURL(file));
  };

  const handleAddItem = () => {
    setItems([...items, { id: Date.now(), itemId: '', type: '', unit: '', sn: '', price: '', qty: 1 }]);
  };

  const handleRemove = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleItemSelect = (rowId, value) => {
    if (value === 'NEW_ITEM') {
      setActiveRowId(rowId);
      setShowQuickAdd(true);
      return;
    }
    
    // 找出選取的品項資訊
    const selected = availableItems.find(i => i.id.toString() === value.toString());
    
    setItems(items.map(row => row.id === rowId ? { 
      ...row, 
      itemId: value, 
      type: selected?.type || '',
      unit: selected?.unit || '個'
    } : row));
  };

  const handleRowChange = (rowId, field, value) => {
    setItems(items.map(row => row.id === rowId ? { ...row, [field]: value } : row));
  };

  const handleQuickAddSave = async () => {
    if (!quickAddData.name) return alert('請輸入品項名稱');
    
    const generatedSN = `AUTO-${Date.now()}`;
    const fullSpec = `${quickAddData.name} ${quickAddData.spec ? `(${quickAddData.spec})` : ''}`.trim();
    
    const res = await window.electronAPI.dbQuery(
      'INSERT INTO items (sn, specification, type, brand, unit, custodian, category_id) VALUES ($1, $2, $3, $4, $5, $6, (SELECT id FROM categories WHERE name = $7)) RETURNING id',
      [generatedSN, fullSpec, quickAddData.type, quickAddData.brand, quickAddData.unit, quickAddData.custodian, quickAddData.type === 'ASSET' ? '資訊設備' : '辦公耗材']
    );

    if (res.success) {
      const newId = res.rows[0].id;
      await fetchAvailableItems();
      
      setItems(items.map(row => row.id === activeRowId ? { 
        ...row, 
        itemId: newId,
        type: quickAddData.type,
        unit: quickAddData.unit
      } : row));
      
      setShowQuickAdd(false);
      setQuickAddData({ name: '', type_cat: 'ASSET', type: '', brand: '', custodian: '', spec: '', unit: '個' });
    } else {
      alert('新增失敗：' + res.error);
    }
  };

  const handleSubmit = async () => {
    if (!partnerId) return alert('請選擇供應商');
    if (items.some(i => !i.itemId)) return alert('請確認所有明細已選取品項');

    if (window.confirm('確認將此單據入庫？這將建立正式單據並增加庫存。')) {
      // 1. 建立進貨單
      const orderRes = await window.electronAPI.dbQuery(
        'INSERT INTO inbound_orders (order_no, partner_id, status) VALUES ($1, $2, $3) RETURNING id',
        [orderNo, partnerId, 'COMPLETED']
      );

      if (orderRes.success) {
        const orderId = orderRes.rows[0].id;
        
        // 2. 建立明細
        for (const item of items) {
          await window.electronAPI.dbQuery(
            'INSERT INTO inbound_items (inbound_order_id, item_id, sn, unit_price, quantity) VALUES ($1, $2, $3, $4, $5)',
            [orderId, item.itemId, item.sn, item.price || 0, item.qty]
          );
        }

        alert('進貨入庫成功！');
        setItems([{ id: Date.now(), itemId: '', type: '', unit: '', sn: '', price: '', qty: 1 }]);
        setInvoicePreview(null);
      } else {
        alert('入庫失敗：' + orderRes.error);
      }
    }
  };

  return (
    <div className="card-surface" style={{ position: 'relative' }}>
      <h1 className="page-title">新增進貨單 (Inbound Receipt)</h1>
      
      {/* 單頭資訊 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #eee' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 500 }}>進貨單號 (自動生成)</label>
          <input disabled value={orderNo} style={{ width: '100%', padding: '10px', backgroundColor: '#f1f3f4', border: '1px solid #ddd', borderRadius: '6px', color: '#666' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 500 }}>供應商</label>
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px' }}>
            <option value="">請選擇供應商</option>
            {partners.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 500 }}>進貨日期</label>
          <input type="date" defaultValue={new Date().toISOString().slice(0,10)} style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 500 }}>發票圖檔 (Invoice)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{
              flex: 1, height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              backgroundColor: '#f8f9fa', border: '1px dashed #ccc', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem'
            }}>
              <Upload size={16} color="#666" />
              <span>點擊上傳</span>
              <input type="file" accept="image/*" onChange={handleInvoiceChange} style={{ display: 'none' }} />
            </label>
            {invoicePreview && (
              <div style={{ width: '42px', height: '42px', backgroundColor: '#eee', borderRadius: '6px', overflow: 'hidden', border: '1px solid #ddd' }}>
                <img src={invoicePreview} alt="invoice preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
          </div>
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
                <select 
                  value={row.itemId}
                  onChange={(e) => handleItemSelect(row.id, e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius:'4px', border:'1px solid #ccc', backgroundColor: row.itemId ? '#f0f7ff' : '#fff' }}
                >
                  <option value="">選取品項</option>
                  {availableItems.map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.type === 'ASSET' ? '資產' : '耗材'})</option>
                  ))}
                  <option value="NEW_ITEM" style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>+ 快速新增新品項</option>
                </select>
              </td>
              <td style={{ padding: '12px 8px' }}>
                {row.type === 'CONSUMABLE' ? (
                  <div style={{ color: '#aaa', fontSize: '0.85rem', fontStyle: 'italic' }}>不適用 (耗材)</div>
                ) : (
                  <input 
                    placeholder={row.type === 'ASSET' ? "請輸入序號" : "先選取品項"} 
                    value={row.sn}
                    onChange={(e) => handleRowChange(row.id, 'sn', e.target.value)}
                    disabled={!row.type}
                    style={{ width: '100%', padding: '8px', borderRadius:'4px', border:'1px solid #ccc', backgroundColor: !row.type ? '#f9f9f9' : '#fff' }} 
                  />
                )}
              </td>
              <td style={{ padding: '12px 8px' }}>
                <input 
                  type="number" 
                  placeholder="0.00" 
                  value={row.price}
                  onChange={(e) => handleRowChange(row.id, 'price', e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius:'4px', border:'1px solid #ccc' }} 
                />
              </td>
              <td style={{ padding: '12px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="number" 
                    value={row.qty}
                    onChange={(e) => handleRowChange(row.id, 'qty', parseInt(e.target.value) || 0)}
                    style={{ width: '60px', padding: '8px', borderRadius:'4px', border:'1px solid #ccc' }} 
                  />
                  <span style={{ fontSize: '0.9rem', color: '#666' }}>{row.unit || (row.type === 'ASSET' ? '台' : '')}</span>
                </div>
              </td>
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

      {/* 快速新增 Modal */}
      {showQuickAdd && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card-surface" style={{ width: '400px', padding: '24px', position: 'relative' }}>
            <h2 style={{ marginBottom: '20px', fontSize: '1.25rem' }}>快速新增品項</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>類別</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="radio" checked={quickAddData.type_cat === 'ASSET'} onChange={() => setQuickAddData({...quickAddData, type_cat: 'ASSET'})} /> 資產
                  </label>
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="radio" checked={quickAddData.type_cat === 'CONSUMABLE'} onChange={() => setQuickAddData({...quickAddData, type_cat: 'CONSUMABLE'})} /> 耗材
                  </label>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>品項名稱 *</label>
                <input 
                  type="text" 
                  value={quickAddData.name} 
                  onChange={(e) => setQuickAddData({...quickAddData, name: e.target.value})} 
                  style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px' }}
                  placeholder="請輸入名稱"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>類型</label>
                  <input 
                    type="text" 
                    value={quickAddData.type} 
                    onChange={(e) => setQuickAddData({...quickAddData, type: e.target.value})} 
                    style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>廠牌</label>
                  <input 
                    type="text" 
                    value={quickAddData.brand} 
                    onChange={(e) => setQuickAddData({...quickAddData, brand: e.target.value})} 
                    style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px' }}
                  />
                </div>
              </div>

              {quickAddData.type_cat === 'ASSET' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>保管人 (Custodian)</label>
                  <input 
                    type="text" 
                    value={quickAddData.custodian} 
                    onChange={(e) => setQuickAddData({...quickAddData, custodian: e.target.value})} 
                    style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px' }}
                    placeholder="請輸入保管人姓名"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>規格 (Specification)</label>
                    <input 
                      type="text" 
                      value={quickAddData.spec} 
                      onChange={(e) => setQuickAddData({...quickAddData, spec: e.target.value})} 
                      style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px' }}
                      placeholder="例如：藍色、500ml"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>單位</label>
                    <select 
                      value={quickAddData.unit} 
                      onChange={(e) => setQuickAddData({...quickAddData, unit: e.target.value})} 
                      style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px' }}
                    >
                      <option value="個">個</option>
                      <option value="條">條</option>
                      <option value="片">片</option>
                      <option value="台">台</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowQuickAdd(false)} style={{ padding: '8px 16px', background: '#eee', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>取消</button>
              <button onClick={handleQuickAddSave} style={{ padding: '8px 16px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>儲存並帶入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inbound;
