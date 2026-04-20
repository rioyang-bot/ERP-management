import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Save, Settings2, Trash2, X } from 'lucide-react';

const Assets = () => {
  const [items, setItems] = useState([]);
  const [types, setTypes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [showAddType, setShowAddType] = useState(false);
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [showManageType, setShowManageType] = useState(false);
  const [showManageBrand, setShowManageBrand] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newBrandName, setNewBrandName] = useState('');
  const [formData, setFormData] = useState({ 
    type: '', brand: '', sn: '', specification: '', client: '', 
    hostname: '', location: '', installed_date: '', 
    customer_warranty_expire: '', system_date: '', warranty_expire: '',
    unit: '個' 
  });
  const UNIFIED_UNITS = ['個', '台', '盒', '包', '支', '組', '瓶', '卷', '張', '份'];
  const [formKey, setFormKey] = useState(0); // 用於強制重整表單區域

  const fetchAssets = useCallback(async () => {
    const res = await window.electronAPI.dbQuery(`
      SELECT i.* FROM items i 
      LEFT JOIN categories c ON i.category_id = c.id 
      WHERE c.name = '資訊設備' 
      ORDER BY i.id DESC
      LIMIT 10
    `);
    if (res.success) {
      setItems(res.rows);
    }
  }, []);

  const fetchTypes = useCallback(async () => {
    const res = await window.electronAPI.dbQuery(`
      SELECT name FROM item_types 
      WHERE category_id = (SELECT id FROM categories WHERE name = '資訊設備')
      ORDER BY name ASC
    `);
    if (res.success) {
      const typeNames = res.rows.map(r => r.name);
      setTypes(typeNames);
      setFormData(prev => {
        if (!prev.type && typeNames.length > 0) {
          return { ...prev, type: typeNames[0] };
        }
        return prev;
      });
    }
  }, []);

  const fetchBrands = useCallback(async () => {
    const res = await window.electronAPI.dbQuery(`
      SELECT name FROM item_brands 
      WHERE category_id = (SELECT id FROM categories WHERE name = '資訊設備')
      ORDER BY name ASC
    `);
    if (res.success) {
      const brandNames = res.rows.map(r => r.name);
      setBrands(brandNames);
      setFormData(prev => {
        if (!prev.brand && brandNames.length > 0) {
          return { ...prev, brand: brandNames[0] };
        }
        return prev;
      });
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchAssets();
      fetchTypes();
      fetchBrands();
    });
  }, [fetchAssets, fetchTypes, fetchBrands]);

  const handleAddType = async () => {
    const trimmedName = newTypeName.trim();
    if (!trimmedName) return;

    if (types.includes(trimmedName)) {
      setFormData({ ...formData, type: trimmedName });
      setNewTypeName('');
      setShowAddType(false);
      return;
    }

    const res = await window.electronAPI.dbQuery(
      'INSERT INTO item_types (category_id, name) VALUES ((SELECT id FROM categories WHERE name = $1), $2)',
      ['資訊設備', trimmedName]
    );
    if (res.success) {
      setFormData({ ...formData, type: trimmedName });
      await fetchTypes();
      setNewTypeName('');
      setShowAddType(false);
    } else {
      alert('新增類型失敗：' + res.error);
    }
  };

  const handleDeleteType = async (typeName) => {
    if (!confirm(`確定要刪除「${typeName}」嗎？這不會影響現有資產資料，但選單中將不再出現此選項。`)) return;
    const res = await window.electronAPI.dbQuery(
      'DELETE FROM item_types WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = $2)',
      [typeName, '資訊設備']
    );
    if (res.success) {
      await fetchTypes();
      if (formData.type === typeName) {
        setFormData(prev => ({ ...prev, type: '' }));
      }
    } else {
      alert('刪除失敗：' + res.error);
    }
  };

  const handleAddBrand = async () => {
    const trimmedName = newBrandName.trim();
    if (!trimmedName) return;

    if (brands.includes(trimmedName)) {
      setFormData({ ...formData, brand: trimmedName });
      setNewBrandName('');
      setShowAddBrand(false);
      return;
    }

    const res = await window.electronAPI.dbQuery(
      'INSERT INTO item_brands (category_id, name) VALUES ((SELECT id FROM categories WHERE name = $1), $2)',
      ['資訊設備', trimmedName]
    );
    if (res.success) {
      setFormData({ ...formData, brand: trimmedName });
      await fetchBrands();
      setNewBrandName('');
      setShowAddBrand(false);
    } else {
      alert('新增廠牌失敗：' + res.error);
    }
  };

  const handleDeleteBrand = async (brandName) => {
    if (!confirm(`確定要刪除「${brandName}」嗎？這不會影響現有資產資料，但選單中將不再出現此選項。`)) return;
    const res = await window.electronAPI.dbQuery(
      'DELETE FROM item_brands WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = $2)',
      [brandName, '資訊設備']
    );
    if (res.success) {
      await fetchBrands();
      if (formData.brand === brandName) {
        setFormData(prev => ({ ...prev, brand: '' }));
      }
    } else {
      alert('刪除失敗：' + res.error);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAddAsset = async () => {
    if (!formData.sn || !formData.specification || !formData.type) return alert('請填寫必填欄位');
    
    const res = await window.electronAPI.dbQuery(`
      INSERT INTO items (
        sn, specification, type, brand, unit, 
        client, hostname, location, installed_date, 
        customer_warranty_expire, system_date, warranty_expire,
        category_id, purchase_price
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, (SELECT id FROM categories WHERE name = $13), 0)`,
      [
        formData.sn, formData.specification, formData.type, formData.brand, formData.unit, 
        formData.client, formData.hostname, formData.location, formData.installed_date || null,
        formData.customer_warranty_expire || null, formData.system_date || null, formData.warranty_expire || null,
        '資訊設備'
      ]
    );

    if (res.success) {
      alert('設備建檔成功！');
      await fetchAssets();
      setFormData({ 
        sn: '', specification: '', type: types[0] || '', brand: brands[0] || '', client: '', 
        hostname: '', location: '', installed_date: '', 
        customer_warranty_expire: '', system_date: '', warranty_expire: '',
        unit: '個' 
      });
      setFormKey(prev => prev + 1);
    } else {
      alert('建檔失敗：' + res.error);
    }
  };

  return (
    <div className="assets-container">
      <div className="card-surface">
        <h1 className="page-title">設備建檔 (Device Registration)</h1>
        
        <div key={formKey} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px' }}>
          {/* 左側：表單 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 600, fontSize: '0.9rem', color: '#555' }}>類型 (Type) *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select name="type" value={formData.type} onChange={handleChange} style={inputStyle}>
                    {types.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <button onClick={() => { setShowAddType(!showAddType); setShowManageType(false); }} style={iconButtonStyle} title="新增類型"><Plus size={18} /></button>
                  <button onClick={() => { setShowManageType(!showManageType); setShowAddType(false); }} style={iconButtonStyle} title="管理類型"><Settings2 size={18} /></button>
                </div>
                {showAddType && (
                  <div style={popoverStyle}>
                    <input type="text" placeholder="新名稱" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} style={smallInputStyle} />
                    <button onClick={handleAddType} style={smallAddButtonStyle}>新增</button>
                  </div>
                )}
                {showManageType && (
                  <div style={manageListStyle}>
                    <div style={manageHeaderStyle}><span>管理類型</span><X size={14} style={{ cursor: 'pointer' }} onClick={() => setShowManageType(false)} /></div>
                    {types.map(t => (
                      <div key={t} style={manageItemStyle}><span>{t}</span><Trash2 size={14} color="#ff4d4f" style={{ cursor: 'pointer' }} onClick={() => handleDeleteType(t)} /></div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 600, fontSize: '0.9rem', color: '#555' }}>廠牌 (Brand) *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select name="brand" value={formData.brand} onChange={handleChange} style={inputStyle}>
                    {brands.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  <button onClick={() => { setShowAddBrand(!showAddBrand); setShowManageBrand(false); }} style={iconButtonStyle} title="新增廠牌"><Plus size={18} /></button>
                  <button onClick={() => { setShowManageBrand(!showManageBrand); setShowAddBrand(false); }} style={iconButtonStyle} title="管理廠牌"><Settings2 size={18} /></button>
                </div>
                {showAddBrand && (
                  <div style={popoverStyle}>
                    <input type="text" placeholder="新名稱" value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)} style={smallInputStyle} />
                    <button onClick={handleAddBrand} style={smallAddButtonStyle}>新增</button>
                  </div>
                )}
                {showManageBrand && (
                  <div style={manageListStyle}>
                    <div style={manageHeaderStyle}><span>管理廠牌</span><X size={14} style={{ cursor: 'pointer' }} onClick={() => setShowManageBrand(false)} /></div>
                    {brands.map(b => (
                      <div key={b} style={manageItemStyle}><span>{b}</span><Trash2 size={14} color="#ff4d4f" style={{ cursor: 'pointer' }} onClick={() => handleDeleteBrand(b)} /></div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={labelStyle}>序號 / SN *</label>
                <input type="text" name="sn" value={formData.sn} onChange={handleChange} style={inputStyle} placeholder="唯一硬體序號" />
              </div>
              <div>
                <label style={labelStyle}>HostName</label>
                <input type="text" name="hostname" value={formData.hostname} onChange={handleChange} style={inputStyle} placeholder="例如: SRV-APP-01" />
              </div>
            </div>

            <div>
              <label style={labelStyle}>規格 (Specification) *</label>
              <input type="text" name="specification" value={formData.specification} onChange={handleChange} style={inputStyle} placeholder="詳細型號與規格文字" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div><label style={labelStyle}>客戶名稱 (Customer)</label><input type="text" name="client" value={formData.client} onChange={handleChange} style={inputStyle} placeholder="客戶公司/名稱" /></div>
              <div><label style={labelStyle}>放置位置 (Location)</label><input type="text" name="location" value={formData.location} onChange={handleChange} style={inputStyle} placeholder="例如: 1F A機櫃" /></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>專案安裝日期 (Project Date)</label>
                <input type="date" name="installed_date" value={formData.installed_date} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>系統日期 (System Date)</label>
                <input type="date" name="system_date" value={formData.system_date} onChange={handleChange} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>原廠保固到期 (Warranty Expire)</label>
                <input type="date" name="warranty_expire" value={formData.warranty_expire} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>客戶保固到期 (Cust Warranty)</label>
                <input type="date" name="customer_warranty_expire" value={formData.customer_warranty_expire} onChange={handleChange} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>單位 (Unit)</label>
                <select name="unit" value={formData.unit} onChange={handleChange} style={inputStyle}>
                  {UNIFIED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <button onClick={handleAddAsset} className="btn-primary" style={{ marginTop: '12px', padding: '14px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Save size={18} /> 儲存設備建檔
            </button>
          </div>

          {/* 右側：列表 */}
          <div>
            <h3 style={{ marginBottom: '20px', color: 'var(--text-main)', fontSize: '1.1rem' }}>最近已建檔資產</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '16px', border: '1px solid #eee', borderRadius: '12px', backgroundColor: '#fff' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, color: 'var(--primary-color)', fontSize: '0.9rem' }}>{item.brand || 'N/A'}</div>
                    <div style={{ color: '#333', fontSize: '1rem', fontWeight: 600, margin: '4px 0' }}>
                       <span style={{ color: '#888', marginRight: '6px' }}>[{item.sn}]</span>
                       {item.specification}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#888' }}><span style={{ backgroundColor: '#f1f3f4', padding: '2px 6px', borderRadius: '4px' }}>{item.type}</span></div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                    <div style={{ color: '#722ed1', fontWeight: 600 }}>{item.client || '--'}</div>
                    <div style={{ color: '#666', marginTop: '4px' }}>{item.hostname || 'No HostName'}</div>
                    <div style={{ color: '#888', fontSize: '0.75rem' }}>{item.location || '--'}</div>
                  </div>
                </div>
              ))}
              {items.length === 0 && <p style={{ color: '#aaa', textAlign: 'center', marginTop: '40px' }}>目前尚清單為空</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const labelStyle = { display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#555', marginBottom: '8px' };
const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.95rem', outline: 'none', backgroundColor: '#fff', boxSizing: 'border-box' };
const iconButtonStyle = { padding: '0 12px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer' };
const smallInputStyle = { flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '0.85rem' };
const smallAddButtonStyle = { padding: '6px 12px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' };
const popoverStyle = { display: 'flex', gap: '8px', marginTop: '4px', backgroundColor: '#f9fafb', padding: '8px', borderRadius: '8px', border: '1px solid #eee' };
const manageListStyle = { marginTop: '8px', backgroundColor: '#fff', padding: '12px', borderRadius: '10px', border: '1px solid #eee', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', maxHeight: '200px', overflowY: 'auto' };
const manageHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #f0f0f0', paddingBottom: '6px', fontSize: '0.9rem', fontWeight: 700 };
const manageItemStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: '0.9rem', borderBottom: '1px solid #f9f9f9' };

export default Assets;
