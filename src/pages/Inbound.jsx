import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, FileText, ShoppingBag, Layers, AlertCircle } from 'lucide-react';

const Inbound = () => {
  const [availableItems, setAvailableItems] = useState([]);
  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [orderNo, setOrderNo] = useState('');
  const [items, setItems] = useState([{ id: 1, selectedOrderNo: '', itemId: '', purchaseRecordId: '', cat_name: '', unit: '', sn: '', qty: 1 }]);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [partners, setPartners] = useState([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddData, setQuickAddData] = useState({ 
    name: '', type_cat: '設備', type: '', brand: '', 
    custodian: '', spec: '', unit: '個' 
  });
  const UNIFIED_UNITS = ['個', '台', '盒', '包', '支', '組', '瓶', '卷', '張', '份'];
  const [activeRowId, setActiveRowId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [itemsRes, partnersRes, purchasesRes] = await Promise.all([
        window.electronAPI.namedQuery('fetchInboundItemMaster'),
        window.electronAPI.namedQuery('fetchSuppliers'),
        window.electronAPI.namedQuery('fetchPendingPurchases')
      ]);

      if (itemsRes.success) {
        setAvailableItems(itemsRes.rows.map(i => ({
          ...i,
          name: [i.brand, i.model, i.specification].filter(Boolean).join(' ') || i.specification || '未命名'
        })));
      }
      if (partnersRes.success) setPartners(partnersRes.rows);
      if (purchasesRes.success) setPendingPurchases(purchasesRes.rows);

      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const countRes = await window.electronAPI.namedQuery('countInboundOrders', [`IN-${today}-`]);
      const nextNum = countRes.success ? Number(countRes.rows[0].count) : 1;
      const paddedNum = nextNum.toString().padStart(2, '0');
      setOrderNo(prev => prev || `IN-${today}-${paddedNum}`);
    } catch (err) {
      console.error("Inbound Fetch Error:", err);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => fetchData());
  }, [fetchData]);

  const handleAddItem = () => {
    setItems([...items, { id: Date.now(), selectedOrderNo: '', itemId: '', purchaseRecordId: '', cat_name: '', unit: '', sn: '', qty: 1 }]);
  };

  useEffect(() => {
    if (items.every(i => !i.purchaseRecordId)) {
      setPartnerId('');
    }
  }, [items]);

  const handleRemove = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleExpandRow = (rowId) => {
    const row = items.find(r => r.id === rowId);
    if (!row || row.qty <= 1 || !(row.cat_name === '設備' || row.cat_name === '硬體')) return;
    if (!window.confirm(`確定要將此項目展開為 ${row.qty} 筆獨立設備以分別輸入序號嗎？`)) return;
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
      cat_name: selected?.cat_name || '',
      unit: selected?.unit || '個'
    } : row));
  };

  const handlePurchaseSelect = (rowId, poId) => {
    if (!poId) {
      setItems(items.map(row => row.id === rowId ? { ...row, purchaseRecordId: '', itemId: '', cat_name: '', qty: 1 } : row));
      return;
    }
    const po = pendingPurchases.find(p => p.id.toString() === poId.toString());
    if (!po) return;

    if (partnerId && partnerId.toString() !== po.partner_id.toString()) {
      alert('此品項所屬的供應商與本進貨單目前綁定的供應商不符。\n(建議將不同供應商的進貨分開建立以免帳務混亂)');
      setItems(items.map(row => row.id === rowId ? { ...row, purchaseRecordId: '', itemId: '', cat_name: '', qty: 1 } : row));
      return;
    }

    if (!partnerId) setPartnerId(po.partner_id.toString());
    
    let existingItem = availableItems.find(i => 
      (i.specification || '') === (po.specification || '') &&
      (i.brand || '') === (po.brand || '') &&
      (i.model || '') === (po.model || '')
    );
    if (!existingItem) {
      existingItem = availableItems.find(i => i.specification === po.specification);
    }
    
    setItems(items.map(row => row.id === rowId ? {
      ...row,
      purchaseRecordId: poId,
      itemId: existingItem ? existingItem.id : '',
      cat_name: po.category_name || (existingItem ? existingItem.cat_name : ''),
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
    const res = await window.electronAPI.namedQuery(
      'insertInboundItemMaster',
      [fullSpec, quickAddData.type, quickAddData.brand, quickAddData.unit, quickAddData.type_cat]
    );
    if (res.success) {
      const newId = res.rows[0].id;
      await fetchData();
      setItems(items.map(row => row.id === activeRowId ? { ...row, itemId: newId, cat_name: quickAddData.type_cat, unit: quickAddData.unit } : row));
      setShowQuickAdd(false);
      setQuickAddData({ name: '', type_cat: '設備', type: '', brand: '', custodian: '', spec: '', unit: '個' });
    } else {
      alert('新增失敗：' + res.error);
    }
  };

  const handleSubmit = async () => {
    if (!partnerId) return alert('請先選擇對應的採購單以帶入供應商資訊');
    if (items.some(i => !i.itemId && !i.purchaseRecordId)) return alert('請確認所有明細均已選擇入庫品項');
    // SN validation removed to make it optional
    if (window.confirm('確認將此單據入庫？')) {
      const orderRes = await window.electronAPI.namedQuery('insertInboundOrder', [orderNo, partnerId, invoiceNo, 'COMPLETED']);
      if (orderRes.success) {
        const orderId = orderRes.rows[0].id;
        for (const item of items) {
          let finalItemId = item.itemId;

          if (!finalItemId && item.purchaseRecordId) {
             const po = pendingPurchases.find(p => p.id.toString() === item.purchaseRecordId.toString());
             if (po) {
                const fullSpec = [po.brand, po.model, po.specification].filter(Boolean).join(' ') || po.specification || '未命名';
                const created = await window.electronAPI.namedQuery('insertInboundItemMaster', [
                   fullSpec, po.item_type || '', po.brand || '', po.unit || '個', po.category_name
                ]);
                if (created.success) finalItemId = created.rows[0].id;
             }
          }

          if (!finalItemId) continue;

          if (item.cat_name === '設備' || item.cat_name === '硬體') {
            const currentPo = item.purchaseRecordId ? pendingPurchases.find(p => p.id.toString() === item.purchaseRecordId.toString()) : null;
            const itemProjectName = (currentPo && currentPo.project_name) ? currentPo.project_name : '';
            const qty = parseInt(item.qty, 10) || 1;
            for (let i = 0; i < qty; i++) {
              await window.electronAPI.namedQuery(
                'insertInboundAssets', 
                [item.sn || null, finalItemId, itemProjectName]
              );
            }
          }
          await window.electronAPI.namedQuery(
            'insertInboundItems', 
            [orderId, finalItemId, item.sn || null, item.qty, item.purchaseRecordId || null]
          );
          // Update manual stock_qty in item_master
          await window.electronAPI.namedQuery('updateStockQtyOnInbound', [item.qty, finalItemId]);

          if (item.purchaseRecordId) {
            await window.electronAPI.namedQuery('updatePurchaseRecordStatus', [item.qty, item.purchaseRecordId]);
          }
        }
        alert('進貨入庫成功！');
        setItems([{ id: Date.now(), selectedOrderNo: '', itemId: '', purchaseRecordId: '', cat_name: '', unit: '', sn: '', qty: 1 }]);
        setInvoiceNo('');
        setOrderNo(''); // Reset to generate new order no
        fetchData();
      } else { alert('入庫失敗：' + orderRes.error); }
    }
  };

  const uniqueOrderNos = Array.from(new Set(pendingPurchases.map(p => p.order_no)));

  const handleOrderNoChange = (rowId, orderNo) => {
    if (orderNo && partnerId) {
       const poFromOrder = pendingPurchases.find(p => p.order_no === orderNo);
       if (poFromOrder && poFromOrder.partner_id.toString() !== partnerId.toString()) {
          alert('您選擇的採購單的供應商與本進貨單不符！\n(系統考量帳務一致性，進貨單不支援混搭不同供應商。)');
          return;
       }
    }

    setItems(items.map(row => row.id === rowId ? {
      ...row,
      selectedOrderNo: orderNo,
      purchaseRecordId: '',
      itemId: '',
      cat_name: '',
      qty: 1
    } : row));
  };

  const selectedPOOrderNo = items.find(i => i.selectedOrderNo)?.selectedOrderNo;
  let currProjectName = '請於下方選擇採購單';
  if (selectedPOOrderNo) {
    const po = pendingPurchases.find(p => p.order_no === selectedPOOrderNo);
    currProjectName = (po && po.project_name) ? po.project_name : '無專案名稱';
  }

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '20px', marginBottom: '32px', paddingBottom: '32px', borderBottom: '1px solid #eee' }}>
        <div><label style={labelStyle}>進貨單號 (系統生成)</label><input disabled value={orderNo} style={{ ...inputStyle, backgroundColor: '#f5f5f5', color: '#999' }} /></div>
        <div><label style={labelStyle}>供應商名稱 (自動帶入)</label><input disabled value={partners.find(p => p.id.toString() === partnerId?.toString())?.name || '請於下方選擇採購單'} style={{ ...inputStyle, backgroundColor: '#f5f5f5', color: '#999' }} /></div>
        <div><label style={labelStyle}>專案名稱 (自動帶入)</label><input disabled value={currProjectName} style={{ ...inputStyle, backgroundColor: '#f5f5f5', color: '#999' }} /></div>
        <div><label style={labelStyle}>發票號碼 (Invoice No.)</label><input type="text" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} style={inputStyle} placeholder="請輸入紙本發票號碼" /></div>
        <div><label style={labelStyle}>進貨/到貨日期</label><input type="date" defaultValue={new Date().toISOString().slice(0,10)} style={inputStyle} /></div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f8f9fa', textAlign: 'left' }}>
            <th style={thStyle}>對應採購單號</th>
            <th style={thStyle}>入庫設備項目</th>
            <th style={{ ...thStyle, width: '80px' }}>類別</th>
            <th style={thStyle}>序號(SN)</th>
            <th style={thStyle}>數量</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>移除</th>
          </tr>
        </thead>
        <tbody>
          {items.map(row => (
            <tr key={row.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={tdStyle}>
                <select value={row.selectedOrderNo || ''} onChange={(e) => handleOrderNoChange(row.id, e.target.value)} style={{ ...inputStyle, backgroundColor: row.selectedOrderNo ? '#fff8e1' : '#fff' }}>
                  <option value="">-- 非採購單入庫 --</option>
                  {uniqueOrderNos.map(orderNo => <option key={orderNo} value={orderNo}>{orderNo}</option>)}
                </select>
              </td>
              <td style={tdStyle}>
                {row.selectedOrderNo ? (
                  <select value={row.purchaseRecordId} onChange={(e) => handlePurchaseSelect(row.id, e.target.value)} style={{ ...inputStyle, backgroundColor: row.purchaseRecordId ? '#e8f5e9' : '#fff' }}>
                    <option value="">-- 請選擇採購品項 --</option>
                    {pendingPurchases.filter(p => p.order_no === row.selectedOrderNo).map(p => <option key={p.id} value={p.id}>{[p.brand, p.model, p.specification].filter(Boolean).join(' ')} (未入庫 {p.quantity - (p.received_quantity || 0)})</option>)}
                  </select>
                ) : (
                  <select value={row.itemId} onChange={(e) => handleItemSelect(row.id, e.target.value)} style={{ ...inputStyle, backgroundColor: row.itemId ? '#e8f5e9' : '#fff' }}>
                    <option value="">選取庫存品項</option>
                    {availableItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    <option value="NEW_ITEM" style={{ fontWeight: 800, color: 'var(--primary-color)' }}>+ 快速新增品項</option>
                  </select>
                )}
              </td>
              <td style={tdStyle}>
                {row.cat_name ? <span style={{ padding: '4px 10px', backgroundColor: '#f0f0f0', borderRadius: '6px', fontSize: '0.8rem', color: '#555', fontWeight: 600 }}>{row.cat_name}</span> : <span style={{ color: '#ccc', fontSize: '0.8rem' }}>--</span>}
              </td>
              <td style={tdStyle}>{(row.cat_name === '設備' || row.cat_name === '硬體') ? <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input placeholder="SN / 序號" value={row.sn} onChange={(e) => handleRowChange(row.id, 'sn', e.target.value)} style={{ ...inputStyle, border: '1px solid #ddd' }} />{row.qty > 1 && <button onClick={() => handleExpandRow(row.id)} title="展開為獨立序號" style={expandButtonStyle}><Layers size={16} /></button>}</div> : <span style={{ color: '#aaa', fontSize: '0.8rem' }}>耗材無需序號</span>}</td>
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
                <div style={{ flex: 1 }}><label style={labelStyle}>類別</label><div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}><label style={radioLabelStyle}><input type="radio" checked={quickAddData.type_cat === '設備'} onChange={() => setQuickAddData({...quickAddData, type_cat: '設備'})} /> 設備</label><label style={radioLabelStyle}><input type="radio" checked={quickAddData.type_cat === '硬體'} onChange={() => setQuickAddData({...quickAddData, type_cat: '硬體'})} /> 硬體</label><label style={radioLabelStyle}><input type="radio" checked={quickAddData.type_cat === '耗材'} onChange={() => setQuickAddData({...quickAddData, type_cat: '耗材'})} /> 耗材</label></div></div>
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
