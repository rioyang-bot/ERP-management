import React, { useState, useEffect, useCallback, useContext } from 'react';
import { Plus, Search, FileText, ShoppingCart, CheckCircle, Clock, AlertCircle, Trash2, DollarSign, Package, Tag, Filter, X, Save, Settings2 } from 'lucide-react';
import { RoleContext } from '../context/RoleContext';

const ProcurementRegistration = () => {
  const { authUser } = useContext(RoleContext);
  const [purchaseRecords, setPurchaseRecords] = useState([]);
  const [partners, setPartners] = useState([]);
  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  // 新增類型/廠牌的 UI 狀態
  const [showAddType, setShowAddType] = useState(false);
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newBrandName, setNewBrandName] = useState('');

  // 表單狀態
  const [formData, setFormData] = useState(() => ({
    order_no: `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 1000)}`,
    partner_id: '',
    category_id: '',
    item_type: '',
    brand: '',
    specification: '',
    unit: '個',
    unit_price: '',
    quantity: 1
  }));

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [recordsRes, partnersRes, catsRes] = await Promise.all([
      window.electronAPI.dbQuery(`
        SELECT pr.*, p.name as partner_name, c.name as category_name, u.full_name as purchaser_name
        FROM purchase_records pr
        LEFT JOIN partners p ON pr.partner_id = p.id
        LEFT JOIN categories c ON pr.category_id = c.id
        LEFT JOIN users u ON pr.purchaser_id = u.id
        ORDER BY pr.created_at DESC
        LIMIT 5
      `),
      window.electronAPI.dbQuery("SELECT id, name FROM partners WHERE partner_type = 'SUPPLIER' ORDER BY name ASC"),
      window.electronAPI.dbQuery("SELECT id, name FROM categories")
    ]);

    if (recordsRes.success) setPurchaseRecords(recordsRes.rows);
    if (partnersRes.success) setPartners(partnersRes.rows);
    if (catsRes.success) {
      setCategories(catsRes.rows);
      setFormData(prev => {
        if (!prev.category_id && catsRes.rows.length > 0) {
          return { ...prev, category_id: catsRes.rows[0].id.toString() };
        }
        return prev;
      });
    }
    setLoading(false);
  }, []);

  const fetchTypesAndBrands = useCallback(async (catId) => {
    if (!catId) return;
    const [typesRes, brandsRes] = await Promise.all([
      window.electronAPI.dbQuery("SELECT name FROM item_types WHERE category_id = $1 ORDER BY name ASC", [catId]),
      window.electronAPI.dbQuery("SELECT name FROM item_brands WHERE category_id = $1 ORDER BY name ASC", [catId])
    ]);
    if (typesRes.success) setTypes(typesRes.rows.map(r => r.name));
    if (brandsRes.success) setBrands(brandsRes.rows.map(r => r.name));
  }, []);

  useEffect(() => {
    const init = async () => {
      await fetchData();
    };
    init();
  }, [fetchData]);

  useEffect(() => {
    const syncTypesAndBrands = async () => {
      if (formData.category_id) {
        await fetchTypesAndBrands(formData.category_id);
      }
    };
    syncTypesAndBrands();
  }, [formData.category_id, fetchTypesAndBrands]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddType = async () => {
    if (!newTypeName.trim() || !formData.category_id) return;
    const res = await window.electronAPI.dbQuery(
      'INSERT INTO item_types (category_id, name) VALUES ($1, $2)',
      [formData.category_id, newTypeName.trim()]
    );
    if (res.success) {
      setFormData(prev => ({ ...prev, item_type: newTypeName.trim() }));
      setNewTypeName('');
      setShowAddType(false);
      fetchTypesAndBrands(formData.category_id);
    } else {
      alert('新增失敗：' + res.error);
    }
  };

  const handleAddBrand = async () => {
    if (!newBrandName.trim() || !formData.category_id) return;
    const res = await window.electronAPI.dbQuery(
      'INSERT INTO item_brands (category_id, name) VALUES ($1, $2)',
      [formData.category_id, newBrandName.trim()]
    );
    if (res.success) {
      setFormData(prev => ({ ...prev, brand: newBrandName.trim() }));
      setNewBrandName('');
      setShowAddBrand(false);
      fetchTypesAndBrands(formData.category_id);
    } else {
      alert('新增失敗：' + res.error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.partner_id || !formData.category_id || !formData.specification || !formData.unit_price) {
      return alert('請填寫完整採購資訊');
    }

    const res = await window.electronAPI.dbQuery(`
      INSERT INTO purchase_records (
        order_no, partner_id, category_id, item_type, brand, 
        specification, unit, unit_price, quantity, purchaser_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      formData.order_no, 
      formData.partner_id, 
      formData.category_id, 
      formData.item_type, 
      formData.brand, 
      formData.specification, 
      formData.unit, 
      formData.unit_price, 
      formData.quantity, 
      authUser?.id
    ]);

    if (res.success) {
      alert('採購紀錄已建立');
      setFormData(prev => ({
        ...prev,
        order_no: `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 1000)}`,
        item_type: '',
        brand: '',
        specification: '',
        unit_price: '',
        quantity: 1
      }));
      fetchData();
    } else {
      alert('建立失敗：' + res.error);
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
        
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1fr) 1.5fr', gap: '32px' }}>
          {/* 左側：表單 */}
          <div style={{ padding: '24px', backgroundColor: '#fcfcfc', borderRadius: '12px', border: '1px solid #eee' }}>
            <h3 style={{ margin: '0 0 24px 0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem' }}>
              <Plus size={22} color="var(--primary-color)" /> 新建採購單
            </h3>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={labelStyle}>採購類別 (Category)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {categories.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, category_id: c.id.toString(), item_type: '', brand: '' }))}
                      style={{
                        flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid',
                        borderColor: formData.category_id === c.id.toString() ? 'var(--primary-color)' : '#ddd',
                        backgroundColor: formData.category_id === c.id.toString() ? '#f0f7ff' : '#fff',
                        color: formData.category_id === c.id.toString() ? 'var(--primary-color)' : '#666',
                        fontWeight: formData.category_id === c.id.toString() ? 700 : 400,
                        cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.9rem'
                      }}
                    >
                      {c.name === '資訊設備' ? '資產 (Asset)' : (c.name === '辦公耗材' ? '耗材 (Consumable)' : c.name)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>供應商 (Supplier)</label>
                <select name="partner_id" value={formData.partner_id} onChange={handleInputChange} style={inputStyle}>
                  <option value="">請選擇供應商</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ position: 'relative' }}>
                  <label style={labelStyle}>類型 (Type)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select name="item_type" value={formData.item_type} onChange={handleInputChange} style={{ ...inputStyle, flex: 1 }}>
                      <option value="">請選擇類型</option>
                      {types.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button type="button" onClick={() => setShowAddType(!showAddType)} style={iconButtonStyle}><Plus size={18} /></button>
                  </div>
                  {showAddType && (
                    <div className="popover-input">
                      <input type="text" placeholder="名稱" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} style={smallInputStyle} />
                      <button type="button" onClick={handleAddType} className="btn-small-add">新增</button>
                      <X size={14} style={{ cursor: 'pointer' }} onClick={() => setShowAddType(false)} />
                    </div>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <label style={labelStyle}>廠牌 (Brand)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select name="brand" value={formData.brand} onChange={handleInputChange} style={{ ...inputStyle, flex: 1 }}>
                      <option value="">請選擇廠牌</option>
                      {brands.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <button type="button" onClick={() => setShowAddBrand(!showAddBrand)} style={iconButtonStyle}><Plus size={18} /></button>
                  </div>
                  {showAddBrand && (
                    <div className="popover-input">
                      <input type="text" placeholder="名稱" value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)} style={smallInputStyle} />
                      <button type="button" onClick={handleAddBrand} className="btn-small-add">新增</button>
                      <X size={14} style={{ cursor: 'pointer' }} onClick={() => setShowAddBrand(false)} />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label style={labelStyle}>規格 (Specification)</label>
                <input type="text" name="specification" value={formData.specification} onChange={handleInputChange} style={inputStyle} placeholder="詳細規格描述" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>單位 (Unit)</label>
                  <select name="unit" value={formData.unit} onChange={handleInputChange} style={inputStyle}>
                    {UNIFIED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>數量 (Qty)</label>
                  <input type="number" name="quantity" value={formData.quantity} onChange={handleInputChange} style={inputStyle} min="1" />
                </div>
              </div>

              <div>
                <label style={labelStyle}>採購單價 (Unit Price)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }}>$</span>
                  <input type="number" name="unit_price" value={formData.unit_price} onChange={handleInputChange} style={{ ...inputStyle, paddingLeft: '28px' }} placeholder="0.00" />
                </div>
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '12px', padding: '14px', borderRadius: '10px', fontSize: '1rem', fontWeight: 700 }}>
                 確認建立採購單
              </button>
            </form>
          </div>

          {/* 右側：最近紀錄 */}
          <div>
            <h3 style={{ marginBottom: '20px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={20} color="#666" /> 最近採購紀錄 (最新5筆)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {loading ? (
                <p style={{ color: '#aaa', textAlign: 'center', marginTop: '40px' }}>資料載入中...</p>
              ) : purchaseRecords.length === 0 ? (
                <p style={{ color: '#aaa', textAlign: 'center', marginTop: '40px' }}>尚無採購紀錄</p>
              ) : (
                purchaseRecords.map(record => (
                  <div key={record.id} style={{ display: 'flex', alignItems: 'center', padding: '16px', border: '1px solid #eee', borderRadius: '12px', backgroundColor: '#fff' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--primary-color)', fontSize: '0.95rem' }}>{record.order_no}</span>
                        <span style={{ 
                          padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600,
                          backgroundColor: statusColors[record.status]?.bg, color: statusColors[record.status]?.color
                        }}>{statusColors[record.status]?.label}</span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{record.specification}</div>
                      <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '4px' }}>
                        {record.partner_name} · {record.quantity} {record.unit} · <span style={{ fontWeight: 600, color: '#444' }}>${Number(record.unit_price).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .popover-input {
          position: absolute; top: 100%; left: 0; right: 0; z-index: 10;
          display: flex; gap: 8px; align-items: center;
          padding: 8px; background: #fff; border: 1px solid #ddd;
          border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 4px;
        }
        .btn-small-add { padding: 4px 10px; background: var(--primary-color); color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; }
      `}</style>
    </div>
  );
};

const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '8px' };
const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.95rem', outline: 'none', backgroundColor: '#fff' };
const smallInputStyle = { flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.8rem' };
const iconButtonStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '42px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer' };

export default ProcurementRegistration;
