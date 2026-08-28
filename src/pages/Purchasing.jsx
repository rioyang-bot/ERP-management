import React, { useState, useEffect, useCallback, useContext } from 'react';
import { Plus, Search, FileText, ShoppingCart, CheckCircle, Clock, AlertCircle, Trash2, DollarSign, Package, Tag, Filter, X, Save, Settings2, Trash } from 'lucide-react';
import { RoleContext } from '../context/RoleContext';
import { useNavigate } from 'react-router-dom';
import { logCreate, logUpdate } from '../utils/auditLogger';

const ProcurementRegistration = ({ editMode = false, initOrderNo = null, onClose = null, isSplitMode = false }) => {
  const { authUser } = useContext(RoleContext);
  const navigate = useNavigate();
  const [purchaseRecords, setPurchaseRecords] = useState([]);
  const [partners, setPartners] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // Options state for selects
  const [options, setOptions] = useState({
    types: {},
    brands: {},
    models: {}
  });

  const [loading, setLoading] = useState(true);

  // PO Header states
  const [orderNo, setOrderNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);

  // Items in this PO
  const [items, setItems] = useState([
    { id: 'initial-row', category_id: '', partner_id: '', item_type: '', brand: '', model: '', specification: '', unit: '個', unit_price: '', quantity: 1 }
  ]);

  // Quick Add UI states
  const [quickAdd, setQuickAdd] = useState({ show: false, type: '', rowId: null, catId: null });
  const [newName, setNewName] = useState('');

  const fetchOptions = useCallback(async (catId) => {
    if (!catId) return;
    const [brandsRes, typesRes, modelsRes] = await Promise.all([
      window.electronAPI.namedQuery("fetchBrandsByCategory", [catId]),
      window.electronAPI.namedQuery("fetchTypesByCategory", [catId]),
      window.electronAPI.namedQuery("fetchModelsByCategory", [catId])
    ]);
    
    setOptions(prev => ({
      ...prev,
      brands: { ...prev.brands, [catId]: brandsRes.success ? brandsRes.rows.map(r => r.name) : [] },
      types: { ...prev.types, [catId]: typesRes.success ? typesRes.rows : [] },
      models: { ...prev.models, [catId]: modelsRes.success ? modelsRes.rows : [] }
    }));
  }, []);

  const fetchData = useCallback(async (forceNewOrderNo = false) => {
    setLoading(true);
    try {
      const [recordsRes, partnersRes, catsRes] = await Promise.all([
        window.electronAPI.namedQuery('fetchPurchasingRecords'),
        window.electronAPI.namedQuery('fetchSuppliers'),
        window.electronAPI.namedQuery('fetchCategories')
      ]);

      if (recordsRes.success) setPurchaseRecords(recordsRes.rows);
      if (partnersRes.success) setPartners(partnersRes.rows);
      if (catsRes.success) {
        setCategories(catsRes.rows);
        for (const cat of catsRes.rows) {
          await fetchOptions(cat.id);
        }
        
        if (editMode && initOrderNo) {
          setOrderNo(initOrderNo);
          const detailRes = await window.electronAPI.namedQuery('fetchPurchaseRecordsByOrder', [initOrderNo]);
          if (detailRes.success && detailRes.rows.length > 0) {
           setRemarks(detailRes.rows[0].remarks || '');
           const existingAtt = detailRes.rows[0].attachments;
           setAttachments(Array.isArray(existingAtt) ? existingAtt : (existingAtt ? JSON.parse(existingAtt) : []));
             setItems(detailRes.rows.map(r => ({
               id: r.id, 
               category_id: r.category_id.toString(),
               partner_id: r.partner_id ? r.partner_id.toString() : '',
               item_type: r.item_type || '',
               brand: r.brand || '',
               model: r.model || '',
               specification: r.specification || '',
               unit: r.unit || '個',
               quantity: r.quantity,
               status: r.status
             })));
          }
        } else {
          // Generate initial PO status if empty
          const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const poCountRes = await window.electronAPI.namedQuery(
            "countPurchaseOrders",
            [`PO-${today}-`]
          );
          const nextNum = poCountRes.success ? Number(poCountRes.rows[0].count) : 1;
          const paddedNum = nextNum.toString().padStart(2, '0');
          
          if (forceNewOrderNo) {
            setOrderNo(`PO-${today}-${paddedNum}`);
          } else {
            setOrderNo(prev => prev || `PO-${today}-${paddedNum}`);
          }
  
          // Only init items if they are empty
          setItems(prev => {
            if (prev.length === 0 || (prev.length === 1 && !prev[0].specification)) {
               return [{ id: Date.now(), category_id: catsRes.rows[0].id.toString(), partner_id: '', item_type: '', brand: '', model: '', specification: '', unit: '個', quantity: 1 }];
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.error("Fetch Data Error:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchOptions]);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchData();
    });
  }, [fetchData]);

  const handleAddItem = () => {
    const lastItem = items[items.length - 1];
    setItems([
      ...items,
      { 
        id: Date.now(), 
        category_id: lastItem?.category_id || categories[0]?.id.toString() || '', 
        partner_id: lastItem?.partner_id || '',
        item_type: '', 
        brand: '', 
        model: '', 
        specification: '', 
        unit: '個', 
        quantity: 1 
      }
    ]);
  };

  const handleRemoveItem = (id) => {
    if (items.length === 1) return;
    setItems(items.filter(item => item.id !== id));
  };

  const handleItemChange = (id, field, value) => {
    setItems(items.map(item => {
      if (item.id === id) {
        if (field === 'category_id') {
          return { ...item, [field]: value, item_type: '', brand: '', model: '', specification: '' };
        }
        if (field === 'brand') {
          return { ...item, brand: value, item_type: '', model: '' };
        }
        if (field === 'item_type') {
          return { ...item, item_type: value, model: '' };
        }
        if (field === 'model' && value !== '') {
          // Auto-fill from model data
          const catModels = options.models[item.category_id] || [];
          const selectedModel = catModels.find(m => m.model === value);
          if (selectedModel) {
            return { 
              ...item, 
              model: value, 
              item_type: selectedModel.type || '', 
              brand: selectedModel.brand || '', 
              specification: selectedModel.specification || '',
              unit: selectedModel.unit || item.unit
            };
          }
        }
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const openQuickAdd = (rowId, catId, type) => {
    setQuickAdd({ show: true, type, rowId, catId });
    setNewName('');
  };

  const handleQuickAddSave = async () => {
    if (!newName.trim()) return;
    const queryName = quickAdd.type === 'type' ? 'insertItemType' : 'insertItemBrand';
    const res = await window.electronAPI.namedQuery(
      queryName,
      [quickAdd.catId, newName.trim()]
    );

    if (res.success) {
      await fetchOptions(quickAdd.catId);
      handleItemChange(quickAdd.rowId, quickAdd.type === 'type' ? 'item_type' : 'brand', newName.trim());
      setQuickAdd({ show: false, type: '', rowId: null, catId: null });
    } else {
      alert('新增失敗：' + res.error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.some(i => !i.category_id || String(i.quantity).trim() === '' || Number(i.quantity) <= 0)) {
      return alert('請填寫完整的品項資訊且數量需大於0');
    }

    setLoading(true);
    try {
      const attachmentsJson = JSON.stringify(attachments);
      if (editMode && initOrderNo) {
         const existRes = await window.electronAPI.namedQuery('fetchPurchaseRecordsByOrder', [initOrderNo]);
         if (!existRes.success) throw new Error('獲取原始訂單失敗');
         
         const existingIds = existRes.rows.map(r => r.id);
         const currentIds = items.map(i => i.id).filter(id => id < 1000000000000); 
         
         for (const exId of existingIds) {
           if (!currentIds.includes(exId)) {
              await window.electronAPI.namedQuery('deletePurchaseRecordById', [exId]);
           }
         }
         
         for (const item of items) {
           if (item.id > 1000000000000) {
             const res = await window.electronAPI.namedQuery('insertPurchaseRecord',
               [initOrderNo, item.partner_id ? parseInt(item.partner_id) : null, parseInt(item.category_id), item.item_type, item.brand, item.model, item.specification || null, item.unit, parseInt(item.quantity), authUser?.id, 'ORDERED', remarks, null, attachmentsJson]
             );
             if (!res.success) throw new Error(`新增品項失敗: ${res.error}`);
           } else {
             const res = await window.electronAPI.namedQuery('updatePurchaseRecordFull',
               [item.partner_id ? parseInt(item.partner_id) : null, parseInt(item.category_id), item.item_type, item.brand, item.model, item.specification || null, item.unit, parseInt(item.quantity), remarks, null, attachmentsJson, item.id]
             );
             if (!res.success) throw new Error(`更新品項失敗: ${res.error}`);
           }
         }
         logUpdate(
           'PURCHASE',
           initOrderNo,
           '採購單',
           `修改採購單 [${initOrderNo}] 共 ${items.length} 個品項`,
           { orderNo: initOrderNo, itemsCount: items.length, items: items.map(i => ({ model: i.model, brand: i.brand, qty: i.quantity })), remarks }
         );
         alert('採購單修改成功！');
         if (onClose) onClose();
      } else {
         for (const item of items) {
           const res = await window.electronAPI.namedQuery('insertPurchaseRecord',
             [
               orderNo, item.partner_id ? parseInt(item.partner_id) : null, item.category_id, item.item_type, item.brand, item.model,
               item.specification || null, item.unit, item.quantity, authUser?.id, 'ORDERED', remarks, null, attachmentsJson
             ]
           );
           if (!res.success) throw new Error(`品項 ${item.model || '未指定型號'} 儲存失敗: ${res.error}`);
         }
         logCreate(
           'PURCHASE',
           orderNo,
           '採購單',
           `建立採購單 [${orderNo}] 共 ${items.length} 個品項`,
           { orderNo, itemsCount: items.length, items: items.map(i => ({ model: i.model, brand: i.brand, qty: i.quantity })), remarks }
         );
         alert('採購建檔成功！');
         setRemarks('');
         setItems([]); 
         await fetchData(true);
      }
    } catch (err) {
      console.error("Submit Error:", err);
      alert('儲存失敗：' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const statusColors = {
    'ORDERED': { bg: '#e3f2fd', color: '#1976d2', label: '已下單' },
    'PARTIAL': { bg: '#fff3e0', color: '#e65100', label: '部分入庫' },
    'COMPLETED': { bg: '#e8f5e9', color: '#2e7d32', label: '結案' }
  };

  const UNIFIED_UNITS = ['個', '台', '盒', '包', '支', '組', '瓶', '卷', '張', '份'];

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setLoading(true);
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
      setLoading(false);
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

  const containerStyle = editMode ? { padding: 0 } : { padding: '24px', backgroundColor: 'var(--bg-app)', minHeight: '100vh', display: 'flex', flexDirection: isSplitMode ? 'column' : 'row', gap: '24px' };
  const leftSectionStyle = editMode ? { width: '100%' } : (isSplitMode ? { width: '100%' } : { flex: '0 0 60%' });
  const rightSectionStyle = isSplitMode ? { width: '100%' } : { flex: '1' };
  const cardStyle = editMode ? {} : { backgroundColor: 'var(--bg-surface)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', marginBottom: '24px', color: 'var(--text-main)' };

  return (
    <div style={containerStyle}>
      <div style={leftSectionStyle}>
        <div style={cardStyle}>
          {!editMode && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
                  <ShoppingCart size={26} color="var(--primary-color)" /> 採購建檔(Purchase Order Registration )
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>建立與申請新的採購單，設定專案與供應商訂購細節。</p>
              </div>
              {!isSplitMode && (
                <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <button style={{ padding: '6px 14px', backgroundColor: 'var(--bg-surface)', color: 'var(--primary-color)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '800', boxShadow: 'var(--card-shadow)', cursor: 'default' }}>
                    📝 建檔
                  </button>
                  <button onClick={() => navigate('/procurement-split')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
                    ◫ 雙開
                  </button>
                  <button onClick={() => navigate('/procurement-list')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
                    📋 清單
                  </button>
                </div>
              )}
            </div>
          )}

        <form onSubmit={handleSubmit}>
          {/* Header Section */}
          <div className="card-surface" style={{ backgroundColor: 'var(--bg-surface-subtle)', marginBottom: '24px', padding: '24px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>採購單號 (PO No.)</label>
                <input value={orderNo} readOnly style={{ ...inputStyle, backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', fontWeight: 'bold' }} />
              </div>
              <div>
                <label style={labelStyle}>採購人員 (Purchaser)</label>
                <input disabled value={authUser?.full_name || '--'} style={{ ...inputStyle, backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)' }} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>採購備註 (PO Remarks)</label>
              <textarea 
                value={remarks} 
                onChange={e => setRemarks(e.target.value)} 
                placeholder="請輸入此採購案的備註說明（選填）..."
                style={{ ...inputStyle, minHeight: '40px', height: '40px', resize: 'none' }}
              />
            </div>
            <div style={{ marginTop: '16px' }}>
              <label style={labelStyle}>相關附件 (報價單、規格書等)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ 
                  padding: '8px 16px', backgroundColor: 'var(--primary-color)', color: '#fff', 
                  borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' 
                }}>
                  上傳檔案
                  <input type="file" multiple onChange={handleFileUpload} style={{ display: 'none' }} accept="image/png, image/jpeg, application/pdf" />
                </label>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>支援 PNG, JPG, PDF (可直接點擊檢視)</span>
              </div>
              {attachments.length > 0 && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {attachments.map((file, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                      backgroundColor: 'var(--bg-surface)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' 
                    }}>
                      <div 
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--primary-color)' }}
                        onClick={() => setPreviewFile(file)}
                      >
                        <FileText size={16} />
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{file.originalName}</span>
                      </div>
                      <button type="button" onClick={() => removeAttachment(idx)} style={{ background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Items Section */}
          <div className="card-surface" style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--table-header-bg)', textAlign: 'left' }}>
                  <th style={{ ...thStyle, width: '130px' }}>類別</th>
                  <th style={{ ...thStyle, width: '180px' }}>供應商</th>
                  <th style={{ ...thStyle, width: '230px' }}>廠牌 / 類型</th>
                  <th style={{ ...thStyle, width: '230px' }}>型號</th>
                  <th style={{ ...thStyle, width: '220px' }}>規格 (Specification)</th>
                  <th style={{ ...thStyle, width: '100px' }}>數量</th>
                  <th style={{ ...thStyle, width: '60px', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const isReadonly = row.status && row.status !== 'ORDERED';
                  return (
                  <tr key={row.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={tdStyle}>
                      <select 
                        value={row.category_id} 
                        onChange={e => handleItemChange(row.id, 'category_id', e.target.value)}
                        style={inputStyle}
                        disabled={isReadonly}
                      >
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <select 
                        value={row.partner_id || ''} 
                        onChange={e => handleItemChange(row.id, 'partner_id', e.target.value)}
                        style={inputStyle}
                        disabled={isReadonly}
                      >
                        <option value="">(選填供應商)</option>
                        {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <select 
                          value={row.brand} 
                          onChange={e => handleItemChange(row.id, 'brand', e.target.value)}
                          style={{ ...inputStyle, fontSize: '0.8rem', padding: '6px' }}
                          disabled={!!row.model || isReadonly}
                        >
                          <option value="">(廠牌)</option>
                          {(options.brands[row.category_id] || []).map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <select 
                          value={row.item_type} 
                          onChange={e => handleItemChange(row.id, 'item_type', e.target.value)}
                          style={{ ...inputStyle, fontSize: '0.8rem', padding: '6px' }}
                          disabled={!!row.model || isReadonly}
                        >
                          <option value="">(類型)</option>
                          {Array.from(new Set(
                            (options.types[row.category_id] || [])
                              .filter(t => !row.brand || t.brand === row.brand)
                              .map(t => t.name)
                          )).map(typeName => <option key={typeName} value={typeName}>{typeName}</option>)}
                        </select>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <select 
                        value={row.model || ''} 
                        onChange={e => handleItemChange(row.id, 'model', e.target.value)}
                        style={inputStyle}
                        disabled={isReadonly}
                      >
                        <option value="">(選擇型號)</option>
                        {Array.from(new Set(
                          (options.models[row.category_id] || [])
                            .filter(m => (!row.brand || m.brand === row.brand) && (!row.item_type || m.type === row.item_type))
                            .map(m => m.model)
                        )).map(modelName => (
                          <option key={modelName} value={modelName}>{modelName}</option>
                        ))}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <input 
                        value={row.specification} 
                        onChange={e => handleItemChange(row.id, 'specification', e.target.value)}
                        style={inputStyle}
                        placeholder="詳細規格說明"
                        disabled={isReadonly}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input 
                        type="number" 
                        value={row.quantity} 
                        onChange={e => handleItemChange(row.id, 'quantity', e.target.value)}
                        style={inputStyle}
                        min="1"
                        disabled={isReadonly}
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {!isReadonly ? (
                        <button type="button" onClick={() => handleRemoveItem(row.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ff4d4f' }}>
                          <Trash2 size={18} />
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: '#ccc', display: 'block', lineHeight: 1.2 }}>已入庫<br/>鎖定</span>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
            
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)', borderTop: '1px solid var(--border-color)' }}>
              <button type="button" onClick={handleAddItem} style={{ 
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', 
                backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--primary-color)'
              }}>
                <Plus size={18} /> 增加採購品項
              </button>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary-color)' }}>
                  採購項目: {items.length} 筆
                </span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
            {editMode ? (
              <>
                <button type="button" onClick={onClose} style={{ 
                  padding: '14px 32px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' 
                }}>取消編輯</button>
                <button type="submit" disabled={loading} className="btn-primary" style={{ 
                  padding: '14px 48px', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 700, boxShadow: '0 4px 12px rgba(27, 54, 93, 0.2)'
                }}>
                  {loading ? '儲存中...' : '儲存修改'}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => fetchData(false)} style={{ 
                  padding: '14px 32px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' 
                }}>取消並重設</button>
                <button type="submit" disabled={loading} className="btn-primary" style={{ 
                  padding: '14px 48px', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 700, boxShadow: '0 4px 12px rgba(27, 54, 93, 0.2)'
                }}>
                  {loading ? '儲存中...' : '確認提交採購單'}
                </button>
              </>
            )}
          </div>
        </form>
        </div>
      </div>

      {!editMode && (
        <div style={rightSectionStyle}>
          <div style={cardStyle}>
            <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
              <Clock size={18} color="var(--text-muted)" /> 最新 10 筆建檔記錄
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {loading && purchaseRecords.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>載入中...</p>
              ) : purchaseRecords.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>尚無採購紀錄</p>
              ) : (
                purchaseRecords.map(record => (
                  <div key={record.id} style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--primary-color)', fontSize: '13px' }}>{record.order_no}</span>
                      <span style={{ 
                        padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                        backgroundColor: statusColors[record.status]?.bg, color: statusColors[record.status]?.color
                      }}>{statusColors[record.status]?.label}</span>
                    </div>
                    <div style={{ fontWeight: '800', fontSize: '13px', color: 'var(--text-main)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {record.specification}
                      {record.model && <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, marginLeft: '6px' }}>({record.model})</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--text-subtle)' }}>{record.partner_name}</span> · 
                      <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{record.quantity}</span>
                    </div>
                    {record.project_name && (
                      <div style={{ marginBottom: '4px', fontSize: '12px', color: 'var(--primary-color)', fontWeight: 600 }}>
                        專案: {record.project_name}
                      </div>
                    )}
                    {record.remarks && (
                      <div style={{ marginBottom: '8px', padding: '4px 8px', backgroundColor: 'var(--bg-surface)', borderRadius: '4px', fontSize: '11px', color: 'var(--text-muted)', borderLeft: '3px solid var(--primary-color)' }}>
                        備註: {record.remarks}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-subtle)', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                      <span>採購人: {record.purchaser_name || '--'}</span>
                      <span>{new Date(record.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Popover/Modal */}
      {quickAdd.show && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '16px', boxShadow: 'var(--modal-shadow)', width: '360px', padding: '24px' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--text-main)' }}>新增{quickAdd.type === 'type' ? '類型' : '廠牌'}</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>類別: {categories.find(c => c.id.toString() === quickAdd.catId.toString())?.name}</p>
            <input 
              autoFocus
              value={newName} 
              onChange={e => setNewName(e.target.value)} 
              placeholder="輸入名稱..." 
              style={{ ...inputStyle, marginBottom: '20px' }}
              onKeyDown={e => e.key === 'Enter' && handleQuickAddSave()}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setQuickAdd({ show: false, type: '', rowId: null, catId: null })} style={{ padding: '8px 16px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer' }}>取消</button>
              <button onClick={handleQuickAddSave} style={{ padding: '8px 24px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>儲存</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <div style={{ 
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '24px' 
        }}>
          <div style={{ backgroundColor: '#fff', width: '80vw', height: '80vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>{previewFile.originalName}</h3>
              <button onClick={() => setPreviewFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0' }}>
              {previewFile.type === 'application/pdf' ? (
                <iframe 
                  src={getMediaSrc(previewFile.fileName)} 
                  style={{ width: '100%', height: '100%', border: 'none' }} 
                  title="PDF Preview"
                />
              ) : (
                <img 
                  src={getMediaSrc(previewFile.fileName)} 
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                  alt="Preview"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' };
const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--input-border)', fontSize: '0.95rem', outline: 'none', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', boxSizing: 'border-box' };
const thStyle = { padding: '12px 16px', borderBottom: '2px solid var(--border-color)', fontWeight: 600, color: 'var(--table-header-text)', backgroundColor: 'var(--table-header-bg)', fontSize: '0.85rem' };
const tdStyle = { padding: '12px 16px', verticalAlign: 'middle', borderBottom: '1px solid var(--table-border)', color: 'var(--text-main)' };
const smallIconButtonStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)' };

export default ProcurementRegistration; 
