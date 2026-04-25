import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Save, Settings2, Trash2, X } from 'lucide-react';

const Consumables = () => {
  const [items, setItems] = useState([]);
  const [types, setTypes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [showAddType, setShowAddType] = useState(false);
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [showManageType, setShowManageType] = useState(false);
  const [showManageBrand, setShowManageBrand] = useState(false);
  const [showManageModel, setShowManageModel] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newBrandName, setNewBrandName] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [models, setModels] = useState([]);
  const [formData, setFormData] = useState({ type: '', brand: '', model: '', spec: '', unit: '個', safety_stock: 0 });
  const UNIFIED_UNITS = ['個', '台', '盒', '包', '支', '組', '瓶', '卷', '張', '份'];
  const [formKey, setFormKey] = useState(0); // 用於強制重整表單區域

  const fetchConsumables = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchRecentConsumables');
    if (res.success) {
      setItems(res.rows);
    }
  }, []);

  const fetchTypes = useCallback(async (brandName, currentType = '') => {
    if (!brandName) {
      setTypes([]);
      return { typeNames: [], nextType: '' };
    }
    const res = await window.electronAPI.namedQuery('fetchConsumableTypesByBrand', [brandName]);
    if (res.success) {
      const typeNames = res.rows.map(r => r.name);
      setTypes(typeNames);
      const nextType = typeNames.includes(currentType) ? currentType : (typeNames[0] || '');
      setFormData(prev => ({ ...prev, type: nextType }));
      return { typeNames, nextType };
    }
    return { typeNames: [], nextType: '' };
  }, []);
  const fetchModels = useCallback(async (brandName, typeName) => {
    if (!brandName || !typeName) {
      setModels([]);
      return { modelNames: [] };
    }
    const res = await window.electronAPI.namedQuery('fetchConsumableModelsByBrandType', [brandName, typeName]);
    if (res.success) {
      const modelNames = res.rows.map(r => r.name);
      setModels(modelNames);
      setFormData(prev => ({
        ...prev,
        model: modelNames.includes(prev.model) ? prev.model : (modelNames[0] || '')
      }));
      return { modelNames };
    }
    return { modelNames: [] };
  }, []);
  const fetchBrands = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchConsumableBrands');
    if (res.success) {
      setBrands(res.rows);
      if (!formData.brand && res.rows.length > 0) {
        const initialBrand = res.rows[0].name;
        setFormData(prev => ({ ...prev, brand: initialBrand }));
        const { nextType } = await fetchTypes(initialBrand);
        if (nextType) await fetchModels(initialBrand, nextType);
      }
    }
  }, [formData.brand, fetchTypes, fetchModels]);

  useEffect(() => {
    const init = async () => {
      fetchConsumables();
      
      const res = await window.electronAPI.namedQuery('fetchConsumableBrands');
      if (res.success && res.rows.length > 0) {
        setBrands(res.rows);
        const initialBrand = res.rows[0].name;
        const { nextType } = await fetchTypes(initialBrand);
        if (nextType) {
          await fetchModels(initialBrand, nextType);
        }
      }
    };
    init();
  }, [fetchConsumables, fetchTypes, fetchModels]);

  const handleAddType = async () => {
    const trimmedName = newTypeName.trim();
    if (!trimmedName) return;

    if (types.includes(trimmedName)) {
      setFormData({ ...formData, type: trimmedName });
      setNewTypeName('');
      setShowAddType(false);
      return;
    }

    const res = await window.electronAPI.namedQuery('insertDeviceType', ['辦公耗材', formData.brand, trimmedName]);
    if (res.success) {
      setFormData(prev => ({ ...prev, type: trimmedName }));
      await fetchTypes(formData.brand);
      setNewTypeName('');
      setShowAddType(false);
    } else {
      alert('新增類型失敗：' + res.error);
    }
  };

  const handleDeleteType = async (typeName) => {
    if (!confirm(`確定要刪除「${typeName}」嗎？這不會影響現有耗材資料，但選單中將不再出現此選項。`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceType', [typeName, '辦公耗材', formData.brand]);
    if (res.success) {
      await fetchTypes(formData.brand);
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

    if (brands.some(b => b.name === trimmedName)) {
      setFormData({ ...formData, brand: trimmedName });
      setNewBrandName('');
      setShowAddBrand(false);
      return;
    }

    const res = await window.electronAPI.namedQuery('insertDeviceBrand', ['辦公耗材', trimmedName]);
    if (res.success) {
      setFormData({ ...formData, brand: trimmedName });
      await fetchBrands();
      setNewBrandName('');
      setShowAddBrand(false);
    } else {
      alert('新增廠牌失敗：' + res.error);
    }
  };

  const handleAddModel = async () => {
    const trimmedName = newModelName.trim();
    if (!trimmedName) return;

    if (models.includes(trimmedName)) {
      setFormData({ ...formData, model: trimmedName });
      setNewModelName('');
      setShowAddModel(false);
      return;
    }

    const res = await window.electronAPI.namedQuery('insertDeviceModel', [formData.brand, formData.type, '辦公耗材', trimmedName]);
    if (res.success) {
      setFormData(prev => ({ ...prev, model: trimmedName }));
      await fetchModels(formData.brand, formData.type);
      setNewModelName('');
      setShowAddModel(false);
    } else {
      alert('新增型號失敗：' + res.error);
    }
  };

  const handleDeleteModel = async (modelName) => {
    if (!confirm(`確定要刪除「${modelName}」嗎？這不會影響現有耗材資料，但選單中將不再出現此選項。`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceModel', [modelName, formData.brand, formData.type, '辦公耗材']);
    if (res.success) {
      await fetchModels(formData.brand, formData.type);
      if (formData.model === modelName) {
        setFormData(prev => ({ ...prev, model: '' }));
      }
    } else {
      alert('刪除失敗：' + res.error);
    }
  };

  const handleDeleteBrand = async (brandName) => {
    if (!confirm(`確定要刪除「${brandName}」嗎？這不會影響現有耗材資料，但選單中將不再出現此選項。`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceBrand', [brandName, '辦公耗材']);
    if (res.success) {
      await fetchBrands();
      if (formData.brand === brandName) {
        setFormData(prev => ({ ...prev, brand: '' }));
      }
    } else {
      alert('刪除失敗：' + res.error);
    }
  };

  const handleChange = async (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (name === 'brand') {
      const { nextType } = await fetchTypes(value);
      if (nextType) await fetchModels(value, nextType);
      else setModels([]);
    } else if (name === 'type') {
      await fetchModels(formData.brand, value);
    }
  };

  const handleAddConsumable = async () => {
    if (!formData.type || !formData.brand || !formData.model) return alert('請填寫必填欄位 (型號為必填)');

    const fullSpec = `${formData.type} ${formData.brand} ${formData.spec ? `(${formData.spec})` : ''}`.trim();

    const res = await window.electronAPI.namedQuery('insertConsumableMaster', [fullSpec, formData.type, formData.brand, formData.model, formData.unit, formData.safety_stock || 0, '辦公耗材']);

    if (res.success) {
      alert('耗材建檔成功！');
      await fetchConsumables();
      setFormData({ type: types[0] || '', brand: brands[0] || '', model: '', spec: '', unit: '個', safety_stock: 0 });
      setFormKey(prev => prev + 1);
    } else {
      alert('建檔失敗：' + res.error);
    }
  };

  return (
    <div className="assets-container">
      <div className="card-surface">
        <h1 className="page-title">耗材建檔 (Consumables Registration)</h1>

        <div key={formKey} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          {/* 左側：表單 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>廠牌 (Brand) *</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select name="brand" value={formData.brand} onChange={handleChange} style={inputStyle}>
                      <option value="">請選擇廠牌</option>
                      {brands.map(b => (
                        <option key={b.id} value={b.name}>{b.name}</option>
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
                        <div key={b.id} style={manageItemStyle}><span>{b.name}</span><Trash2 size={14} color="#ff4d4f" style={{ cursor: 'pointer' }} onClick={() => handleDeleteBrand(b.name)} /></div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>類型 (Type) *</label>
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
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={labelStyle}>型號 (Model) *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select name="model" value={formData.model} onChange={handleChange} style={inputStyle}>
                  <option value="">請選擇型號</option>
                  {models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <button onClick={() => { setShowAddModel(!showAddModel); setShowManageModel(false); }} style={iconButtonStyle} title="新增型號"><Plus size={18} /></button>
                <button onClick={() => { setShowManageModel(!showManageModel); setShowAddModel(false); }} style={iconButtonStyle} title="管理型號"><Settings2 size={18} /></button>
              </div>
              {showAddModel && (
                <div style={popoverStyle}>
                  <input type="text" placeholder="新名稱" value={newModelName} onChange={(e) => setNewModelName(e.target.value)} style={smallInputStyle} />
                  <button onClick={handleAddModel} style={smallAddButtonStyle}>新增</button>
                </div>
              )}
              {showManageModel && (
                <div style={manageListStyle}>
                  <div style={manageHeaderStyle}><span>管理型號</span><X size={14} style={{ cursor: 'pointer' }} onClick={() => setShowManageModel(false)} /></div>
                  {models.map(m => (
                    <div key={m} style={manageItemStyle}><span>{m}</span><Trash2 size={14} color="#ff4d4f" style={{ cursor: 'pointer' }} onClick={() => handleDeleteModel(m)} /></div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>規格內容 (Specification)</label>
              <textarea name="spec" value={formData.spec} onChange={handleChange} style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }} placeholder="請輸入詳細規格，例如：藍色、大容量、5% 覆蓋率等" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={labelStyle}>單位 (Unit)</label>
                <select name="unit" value={formData.unit} onChange={handleChange} style={inputStyle}>
                  {UNIFIED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>安全庫存 (Safety Stock)</label>
                <input type="number" name="safety_stock" value={formData.safety_stock} onChange={handleChange} style={inputStyle} />
              </div>
            </div>

            <button onClick={handleAddConsumable} className="btn-primary" style={{ marginTop: '12px', padding: '14px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Save size={18} /> 儲存耗材資料
            </button>
          </div>

          {/* 右側：列表 */}
          <div>
            <h3 style={{ marginBottom: '20px', color: 'var(--text-main)', fontSize: '1.1rem' }}>已建檔耗材範本</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '16px', border: '1px solid #eee', borderRadius: '12px', backgroundColor: '#fff' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, color: 'var(--primary-color)', fontSize: '0.9rem' }}>
                      {item.brand || 'N/A'} {item.model && <span style={{ color: '#666', fontWeight: 400 }}>({item.model})</span>}
                    </div>
                    <div style={{ color: '#333', fontSize: '1rem', fontWeight: 600, margin: '4px 0' }}>
                      {item.specification.replace(`${item.type} ${item.brand}`, '').trim().replace(/^\(|\)$/g, '') || '通用規格'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#888' }}><span style={{ backgroundColor: '#f1f3f4', padding: '2px 6px', borderRadius: '4px' }}>{item.type}</span></div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                    <div style={{ color: '#666' }}>單位: {item.unit}</div>
                    <div style={{ color: '#d32f2f', fontWeight: 600, marginTop: '4px' }}>低水位預警: {item.safety_stock}</div>
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

export default Consumables;
