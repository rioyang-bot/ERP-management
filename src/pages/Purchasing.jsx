import React, { useState, useEffect, useCallback, useContext } from 'react';
import { Plus, Search, FileText, ShoppingCart, CheckCircle, Clock, AlertCircle, Trash2, DollarSign, Package, Tag, Filter, X, Save, Settings2, Trash } from 'lucide-react';
import { RoleContext } from '../context/RoleContext';

const ProcurementRegistration = () => {
  const { authUser } = useContext(RoleContext);
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
  const [partnerId, setPartnerId] = useState('');
  const [remarks, setRemarks] = useState('');

  // Items in this PO
  const [items, setItems] = useState([
    { id: 'initial-row', category_id: '', item_type: '', brand: '', model: '', specification: '', unit: '個', unit_price: '', quantity: 1 }
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

  const fetchData = useCallback(async () => {
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
        
        // Generate initial PO status if empty
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const poCountRes = await window.electronAPI.namedQuery(
          "countPurchaseOrders",
          [`PO-${today}-%`]
        );
        const nextNum = (poCountRes.success ? Number(poCountRes.rows[0].count) : 0) + 1;
        const paddedNum = nextNum.toString().padStart(2, '0');
        setOrderNo(prev => prev || `PO-${today}-${paddedNum}`);

        // Only init items if they are empty
        setItems(prev => {
          if (prev.length === 0 || (prev.length === 1 && !prev[0].specification)) {
             return [{ id: Date.now(), category_id: catsRes.rows[0].id.toString(), item_type: '', brand: '', model: '', specification: '', unit: '個', quantity: 1 }];
          }
          return prev;
        });
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
    if (!partnerId) return alert('請選擇供應商');
    if (items.some(i => !i.category_id || !i.specification || !i.quantity)) {
      return alert('請填寫完整的品項資訊');
    }

    setLoading(true);
    try {
      for (const item of items) {
        const res = await window.electronAPI.namedQuery('insertPurchaseRecord',
          [
            orderNo, partnerId, item.category_id, item.item_type, item.brand, item.model,
            item.specification, item.unit, item.quantity, authUser?.id, 'ORDERED', remarks
          ]
        );
        if (!res.success) {
          throw new Error(`品項 ${item.specification} 儲存失敗: ${res.error}`);
        }
      }

      alert('採購建檔成功！');
      
      // Reset form properly
      setOrderNo(''); 
      setRemarks('');
      setPartnerId('');
      setItems([]); // Clear items so fetchData can re-init
      
      await fetchData();
    } catch (err) {
      console.error("Submit Error:", err);
      alert('採購建檔失敗：' + err.message);
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

  return (
    <div className="purchasing-container">
      <div className="card-surface">
        <h1 className="page-title">採購建檔 (Procurement Registration)</h1>

        <form onSubmit={handleSubmit}>
          {/* Header Section */}
          <div className="card-surface" style={{ backgroundColor: '#f8f9fa', marginBottom: '24px', padding: '24px', border: '1px solid #eee' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>採購單號 (PO No.)</label>
                <input value={orderNo} readOnly style={{ ...inputStyle, backgroundColor: '#eee', fontWeight: 'bold' }} />
              </div>
              <div>
                <label style={labelStyle}>供應商 (Supplier) *</label>
                <select value={partnerId} onChange={e => setPartnerId(e.target.value)} style={inputStyle}>
                  <option value="">請選擇供應商</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>採購人員 (Purchaser)</label>
                <input disabled value={authUser?.full_name || '--'} style={{ ...inputStyle, backgroundColor: '#eee' }} />
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
          </div>

          {/* Items Section */}
          <div className="card-surface" style={{ padding: '0', overflow: 'hidden', border: '1px solid #eee' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f3f4', textAlign: 'left' }}>
                  <th style={{ ...thStyle, width: '130px' }}>類別</th>
                  <th style={{ ...thStyle, width: '230px' }}>廠牌 / 類型</th>
                  <th style={{ ...thStyle, width: '230px' }}>型號</th>
                  <th style={{ ...thStyle, width: '220px' }}>規格 (Specification)</th>
                  <th style={{ ...thStyle, width: '100px' }}>單位</th>
                  <th style={{ ...thStyle, width: '100px' }}>數量</th>
                  <th style={{ ...thStyle, width: '60px', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={tdStyle}>
                      <select 
                        value={row.category_id} 
                        onChange={e => handleItemChange(row.id, 'category_id', e.target.value)}
                        style={inputStyle}
                      >
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <select 
                          value={row.brand} 
                          onChange={e => handleItemChange(row.id, 'brand', e.target.value)}
                          style={{ ...inputStyle, fontSize: '0.8rem', padding: '6px' }}
                          disabled={!!row.model}
                        >
                          <option value="">(廠牌)</option>
                          {(options.brands[row.category_id] || []).map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <select 
                          value={row.item_type} 
                          onChange={e => handleItemChange(row.id, 'item_type', e.target.value)}
                          style={{ ...inputStyle, fontSize: '0.8rem', padding: '6px' }}
                          disabled={!!row.model}
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
                      />
                    </td>
                    <td style={tdStyle}>
                      <select 
                        value={row.unit} 
                        onChange={e => handleItemChange(row.id, 'unit', e.target.value)}
                        style={inputStyle}
                      >
                        {UNIFIED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <input 
                        type="number" 
                        value={row.quantity} 
                        onChange={e => handleItemChange(row.id, 'quantity', e.target.value)}
                        style={inputStyle}
                        min="1"
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button type="button" onClick={() => handleRemoveItem(row.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ff4d4f' }}>
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fafafa' }}>
              <button type="button" onClick={handleAddItem} style={{ 
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', 
                backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--primary-color)'
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
            <button type="button" onClick={fetchData} style={{ 
              padding: '14px 32px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' 
            }}>取消並重設</button>
            <button type="submit" disabled={loading} className="btn-primary" style={{ 
              padding: '14px 48px', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 700, boxShadow: '0 4px 12px rgba(27, 54, 93, 0.2)'
            }}>
              {loading ? '儲存中...' : '確認提交採購單'}
            </button>
          </div>
        </form>

        <hr style={{ margin: '40px 0', border: 'none', borderTop: '1px solid #eee' }} />

        {/* Recently Added List */}
        <div>
          <h3 style={{ marginBottom: '20px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={20} color="#666" /> 最近採購紀錄 (最新 10 筆)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {loading && purchaseRecords.length === 0 ? (
              <p style={{ color: '#aaa', gridColumn: '1 / span 2', textAlign: 'center' }}>載入中...</p>
            ) : purchaseRecords.length === 0 ? (
              <p style={{ color: '#aaa', gridColumn: '1 / span 2', textAlign: 'center' }}>尚無採購紀錄</p>
            ) : (
              purchaseRecords.map(record => (
                <div key={record.id} style={{ display: 'flex', flexDirection: 'column', padding: '16px', border: '1px solid #eee', borderRadius: '12px', backgroundColor: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--primary-color)', fontSize: '0.9rem' }}>{record.order_no}</span>
                    <span style={{ 
                      padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600,
                      backgroundColor: statusColors[record.status]?.bg, color: statusColors[record.status]?.color
                    }}>{statusColors[record.status]?.label}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '1rem', color: '#333' }}>
                    {record.specification}
                    {record.model && <span style={{ fontSize: '0.8rem', color: '#666', fontWeight: 400, marginLeft: '6px' }}>({record.model})</span>}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>
                    <span style={{ color: '#888' }}>{record.partner_name}</span> · 
                    <span style={{ fontWeight: 700, color: '#444' }}>{record.quantity} {record.unit}</span>
                  </div>
                  {record.remarks && (
                    <div style={{ marginTop: '8px', padding: '4px 8px', backgroundColor: '#f9f9f9', borderRadius: '4px', fontSize: '0.75rem', color: '#777', borderLeft: '3px solid #ddd' }}>
                      備註: {record.remarks}
                    </div>
                  )}
                  <div style={{ marginTop: '12px', textAlign: 'right', fontSize: '0.7rem', color: '#aaa', borderTop: '1px solid #fafafa', paddingTop: '8px' }}>
                    採購人: {record.purchaser_name || '--'} · {new Date(record.created_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Add Popover/Modal */}
      {quickAdd.show && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div className="card-surface" style={{ width: '360px', padding: '24px' }}>
            <h3 style={{ marginBottom: '16px' }}>新增{quickAdd.type === 'type' ? '類型' : '廠牌'}</h3>
            <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '16px' }}>類別: {categories.find(c => c.id.toString() === quickAdd.catId.toString())?.name}</p>
            <input 
              autoFocus
              value={newName} 
              onChange={e => setNewName(e.target.value)} 
              placeholder="輸入名稱..." 
              style={{ ...inputStyle, marginBottom: '20px' }}
              onKeyDown={e => e.key === 'Enter' && handleQuickAddSave()}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setQuickAdd({ show: false, type: '', rowId: null, catId: null })} style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>取消</button>
              <button onClick={handleQuickAddSave} style={{ padding: '8px 24px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>儲存</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .purchasing-container { max-width: 1200px; margin: 0 auto; }
      `}</style>
    </div>
  );
};

const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '8px' };
const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.95rem', outline: 'none', backgroundColor: '#fff', boxSizing: 'border-box' };
const thStyle = { padding: '12px 16px', borderBottom: '2px solid #eee', fontWeight: 600, color: '#666', fontSize: '0.85rem' };
const tdStyle = { padding: '12px 16px', verticalAlign: 'middle' };
const smallIconButtonStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', backgroundColor: '#f0f0f0', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' };

export default ProcurementRegistration; 
