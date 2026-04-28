import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Save, Settings2, Trash2, X, Package, Clock } from 'lucide-react';

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
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [showManageUnit, setShowManageUnit] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newBrandName, setNewBrandName] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [models, setModels] = useState([]);
  const [units, setUnits] = useState(['個', '台', '盒', '包', '支', '組', '瓶', '卷', '張', '份']);
  const [formData, setFormData] = useState({ type: '', brand: '', model: '', spec: '', unit: '個', safety_stock: 0, stock_qty: 0 });
  const [formKey, setFormKey] = useState(0); // 用於強制重整表單區域

  const validateAndSanitize = (val, fieldName = '欄位') => {
    if (typeof val !== 'string' || !val) return val;
    const charRegex = /[|&;$%@'"\\()+\r\n,]/g;
    const keywordRegex = /\b(Select|Insert|Dbo|Declare|Cast|Drop|Union|Exec|Nvarchar)\b/gi;
    if (charRegex.test(val) || keywordRegex.test(val)) {
      alert(`「${fieldName}」包含不合規的安全規則字元或關鍵字，請移除特殊符號。`);
      return null;
    }
    return val.trim();
  };

  const fetchConsumables = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchRecentConsumables');
    if (res.success) setItems(res.rows);
  }, []);

  const fetchTypes = useCallback(async (brandName, currentType = '') => {
    if (!brandName) { setTypes([]); return { typeNames: [], nextType: '' }; }
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
    if (!brandName || !typeName) { setModels([]); return { modelNames: [] }; }
    const res = await window.electronAPI.namedQuery('fetchConsumableModelsByBrandType', [brandName, typeName]);
    if (res.success) {
      const modelNames = res.rows.map(r => r.name);
      setModels(modelNames);
      setFormData(prev => ({ ...prev, model: modelNames.includes(prev.model) ? prev.model : (modelNames[0] || '') }));
      return { modelNames };
    }
    return { modelNames: [] };
  }, []);

  const fetchUnits = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('getSystemSetting', ['unified_units']);
    if (res.success && res.rows.length > 0) {
      setUnits(res.rows[0].value || ['個', '台', '盒', '包', '支', '組', '瓶', '卷', '張', '份']);
    }
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
    const initData = async () => {
      await Promise.all([
        fetchConsumables(),
        fetchBrands(),
        fetchUnits()
      ]);
    };
    initData();
  }, [fetchConsumables, fetchBrands, fetchUnits]);

  const handleAddType = async () => {
    const name = validateAndSanitize(newTypeName, '類型名稱');
    if (!name || !formData.brand) return;
    const res = await window.electronAPI.namedQuery('insertDeviceType', ['辦公耗材', formData.brand, name]);
    if (res.success) {
      await fetchTypes(formData.brand);
      setFormData(prev => ({ ...prev, type: name }));
      setNewTypeName('');
      setShowAddType(false);
    }
  };

  const handleDeleteType = async (typeName) => {
    if (!confirm(`確定要刪除「${typeName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceType', [typeName, '辦公耗材', formData.brand]);
    if (res.success) {
      await fetchTypes(formData.brand);
      if (formData.type === typeName) setFormData(prev => ({ ...prev, type: '' }));
    }
  };

  const handleAddBrand = async () => {
    const name = validateAndSanitize(newBrandName, '廠牌名稱');
    if (!name) return;
    const res = await window.electronAPI.namedQuery('insertDeviceBrand', ['辦公耗材', name]);
    if (res.success) {
      setFormData({ ...formData, brand: name });
      await fetchBrands();
      setNewBrandName('');
      setShowAddBrand(false);
    }
  };

  const handleAddModel = async () => {
    const name = validateAndSanitize(newModelName, '型號名稱');
    if (!name || !formData.brand || !formData.type) return;
    const res = await window.electronAPI.namedQuery('insertDeviceModel', [formData.brand, formData.type, '辦公耗材', name]);
    if (res.success) {
      if (res.rowCount === 0) return alert('失敗：關聯錯誤');
      setFormData(prev => ({ ...prev, model: name }));
      await fetchModels(formData.brand, formData.type);
      setNewModelName('');
      setShowAddModel(false);
    }
  };

  const handleDeleteModel = async (modelName) => {
    if (!confirm(`確定要刪除「${modelName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceModel', [modelName, formData.brand, formData.type, '辦公耗材']);
    if (res.success) {
      await fetchModels(formData.brand, formData.type);
      if (formData.model === modelName) setFormData(prev => ({ ...prev, model: '' }));
    }
  };

  const handleAddUnit = async () => {
    const name = validateAndSanitize(newUnitName, '單位名稱');
    if (!name) return;
    const updatedUnits = [...new Set([...units, name])];
    const res = await window.electronAPI.namedQuery('upsertSystemSetting', ['unified_units', updatedUnits]);
    if (res.success) {
      setUnits(updatedUnits);
      setFormData(prev => ({ ...prev, unit: name }));
      setNewUnitName('');
      setShowAddUnit(false);
    }
  };

  const handleDeleteUnit = async (unitName) => {
    if (!confirm(`確定要刪除單位「${unitName}」嗎？`)) return;
    const updatedUnits = units.filter(u => u !== unitName);
    const res = await window.electronAPI.namedQuery('upsertSystemSetting', ['unified_units', updatedUnits]);
    if (res.success) {
      setUnits(updatedUnits);
      if (formData.unit === unitName) setFormData(prev => ({ ...prev, unit: updatedUnits[0] || '' }));
    }
  };

  const handleDeleteBrand = async (brandName) => {
    if (!confirm(`確定要刪除「${brandName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceBrand', [brandName, '辦公耗材']);
    if (res.success) {
      await fetchBrands();
      if (formData.brand === brandName) setFormData(prev => ({ ...prev, brand: '' }));
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
    if (!formData.type || !formData.brand || !formData.model) return alert('請填寫必填欄位 (廠牌、類型、型號為必填)');
    
    const res = await window.electronAPI.namedQuery('insertConsumableMaster', [
      formData.spec || '', 
      formData.type, 
      formData.brand, 
      formData.model, 
      formData.unit, 
      Number(formData.safety_stock || 0), 
      Number(formData.stock_qty || 0), 
      '辦公耗材'
    ]);
    
    if (res.success) {
      alert('耗材建檔成功！');
      fetchConsumables();
      // 重置欄位，保留廠牌/類型/單位，方便連續建檔
      setFormData(prev => ({ 
        ...prev, 
        model: '', 
        spec: '', 
        stock_qty: 0 
      }));
      setFormKey(prev => prev + 1);
    } else {
      // 遵循規範 2：避免直接輸出系統預設錯誤訊息或除錯日誌
      console.error('Registration Error:', res.error);
      alert('⚠️ 儲存失敗：請確認輸入格式無誤，或聯繫技術人員。');
    }
  };

  // Styles
  const containerStyle = { padding: '24px', backgroundColor: '#f1f5f9', minHeight: '100vh', display: 'flex', gap: '24px' };
  const leftSectionStyle = { flex: '0 0 60%' };
  const rightSectionStyle = { flex: '0 0 40%' };
  const cardStyle = { backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '24px' };
  const labelStyle = { display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' };
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' };
  const iconButtonStyle = { padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer' };
  const manageItemStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', fontSize: '13px', borderBottom: '1px solid #f1f5f9' };

  return (
    <div style={containerStyle}>
      <div style={leftSectionStyle}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={24} color="#2563eb" /> 耗材建檔 (Consumables Registration)
          </h2>

          <div key={formKey} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div>
                <label style={labelStyle}>廠牌 (Brand) <span style={{ color: '#ef4444' }}>*</span></label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select name="brand" value={formData.brand} onChange={handleChange} style={inputStyle}>
                    <option value="">請選擇</option>
                    {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                  <button onClick={() => setShowAddBrand(!showAddBrand)} style={iconButtonStyle}><Plus size={18} /></button>
                  <button onClick={() => setShowManageBrand(!showManageBrand)} style={iconButtonStyle}><Settings2 size={18} /></button>
                </div>
                {showAddBrand && <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}><input type="text" value={newBrandName} onChange={e => setNewBrandName(e.target.value)} style={inputStyle} /><button onClick={handleAddBrand} style={{ ...iconButtonStyle, background: '#2563eb', color: '#fff' }}><Plus size={18}/></button></div>}
                {showManageBrand && <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>{brands.map(b => ( <div key={b.id} style={manageItemStyle}><span>{b.name}</span><Trash2 size={14} color="#ef4444" style={{ cursor: 'pointer' }} onClick={() => handleDeleteBrand(b.name)} /></div> ))}</div>}
              </div>

              <div>
                <label style={labelStyle}>類型 (Type) <span style={{ color: '#ef4444' }}>*</span></label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select name="type" value={formData.type} onChange={handleChange} style={inputStyle}>
                    {types.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button onClick={() => setShowAddType(!showAddType)} style={iconButtonStyle}><Plus size={18} /></button>
                  <button onClick={() => setShowManageType(!showManageType)} style={iconButtonStyle}><Settings2 size={18} /></button>
                </div>
                {showAddType && <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}><input type="text" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} style={inputStyle} /><button onClick={handleAddType} style={{ ...iconButtonStyle, background: '#2563eb', color: '#fff' }}><Plus size={18}/></button></div>}
                {showManageType && <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>{types.map(t => ( <div key={t} style={manageItemStyle}><span>{t}</span><Trash2 size={14} color="#ef4444" style={{ cursor: 'pointer' }} onClick={() => handleDeleteType(t)} /></div> ))}</div>}
              </div>

              <div>
                <label style={labelStyle}>型號 (Model) <span style={{ color: '#ef4444' }}>*</span></label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select name="model" value={formData.model} onChange={handleChange} style={inputStyle}>
                    <option value="">請選擇型號</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button onClick={() => setShowAddModel(!showAddModel)} style={iconButtonStyle}><Plus size={18} /></button>
                  <button onClick={() => setShowManageModel(!showManageModel)} style={iconButtonStyle}><Settings2 size={18} /></button>
                </div>
                {showAddModel && <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}><input type="text" value={newModelName} onChange={e => setNewModelName(e.target.value)} style={inputStyle} /><button onClick={handleAddModel} style={{ ...iconButtonStyle, background: '#2563eb', color: '#fff' }}><Plus size={18}/></button></div>}
                {showManageModel && <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>{models.map(m => ( <div key={m} style={manageItemStyle}><span>{m}</span><Trash2 size={14} color="#ef4444" style={{ cursor: 'pointer' }} onClick={() => handleDeleteModel(m)} /></div> ))}</div>}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '16px' }}>
              <div><label style={labelStyle}>規格內容 (Specification)</label><input type="text" name="spec" value={formData.spec} onChange={handleChange} style={inputStyle} placeholder="請輸入詳細規格..." /></div>
              <div><label style={labelStyle}>初始庫存數量 (Initial Stock)</label><input type="number" name="stock_qty" value={formData.stock_qty} onChange={handleChange} style={inputStyle} placeholder="0" /></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div>
                <label style={labelStyle}>單位 (Unit)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select name="unit" value={formData.unit} onChange={handleChange} style={inputStyle}>
                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <button onClick={() => setShowAddUnit(!showAddUnit)} style={iconButtonStyle}><Plus size={18} /></button>
                  <button onClick={() => setShowManageUnit(!showManageUnit)} style={iconButtonStyle}><Settings2 size={18} /></button>
                </div>
                {showAddUnit && <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}><input type="text" value={newUnitName} onChange={e => setNewUnitName(e.target.value)} style={inputStyle} /><button onClick={handleAddUnit} style={{ ...iconButtonStyle, background: '#2563eb', color: '#fff' }}><Plus size={18}/></button></div>}
                {showManageUnit && <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>{units.map(u => ( <div key={u} style={manageItemStyle}><span>{u}</span><Trash2 size={14} color="#ef4444" style={{ cursor: 'pointer' }} onClick={() => handleDeleteUnit(u)} /></div> ))}</div>}
              </div>
              <div>
                <label style={labelStyle}>安全庫存 (Safety Stock)</label>
                <input type="number" name="safety_stock" value={formData.safety_stock} onChange={handleChange} style={inputStyle} />
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <button onClick={handleAddConsumable} style={{ ...inputStyle, width: 'auto', backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '12px 36px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Save size={18} /> 儲存耗材資料
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Section: Recent 10 Items */}
      <div style={rightSectionStyle}>
        <div style={cardStyle}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: '#475569' }}>
            <Clock size={18} /> 最新 10 筆建檔記錄
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map(item => (
              <div key={item.id} style={{ padding: '16px', borderRadius: '12px', border: '1px solid #f1f5f9', backgroundColor: '#fafafa' }}>
                <div style={{ fontWeight: '800', color: '#2563eb', fontSize: '14px', marginBottom: '4px' }}>
                  {item.brand} - {item.model}
                </div>
                <div style={{ color: '#334155', fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>
                  {item.specification.replace(`${item.type} ${item.brand}`, '').trim().replace(/^\(|\)$/g, '') || '通用規格'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#94a3b8' }}>
                  <span style={{ backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '6px' }}>{item.type}</span>
                  <span>單位: {item.unit} | 警報: {item.safety_stock}</span>
                </div>
              </div>
            ))}
            {items.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px', fontSize: '13px' }}>尚無建檔資料</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Consumables;
