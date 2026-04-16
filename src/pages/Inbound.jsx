import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, Send, Upload, FileText, Image as ImageIcon, ShoppingBag } from 'lucide-react';

const Inbound = () => {
  // 實體品項清單 & 待核對採購單
  const [availableItems, setAvailableItems] = useState([]);
  const [pendingPurchases, setPendingPurchases] = useState([]);
  
  // 基礎單據資訊
  const [orderNo] = useState(() => `IN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*1000)}`);
  const [items, setItems] = useState([{ id: 1, itemId: '', purchaseRecordId: '', type: '', unit: '', sn: '', price: '', qty: 1 }]);
  const [invoicePreview, setInvoicePreview] = useState(null);
  const [partnerId, setPartnerId] = useState('');
  const [partners, setPartners] = useState([]);

  // 快速新增品項的 Modal 狀態
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddData, setQuickAddData] = useState({ 
    name: '', type_cat: 'ASSET', type: '', brand: '', 
    custodian: '', spec: '', unit: '個' 
  });
  const UNIFIED_UNITS = ['個', '台', '盒', '包', '支', '組', '瓶', '卷', '張', '份'];
  const [activeRowId, setActiveRowId] = useState(null);

  const fetchData = useCallback(async () => {
    const [itemsRes, partnersRes, purchasesRes] = await Promise.all([
      window.electronAPI.dbQuery(`
        SELECT i.id, i.specification, i.type, i.brand, i.unit, c.name as cat_name 
        FROM items i 
        LEFT JOIN categories c ON i.category_id = c.id 
        ORDER BY i.id DESC
      `),
      window.electronAPI.dbQuery("SELECT id, name FROM partners WHERE partner_type = 'SUPPLIER'"),
      window.electronAPI.dbQuery(`
        SELECT pr.*, p.name as partner_name, c.name as category_name
        FROM purchase_records pr
        LEFT JOIN partners p ON pr.partner_id = p.id
        LEFT JOIN categories c ON pr.category_id = c.id
        WHERE pr.status != 'COMPLETED'
      `)
    ]);

    if (itemsRes.success) {
      setAvailableItems(itemsRes.rows.map(i => ({
        ...i,
        name: i.specification,
        type: i.cat_name === '資訊設備' ? 'ASSET' : 'CONSUMABLE'
      })));
    }
    if (partnersRes.success) setPartners(partnersRes.rows);
    if (purchasesRes.success) setPendingPurchases(purchasesRes.rows);
  }, []);

  useEffect(() => {
    const init = async () => {
      await fetchData();
    };
    init();
  }, [fetchData]);

  const handleInvoiceChange = (e) => {
    const file = e.target.files[0];
    if (file) setInvoicePreview(URL.createObjectURL(file));
  };

  const handleAddItem = () => {
    setItems([...items, { id: Date.now(), itemId: '', purchaseRecordId: '', type: '', unit: '', sn: '', price: '', qty: 1 }]);
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
    const selected = availableItems.find(i => i.id.toString() === value.toString());
    setItems(items.map(row => row.id === rowId ? { 
      ...row, 
      itemId: value, 
      type: selected?.type || '',
      unit: selected?.unit || '個'
    } : row));
  };

  const handlePurchaseSelect = (rowId, poId) => {
    const po = pendingPurchases.find(p => p.id.toString() === poId.toString());
    if (!po) return;

    // 自動填入合作伙伴 (如果尚未填寫)
    if (!partnerId) setPartnerId(po.partner_id.toString());

    // 嘗試尋找是否已有對應的品項 (根據規格)
    const existingItem = availableItems.find(i => i.specification === po.specification);

    setItems(items.map(row => row.id === rowId ? {
      ...row,
      purchaseRecordId: poId,
      itemId: existingItem ? existingItem.id : '',
      type: po.category_name === '資訊設備' ? 'ASSET' : 'CONSUMABLE',
      unit: po.unit,
      price: po.unit_price,
      qty: po.quantity - po.received_quantity
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
      await fetchData();
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
    if (items.some(i => !i.itemId)) return alert('請確認所有明細均已連結至庫存品項\n若無對應品項，請使用「快速新增」');

    if (window.confirm('確認將此單據入庫？這將建立正式單據並增加庫存。')) {
      const orderRes = await window.electronAPI.dbQuery(
        'INSERT INTO inbound_orders (order_no, partner_id, status) VALUES ($1, $2, $3) RETURNING id',
        [orderNo, partnerId, 'COMPLETED']
      );

      if (orderRes.success) {
        const orderId = orderRes.rows[0].id;
        for (const item of items) {
          // 1. 建立進貨明細
          await window.electronAPI.dbQuery(
            'INSERT INTO inbound_items (inbound_order_id, item_id, sn, unit_price, quantity, purchase_record_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [orderId, item.itemId, item.sn, item.price || 0, item.qty, item.purchaseRecordId || null]
          );

          // 2. 如果有關聯採購單，更新採購單進度
          if (item.purchaseRecordId) {
            await window.electronAPI.dbQuery(`
              UPDATE purchase_records 
              SET received_quantity = received_quantity + $1,
                  status = CASE 
                    WHEN received_quantity + $1 >= quantity THEN 'COMPLETED'
                    ELSE 'PARTIAL'
                  END,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `, [item.qty, item.purchaseRecordId]);
          }
        }
        alert('進貨入庫成功！');
        setItems([{ id: Date.now(), itemId: '', purchaseRecordId: '', type: '', unit: '', sn: '', price: '', qty: 1 }]);
        setInvoicePreview(null);
        fetchData();
      } else {
        alert('入庫失敗：' + orderRes.error);
      }
    }
  };

  return (
    <div className="card-surface">
      <h1 className="page-title">進貨入庫 (Inbound Receipt)</h1>

      {/* 待處理提醒 */}
      {pendingPurchases.length > 0 && (
        <div style={{ 
          backgroundColor: '#fff8e1', 
          borderLeft: '6px solid #ffb300', 
          padding: '16px 24px', 
          marginBottom: '32px', 
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ 
              backgroundColor: '#ffb300', color: '#fff', borderRadius: '50%', 
              width: '40px', height: '40px', display: 'flex', 
              alignItems: 'center', justifyContent: 'center', 
              fontWeight: 800, fontSize: '1.2rem',
              boxShadow: '0 2px 8px rgba(255,179,0,0.4)'
            }}>
              {pendingPurchases.length}
            </div>
            <div>
              <div style={{ fontWeight: 800, color: '#5f4b00', fontSize: '1.1rem' }}>有 {pendingPurchases.length} 筆採購案件待入庫</div>
              <div style={{ fontSize: '0.9rem', color: '#856404', marginTop: '2px' }}>請點擊下方明細中的「對應採購單」進行核對與數量載入。</div>
            </div>
          </div>
          <FileText size={40} color="#ffb300" style={{ opacity: 0.3 }} />
        </div>
      )}
      
      {/* 單頭資訊 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #eee' }}>
        <div>
          <label style={labelStyle}>進貨單號</label>
          <input disabled value={orderNo} style={{ ...inputStyle, backgroundColor: '#f5f5f5', color: '#666' }} />
        </div>
        <div>
          <label style={labelStyle}>供應商</label>
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={inputStyle}>
            <option value="">請選擇供應商</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>進貨日期</label>
          <input type="date" defaultValue={new Date().toISOString().slice(0,10)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>發票圖檔 (Invoice)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ ...inputStyle, flex: 1, height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '1px dashed #ccc', cursor: 'pointer', fontSize: '0.85rem' }}>
              <Upload size={16} color="#666" /> <span>上傳發票</span>
              <input type="file" accept="image/*" onChange={handleInvoiceChange} style={{ display: 'none' }} />
            </label>
            {invoicePreview && <img src={invoicePreview} alt="p" style={{ width: '42px', height: '42px', borderRadius: '6px', objectFit: 'cover' }} />}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} /> 入庫明細
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#888' }}>* 若為採購單到貨，請先選擇對應的「採購單」以自動帶入資訊。</p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f8f9fa', textAlign: 'left' }}>
            <th style={thStyle}>對應採購單 (選填)</th>
            <th style={thStyle}>入庫品項 (庫存檔)</th>
            <th style={thStyle}>序號 (資產)</th>
            <th style={thStyle}>採購價</th>
            <th style={thStyle}>入庫量</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map(row => (
            <tr key={row.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={tdStyle}>
                <select 
                  value={row.purchaseRecordId} 
                  onChange={(e) => handlePurchaseSelect(row.id, e.target.value)}
                  style={{ ...inputStyle, backgroundColor: row.purchaseRecordId ? '#fff8e1' : '#fff' }}
                >
                  <option value="">-- 非採購單入庫 --</option>
                  {pendingPurchases.map(p => (
                    <option key={p.id} value={p.id}>
                       [{p.order_no}] {p.specification} (剩餘 {p.quantity - p.received_quantity})
                    </option>
                  ))}
                </select>
              </td>
              <td style={tdStyle}>
                <select 
                  value={row.itemId}
                  onChange={(e) => handleItemSelect(row.id, e.target.value)}
                  style={{ ...inputStyle, backgroundColor: row.itemId ? '#e8f5e9' : '#fff' }}
                >
                  <option value="">選取庫存品項</option>
                  {availableItems.map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.type === 'ASSET' ? '資產' : '耗材'})</option>
                  ))}
                  <option value="NEW_ITEM" style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>+ 快速新增品項</option>
                </select>
              </td>
              <td style={tdStyle}>
                {row.type === 'CONSUMABLE' ? (
                  <span style={{ color: '#aaa', fontSize: '0.8rem' }}>耗材免序號</span>
                ) : (
                  <input placeholder="SN" value={row.sn} onChange={(e) => handleRowChange(row.id, 'sn', e.target.value)} style={inputStyle} />
                )}
              </td>
              <td style={tdStyle}>
                <input type="number" placeholder="0" value={row.price} onChange={(e) => handleRowChange(row.id, 'price', e.target.value)} style={inputStyle} />
              </td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input type="number" value={row.qty} onChange={(e) => handleRowChange(row.id,'qty', parseInt(e.target.value)||0)} style={{ ...inputStyle, width: '60px' }} />
                  <span style={{ fontSize: '0.8rem', color: '#666' }}>{row.unit}</span>
                </div>
              </td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>
                <button onClick={() => handleRemove(row.id)} style={{ color: '#d32f2f', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={18} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button onClick={handleAddItem} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#f0f4f8', color: '#1a73e8', border: 'none', borderRadius: '6px', cursor: 'pointer', marginBottom: '40px', fontWeight: 600 }}>
        <Plus size={16} /> 增加一列
      </button>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', borderTop: '2px solid #f8f9fa', paddingTop: '24px' }}>
        <button style={{ padding: '12px 24px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>暫存草稿</button>
        <button onClick={handleSubmit} style={{ padding: '12px 28px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(26,115,232,0.2)' }}>
          <ShoppingBag size={18} /> 核對並入庫
        </button>
      </div>

      {/* Quick Add Modal (same as before but integrated) */}
      {showQuickAdd && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="card-surface" style={{ width: '440px', padding: '32px' }}>
            <h2 style={{ marginBottom: '24px', fontSize: '1.25rem' }}>快速新增品項</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>品項名稱 *</label>
                <input type="text" value={quickAddData.name} onChange={(e) => setQuickAddData({...quickAddData, name: e.target.value})} style={inputStyle} placeholder="例如：Logitech G Pro" />
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>類別</label>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><input type="radio" checked={quickAddData.type_cat === 'ASSET'} onChange={() => setQuickAddData({...quickAddData, type_cat: 'ASSET'})} /> 資產</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}><input type="radio" checked={quickAddData.type_cat === 'CONSUMABLE'} onChange={() => setQuickAddData({...quickAddData, type_cat: 'CONSUMABLE'})} /> 耗材</label>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>單位</label>
                  <select value={quickAddData.unit} onChange={(e) => setQuickAddData({...quickAddData, unit: e.target.value})} style={inputStyle}>
                    {UNIFIED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div><label style={labelStyle}>類型 (Type)</label><input type="text" value={quickAddData.type} onChange={(e) => setQuickAddData({...quickAddData, type: e.target.value})} style={inputStyle} /></div>
                <div><label style={labelStyle}>廠牌 (Brand)</label><input type="text" value={quickAddData.brand} onChange={(e) => setQuickAddData({...quickAddData, brand: e.target.value})} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>規格 (Spec)</label><input type="text" value={quickAddData.spec} onChange={(e) => setQuickAddData({...quickAddData, spec: e.target.value})} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '32px' }}>
              <button onClick={() => setShowQuickAdd(false)} style={{ padding: '10px 20px', background: '#f5f5f5', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>取消</button>
              <button onClick={handleQuickAddSave} style={{ padding: '10px 20px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>儲存並自動帶入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '8px' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem', outline: 'none' };
const thStyle = { padding: '12px', borderBottom: '2px solid #ddd', fontWeight: 600, color: '#666', fontSize: '0.85rem' };
const tdStyle = { padding: '12px 8px' };

export default Inbound;
