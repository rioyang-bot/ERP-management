import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, FileText, ShoppingBag, Layers, AlertCircle } from 'lucide-react';

const Inbound = () => {
  const [availableItems, setAvailableItems] = useState([]);
  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [orderNo] = useState(() => `IN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*1000)}`);
  const [items, setItems] = useState([{ id: 1, itemId: '', purchaseRecordId: '', type: '', unit: '', sn: '', qty: 1 }]);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [partners, setPartners] = useState([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddData, setQuickAddData] = useState({ 
    name: '', type_cat: 'ASSET', type: '', brand: '', 
    custodian: '', spec: '', unit: '個' 
  });
  const UNIFIED_UNITS = ['個', '台', '盒', '包', '支', '組', '瓶', '卷', '張', '份'];
  const [activeRowId, setActiveRowId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [itemsRes, partnersRes, purchasesRes] = await Promise.all([
        window.electronAPI.dbQuery(`
          SELECT i.id, i.specification, i.type, i.brand, i.unit, c.name as cat_name 
          FROM item_master i 
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
          ORDER BY pr.created_at DESC
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
    } catch (err) {
      console.error("Inbound Fetch Error:", err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddItem = () => {
    setItems([...items, { id: Date.now(), itemId: '', purchaseRecordId: '', type: '', unit: '', sn: '', qty: 1 }]);
  };

  const handleRemove = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleExpandRow = (rowId) => {
    const row = items.find(r => r.id === rowId);
    if (!row || row.qty <= 1 || row.type !== 'ASSET') return;
    if (!window.confirm(`確定要將此項目展開為 ${row.qty} 筆獨立資產以分別輸入序號嗎？`)) return;
    const newRows = [];
    for (let i = 0; i < row.qty; i++) {
      newRows.push({ ...row, id: Date.now() + i, qty: 1, sn: '' });
    }
    const idx = items.findIndex(r => r.id === rowId);
    const nextItems = [...items];
    nextItems.splice(idx, 1, ...newRows);
    setItems(nextItems);
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
    if (!partnerId) setPartnerId(po.partner_id.toString());
    const existingItem = availableItems.find(i => i.specification === po.specification);
    setItems(items.map(row => row.id === rowId ? {
      ...row,
      purchaseRecordId: poId,
      itemId: existingItem ? existingItem.id : '',
      type: po.category_name === '資訊設備' ? 'ASSET' : 'CONSUMABLE',
      unit: po.unit,
      qty: po.quantity - (po.received_quantity || 0)
    } : row));
  };

  const handleRowChange = (rowId, field, value) => {
    setItems(items.map(row => row.id === rowId ? { ...row, [field]: value } : row));
  };

  const handleQuickAddSave = async () => {
    if (!quickAddData.name) return alert('請輸入品項名稱');
    const fullSpec = `${quickAddData.name} ${quickAddData.spec ? `(${quickAddData.spec})` : ''}`.trim();
    const res = await window.electronAPI.dbQuery(
      'INSERT INTO item_master (specification, type, brand, unit, category_id, purchase_price) VALUES ($1, $2, $3, $4, (SELECT id FROM categories WHERE name = $5), 0) RETURNING id',
      [fullSpec, quickAddData.type, quickAddData.brand, quickAddData.unit, quickAddData.type_cat === 'ASSET' ? '資訊設備' : '辦公耗材']
    );
    if (res.success) {
      const newId = res.rows[0].id;
      await fetchData();
      setItems(items.map(row => row.id === activeRowId ? { ...row, itemId: newId, type: quickAddData.type_cat === 'ASSET' ? 'ASSET' : 'CONSUMABLE', unit: quickAddData.unit } : row));
      setShowQuickAdd(false);
      setQuickAddData({ name: '', type_cat: 'ASSET', type: '', brand: '', custodian: '', spec: '', unit: '個' });
    } else {
      alert('新增失敗：' + res.error);
    }
  };

  const handleSubmit = async () => {
    if (!partnerId) return alert('請選擇供應商');
    if (items.some(i => !i.itemId)) return alert('請確認所有明細均已連結至庫存品項');
    if (items.some(i => i.type === 'ASSET' && !i.sn)) return alert('資產類別必須輸入序號。');
    if (window.confirm('確認將此單據入庫？')) {
      const orderRes = await window.electronAPI.dbQuery('INSERT INTO inbound_orders (order_no, partner_id, invoice_no, status) VALUES ($1, $2, $3, $4) RETURNING id', [orderNo, partnerId, invoiceNo, 'COMPLETED']);
      if (orderRes.success) {
        const orderId = orderRes.rows[0].id;
        for (const item of items) {
          let finalItemId = item.itemId;
          if (item.type === 'ASSET') {
            await window.electronAPI.dbQuery(
              `INSERT INTO assets (sn, item_master_id, status) VALUES ($1, $2, 'ACTIVE')`, 
              [item.sn, finalItemId]
            );
          }
          await window.electronAPI.dbQuery(
            'INSERT INTO inbound_items (inbound_order_id, item_id, sn, quantity, purchase_record_id, unit_price) VALUES ($1, $2, $3, $4, $5, 0)', 
            [orderId, finalItemId, item.sn, item.qty, item.purchaseRecordId || null]
          );
          if (item.purchaseRecordId) {
            await window.electronAPI.dbQuery(`UPDATE purchase_records SET received_quantity = COALESCE(received_quantity, 0) + $1, status = CASE WHEN COALESCE(received_quantity, 0) + $1 >= quantity THEN 'COMPLETED' ELSE 'PARTIAL' END, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [item.qty, item.purchaseRecordId]);
          }
        }
        alert('進貨入庫成功！');
        setItems([{ id: Date.now(), itemId: '', purchaseRecordId: '', type: '', unit: '', sn: '', qty: 1 }]);
        setInvoiceNo('');
        fetchData();
      } else { alert('入庫失敗：' + orderRes.error); }
    }
  };

  return (
    <div className="card-surface">
      <h1 className="page-title">進貨入庫 (Inbound Receipt)</h1>
      {pendingPurchases.length > 0 && (
        <div style={alertContainerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={alertBadgeStyle}>{pendingPurchases.length}</div>
            <div>
              <div style={{ fontWeight: 800, color: '#5f4b00', fontSize: '1.1rem' }}>有 {pendingPurchases.length} 筆採購案件待入庫</div>
              <div style={{ fontSize: '0.9rem', color: '#856404', marginTop: '2px' }}>請核對採購單並將品項載入庫存。</div>
            </div>
          </div>
          <FileText size={40} color="#ffb300" style={{ opacity: 0.3 }} />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px', paddingBottom: '32px', borderBottom: '1px solid #eee' }}>
        <div><label style={labelStyle}>進貨單號 (系統生成)</label><input disabled value={orderNo} style={{ ...inputStyle, backgroundColor: '#f5f5f5', color: '#999' }} /></div>
        <div><label style={labelStyle}>供應商名稱 *</label><select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={inputStyle}><option value="">請選擇供應商</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label style={labelStyle}>發票號碼 (Invoice No.)</label><input type="text" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} style={inputStyle} placeholder="請輸入紙本發票號碼" /></div>
        <div><label style={labelStyle}>進貨/到貨日期</label><input type="date" defaultValue={new Date().toISOString().slice(0,10)} style={inputStyle} /></div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f8f9fa', textAlign: 'left' }}>
            <th style={thStyle}>對應採購單</th>
            <th style={thStyle}>入庫品項範本</th>
            <th style={thStyle}>設備序號 (SN)</th>
            <th style={thStyle}>數量</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>移除</th>
          </tr>
        </thead>
        <tbody>
          {items.map(row => (
            <tr key={row.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={tdStyle}><select value={row.purchaseRecordId} onChange={(e) => handlePurchaseSelect(row.id, e.target.value)} style={{ ...inputStyle, backgroundColor: row.purchaseRecordId ? '#fff8e1' : '#fff' }}><option value="">-- 非採購單入庫 --</option>{pendingPurchases.map(p => <option key={p.id} value={p.id}>[{p.order_no}] {p.specification}</option>)}</select></td>
              <td style={tdStyle}><select value={row.itemId} onChange={(e) => handleItemSelect(row.id, e.target.value)} style={{ ...inputStyle, backgroundColor: row.itemId ? '#e8f5e9' : '#fff' }}><option value="">選取庫存品項</option>{availableItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}<option value="NEW_ITEM" style={{ fontWeight: 800, color: 'var(--primary-color)' }}>+ 快速新增品項</option></select></td>
              <td style={tdStyle}>{row.type === 'CONSUMABLE' ? <span style={{ color: '#aaa', fontSize: '0.8rem' }}>耗材無需序號</span> : <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input placeholder="SN / 序號" value={row.sn} onChange={(e) => handleRowChange(row.id, 'sn', e.target.value)} style={{ ...inputStyle, border: !row.sn ? '1px solid #ffccc7' : '1px solid #ddd' }} />{row.qty > 1 && <button onClick={() => handleExpandRow(row.id)} title="展開為獨立序號" style={expandButtonStyle}><Layers size={16} /></button>}</div>}</td>
              <td style={tdStyle}><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><input type="number" value={row.qty} onChange={(e) => handleRowChange(row.id,'qty', parseInt(e.target.value)||0)} style={{ ...inputStyle, width: '70px' }} /><span style={{ fontSize: '0.85rem', color: '#666' }}>{row.unit || '個'}</span></div></td>
              <td style={{ ...tdStyle, textAlign: 'center' }}><button onClick={() => handleRemove(row.id)} style={deleteButtonStyle}><Trash2 size={20} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={handleAddItem} style={addRowsButtonStyle}><Plus size={18} /> 增加品項明細</button>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', borderTop: '2px solid #f8f9fa', paddingTop: '32px' }}>
        <button onClick={handleSubmit} style={submitButtonStyle}><ShoppingBag size={20} /> 確認入庫作業</button>
      </div>
      {showQuickAdd && (
        <div style={modalOverlayStyle}>
          <div className="card-surface" style={{ width: '420px', padding: '32px' }}>
            <h2 style={{ marginBottom: '24px', fontSize: '1.2rem', fontWeight: 800 }}>快速建檔品項範本</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div><label style={labelStyle}>品項名稱 *</label><input type="text" value={quickAddData.name} onChange={(e) => setQuickAddData({...quickAddData, name: e.target.value})} style={inputStyle} /></div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>類別</label><div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}><label style={radioLabelStyle}><input type="radio" checked={quickAddData.type_cat === 'ASSET'} onChange={() => setQuickAddData({...quickAddData, type_cat: 'ASSET'})} /> 資產</label><label style={radioLabelStyle}><input type="radio" checked={quickAddData.type_cat === 'CONSUMABLE'} onChange={() => setQuickAddData({...quickAddData, type_cat: 'CONSUMABLE'})} /> 耗材</label></div></div>
                <div><label style={labelStyle}>單位</label><select value={quickAddData.unit} onChange={(e) => setQuickAddData({...quickAddData, unit: e.target.value})} style={inputStyle}>{UNIFIED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '32px' }}>
              <button onClick={() => setShowQuickAdd(false)} style={modalCancelButtonStyle}>取消</button>
              <button onClick={handleQuickAddSave} style={modalSaveButtonStyle}>儲存並帶入單據</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#555', marginBottom: '8px' };
const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' };
const thStyle = { padding: '15px 12px', borderBottom: '2px solid #eee', fontWeight: 800, color: '#666', fontSize: '0.85rem' };
const tdStyle = { padding: '12px' };
const alertContainerStyle = { backgroundColor: '#fff8e1', borderLeft: '6px solid #ffb300', padding: '16px 24px', marginBottom: '32px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const alertBadgeStyle = { backgroundColor: '#ffb300', color: '#fff', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.1rem' };
const expandButtonStyle = { padding: '8px', backgroundColor: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: '8px', cursor: 'pointer', color: '#1890ff', display: 'flex' };
const deleteButtonStyle = { padding: '8px', color: '#f5222d', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6 };
const addRowsButtonStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', backgroundColor: '#f5f7f9', color: '#1a73e8', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700 };
const submitButtonStyle = { padding: '14px 40px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 15px rgba(26,115,232,0.3)' };
const modalOverlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050, backdropFilter: 'blur(5px)' };
const modalCancelButtonStyle = { padding: '10px 20px', background: '#f5f5f5', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 };
const modalSaveButtonStyle = { padding: '10px 20px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 };
const radioLabelStyle = { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' };

export default Inbound;
