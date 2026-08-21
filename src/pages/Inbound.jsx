import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, FileText, ShoppingBag, Layers, AlertCircle, ArrowDownToLine } from 'lucide-react';

const Inbound = () => {
  const [availableItems, setAvailableItems] = useState([]);
  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [orderNo, setOrderNo] = useState('');
  const [items, setItems] = useState([{ id: 1, selectedOrderNo: '', itemId: '', purchaseRecordId: '', cat_name: '', unit: '', sn: '', qty: 1 }]);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
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

    const hasAnyOtherPO = items.some(i => i.id !== rowId && !!i.purchaseRecordId);
    if (hasAnyOtherPO && partnerId && partnerId.toString() !== po.partner_id.toString()) {
      alert('此品項所屬的供應商與本進貨單目前綁定的供應商不符。\n(建議將不同供應商的進貨分開建立以免帳務混亂)');
      setItems(items.map(row => row.id === rowId ? { ...row, purchaseRecordId: '', itemId: '', cat_name: '', qty: 1 } : row));
      return;
    }

    if (!hasAnyOtherPO || !partnerId) {
      setPartnerId(po.partner_id.toString());
    }
    
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

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // We can show loading if we add a loading state, but let's just upload
    try {
      const newAttachments = [...attachments];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const buffer = await file.arrayBuffer();
        const res = await window.electronAPI.saveFile(file.name, buffer);
        if (res.success) {
          newAttachments.push({ originalName: file.name, fileName: res.fileName, type: file.type });
        } else {
          alert('上傳失敗: ' + res.error);
        }
      }
      setAttachments(newAttachments);
    } catch (err) {
      console.error(err);
      alert('上傳發生錯誤');
    } finally {
      e.target.value = ''; // clear input
    }
  };

  const removeAttachment = (index) => {
    const newAtt = [...attachments];
    newAtt.splice(index, 1);
    setAttachments(newAtt);
  };

  const getMediaSrc = (fileName) => {
    const rawUrl = `erp-media:///${encodeURIComponent(fileName)}`;
    return window.getMediaUrl ? window.getMediaUrl(rawUrl) : rawUrl;
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
    
    // 檢查進貨數量是否超過採購單剩餘數量 (Aggregate by PO to prevent duplicate row bypassing)
    const qtyByPO = {};
    for (const item of items) {
      if (item.purchaseRecordId) {
        qtyByPO[item.purchaseRecordId] = (qtyByPO[item.purchaseRecordId] || 0) + (parseInt(item.qty, 10) || 1);
      }
    }
    
    for (const [poId, requestedQty] of Object.entries(qtyByPO)) {
      const po = pendingPurchases.find(p => p.id.toString() === poId.toString());
      if (po) {
        const remaining = po.quantity - (po.received_quantity || 0);
        if (requestedQty > remaining) {
          const specLabel = [po.brand, po.model, po.specification].filter(Boolean).join(' ') || '未命名項目';
          return alert(`⚠️ 數量異常\n\n採購項目 [${specLabel}] 本次總計入庫數量 (${requestedQty}) 超過剩餘可入庫的額度 (${remaining})！\n\n請檢查是否有重複選擇相同的採購單或是數量輸入錯誤。`);
        }
      }
    }

    if (window.confirm('確認將此單據入庫？')) {
      const orderRes = await window.electronAPI.namedQuery('insertInboundOrder', [orderNo, partnerId, invoiceNo, 'COMPLETED', JSON.stringify(attachments)]);
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
            const qty = parseInt(item.qty, 10) || 1;
            for (let i = 0; i < qty; i++) {
              await window.electronAPI.namedQuery(
                'insertInboundAssets', 
                [item.sn || null, finalItemId, null]
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
        setAttachments([]);
        setOrderNo(''); // Reset to generate new order no
        fetchData();
      } else { alert('入庫失敗：' + orderRes.error); }
    }
  };

  const uniqueOrderNos = Array.from(new Set(pendingPurchases.map(p => p.order_no)));

  const handleOrderNoChange = (rowId, orderNo) => {
    const hasAnyOtherPO = items.some(i => i.id !== rowId && !!i.selectedOrderNo);
    if (hasAnyOtherPO && orderNo && partnerId) {
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

  const hasPOSelected = items.some(i => !!i.selectedOrderNo || !!i.purchaseRecordId);

  return (
    <div className="card-surface">
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
            <ArrowDownToLine size={26} color="var(--primary-color)" /> 進貨入庫(Stock in Registration)
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>管理並登記從供應商收到的實體物品與物料，入庫並增加庫存量。</p>
        </div>
      {pendingPurchases.length > 0 && (
        <div style={alertContainerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={alertBadgeStyle}>{pendingPurchases.length}</div>
            <div>
              <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '1.1rem' }}>有 {pendingPurchases.length} 筆採購案件待入庫</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '2px' }}>請核對採購單並將品項載入庫存。</div>
            </div>
          </div>
          <FileText size={40} color="#f59e0b" style={{ opacity: 0.3 }} />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px', paddingBottom: '32px', borderBottom: '1px solid var(--border-color)' }}>
        <div><label style={labelStyle}>進貨單號 (系統生成)</label><input disabled value={orderNo} style={{ ...inputStyle, backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)' }} /></div>
        <div>
          <label style={labelStyle}>供應商名稱 {hasPOSelected ? '(自動帶入)' : '(必填)'}</label>
          {hasPOSelected ? (
            <input disabled value={partners.find(p => p.id.toString() === partnerId?.toString())?.name || '請於下方選擇採購單'} style={{ ...inputStyle, backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)' }} />
          ) : (
            <select value={partnerId || ''} onChange={(e) => setPartnerId(e.target.value)} style={{ ...inputStyle, backgroundColor: 'var(--input-bg)', color: 'var(--input-text)' }}>
              <option value="">-- 請選擇供應商 --</option>
              {partners.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        <div><label style={labelStyle}>發票號碼 (Invoice No.)</label><input type="text" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} style={inputStyle} placeholder="請輸入紙本發票號碼" /></div>
        <div><label style={labelStyle}>進貨/到貨日期</label><input type="date" defaultValue={new Date().toISOString().slice(0,10)} style={inputStyle} /></div>
      </div>
      
      <div style={{ marginBottom: '32px' }}>
        <label style={labelStyle}>相關附件 (報價單、進貨單影本等)</label>
        <div style={{ padding: '16px', border: '2px dashed var(--border-color)', borderRadius: '12px', backgroundColor: 'var(--bg-surface-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {attachments.map((att, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: 'var(--card-shadow)' }}>
                {att.type?.startsWith('image/') ? (
                   <img src={getMediaSrc(att.fileName)} alt={att.originalName} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setPreviewFile(att)} />
                ) : (
                   <div style={{ width: '40px', height: '40px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setPreviewFile(att)}>
                      <FileText size={20} color="#64748b" />
                   </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }} title={att.originalName}>{att.originalName}</div>
                </div>
                <button onClick={() => removeAttachment(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div>
            <label style={{ display: 'inline-block', padding: '8px 16px', backgroundColor: '#e2e8f0', color: '#475569', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}>
              + 新增附件
              <input type="file" multiple style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>
          </div>
        </div>
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
      {previewFile && (
        <div style={modalOverlayStyle} onClick={() => setPreviewFile(null)}>
          <div style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '12px', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>預覽附件：{previewFile.originalName}</h3>
              <button onClick={() => setPreviewFile(null)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>&times;</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
              {previewFile.type?.startsWith('image/') ? (
                <img src={getMediaSrc(previewFile.fileName)} alt={previewFile.originalName} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
              ) : previewFile.type === 'application/pdf' ? (
                <iframe src={getMediaSrc(previewFile.fileName)} style={{ width: '80vw', height: '70vh', border: 'none' }} title={previewFile.originalName} />
              ) : (
                <div style={{ padding: '40px', color: '#64748b' }}>此檔案類型不支援預覽，請下載後檢視。</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' };
const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' };
const thStyle = { padding: '15px 12px', borderBottom: '2px solid var(--border-color)', fontWeight: 800, color: 'var(--table-header-text)', backgroundColor: 'var(--table-header-bg)', fontSize: '0.85rem' };
const tdStyle = { padding: '12px', borderBottom: '1px solid var(--table-border)', color: 'var(--text-main)' };
const alertContainerStyle = { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderLeft: '6px solid #f59e0b', padding: '16px 24px', marginBottom: '32px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const alertBadgeStyle = { backgroundColor: '#f59e0b', color: '#fff', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.1rem' };
const expandButtonStyle = { padding: '8px', backgroundColor: 'var(--primary-bg)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', cursor: 'pointer', color: 'var(--primary-color)', display: 'flex' };
const deleteButtonStyle = { padding: '8px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.8 };
const addRowsButtonStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--primary-color)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700 };
const submitButtonStyle = { padding: '14px 40px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 15px rgba(26,115,232,0.3)' };
const modalOverlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050, backdropFilter: 'blur(5px)' };
const modalCancelButtonStyle = { padding: '10px 20px', background: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 };
const modalSaveButtonStyle = { padding: '10px 20px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 };
const radioLabelStyle = { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-main)' };

export default Inbound;
