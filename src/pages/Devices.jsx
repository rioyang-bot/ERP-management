import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Save, Settings2, Trash2, X, Monitor, Clock, User, MapPin, ListFilter, Layers } from 'lucide-react';

const Devices = () => {
  const [items, setItems] = useState([]);
  const [types, setTypes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [customers, setCustomers] = useState([]);
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
  const [formData, setFormData] = useState({ 
    type: '', brand: '', model: '', sn: '', specification: '', client: '', 
    hostname: '', location: '', installed_date: '', 
    customer_warranty_expire: '', system_date: '', warranty_expire: '',
    os: '', nic: '', custom_attributes: {}
  });
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkSns, setBulkSns] = useState('');
  const [brandFieldConfigs, setBrandFieldConfigs] = useState({});
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const UNIFIED_UNITS = ['個', '台', '盒', '包', '支', '組', '瓶', '卷', '張', '份'];
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

  const fetchAssets = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchRecentAssets');
    if (res.success) setItems(res.rows);
  }, []);

  const fetchModels = useCallback(async (brandName, typeName) => {
    if (!brandName || !typeName) { setModels([]); return { modelNames: [] }; }
    const res = await window.electronAPI.namedQuery('fetchModelsByBrandType', [brandName, typeName]);
    if (res.success) {
      const modelNames = res.rows.map(r => r.name);
      setModels(modelNames);
      setFormData(prev => ({ ...prev, model: modelNames.includes(prev.model) ? prev.model : (modelNames[0] || '') }));
      return { modelNames };
    }
    return { modelNames: [] };
  }, []);

  const fetchTypes = useCallback(async (brandName, currentType = '') => {
    if (!brandName) { setTypes([]); return { typeNames: [], nextType: '' }; }
    const res = await window.electronAPI.namedQuery('fetchTypesByBrand', [brandName]);
    if (res.success) {
      const typeNames = res.rows.map(r => r.name);
      setTypes(typeNames);
      const nextType = typeNames.includes(currentType) ? currentType : (typeNames[0] || '');
      setFormData(prev => ({ ...prev, type: nextType }));
      return { typeNames, nextType };
    }
    return { typeNames: [], nextType: '' };
  }, []);

  const fetchBrands = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchDeviceBrands');
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

  const fetchCustomers = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchCustomers');
    if (res.success) setCustomers(res.rows.map(r => r.name));
  }, []);

  const fetchSettings = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('getSystemSetting', ['brandFieldConfigs']);
    if (res.success && res.rows.length > 0) setBrandFieldConfigs(res.rows[0].value || {});
    const defsRes = await window.electronAPI.namedQuery('getSystemSetting', ['customFieldDefinitions']);
    if (defsRes.success && defsRes.rows.length > 0) setCustomFieldDefs(defsRes.rows[0].value || []);
  }, []);

  const isFieldVisible = (brand, fieldName) => {
    if (!brand) return true;
    const config = brandFieldConfigs[brand] || {};
    return config[fieldName] !== undefined ? config[fieldName] : true;
  };

  useEffect(() => {
    const initData = async () => {
      await Promise.all([
        fetchAssets(),
        fetchCustomers(),
        fetchSettings(),
        fetchBrands()
      ]);
    };
    initData();
  }, [fetchAssets, fetchCustomers, fetchSettings, fetchBrands]);

  const handleAddType = async () => {
    const name = validateAndSanitize(newTypeName, '類型名稱');
    if (!name || !formData.brand) return;
    const res = await window.electronAPI.namedQuery('insertDeviceType', ['資訊設備', formData.brand, name]);
    if (res.success) {
      setFormData(prev => ({ ...prev, type: name }));
      await fetchTypes(formData.brand, name);
      setNewTypeName(''); setShowAddType(false);
    }
  };

  const handleDeleteType = async (typeName) => {
    if (!confirm(`確定要刪除「${typeName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceType', [typeName, '資訊設備', formData.brand]);
    if (res.success) {
      await fetchTypes(formData.brand, formData.type);
      if (formData.type === typeName) setFormData(prev => ({ ...prev, type: '' }));
    }
  };

  const handleAddModel = async () => {
    const name = validateAndSanitize(newModelName, '型號名稱');
    if (!name || !formData.brand || !formData.type) return;
    const res = await window.electronAPI.namedQuery('insertDeviceModel', [formData.brand, formData.type, '資訊設備', name]);
    if (res.success) {
      if (res.rowCount === 0) return alert('失敗：關聯錯誤');
      setFormData(prev => ({ ...prev, model: name }));
      await fetchModels(formData.brand, formData.type);
      setNewModelName(''); setShowAddModel(false);
    }
  };

  const handleDeleteModel = async (modelName) => {
    if (!confirm(`確定要刪除「${modelName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceModel', [modelName, formData.brand, formData.type, '資訊設備']);
    if (res.success) {
      await fetchModels(formData.brand, formData.type);
      if (formData.model === modelName) setFormData(prev => ({ ...prev, model: '' }));
    }
  };

  const handleAddBrand = async () => {
    const name = validateAndSanitize(newBrandName, '廠牌名稱');
    if (!name) return;
    const res = await window.electronAPI.namedQuery('insertDeviceBrand', ['資訊設備', name]);
    if (res.success) {
      setFormData(prev => ({ ...prev, brand: name }));
      await fetchBrands(); await fetchTypes(name);
      setNewBrandName(''); setShowAddBrand(false);
    }
  };

  const handleDeleteBrand = async (brandName) => {
    if (!confirm(`確定要刪除「${brandName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceBrand', [brandName, '資訊設備']);
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

  const handleAddAsset = async () => {
    if (!formData.brand || !formData.type) return alert('請填寫必填欄位 (廠牌與類型)');
    
    // 解析序號清單
    let snList = [];
    if (isBulkMode) {
      snList = bulkSns.split('\n').map(s => s.trim()).filter(s => s !== '');
      if (snList.length === 0) return alert('請輸入至少一個序號');
      if (new Set(snList).size !== snList.length) {
        if (!confirm('偵測到重複的序號，是否要繼續（重複的紀錄會被分別建立）？')) return;
      }
    } else {
      snList = [formData.sn.trim()];
    }

    try {
      let masterId;
      const findRes = await window.electronAPI.namedQuery('findItemMaster', [formData.specification || '', formData.type, formData.brand, formData.model]);
      if (findRes.success && findRes.rows.length > 0) {
        masterId = findRes.rows[0].id;
      } else {
        const res = await window.electronAPI.namedQuery('insertItemMaster', [formData.specification || '', formData.type, formData.brand, formData.model, '台', '資訊設備']);
        if (res.success) masterId = res.rows[0].id;
      }
      if (!masterId) throw new Error('建立物料主檔失敗');

      let successCount = 0;
      for (const sn of snList) {
        const res = await window.electronAPI.namedQuery('insertAssetRecord', [
            masterId, sn || null, formData.client, formData.hostname, formData.location, formData.installed_date || null,
            formData.customer_warranty_expire || null, formData.system_date || null, formData.warranty_expire || null,
            formData.os, formData.nic, formData.custom_attributes
        ]);
        if (res.success) successCount++;
      }

      alert(isBulkMode ? `批次建檔完成！成功建立 ${successCount} 筆設備紀錄。` : '設備建檔成功！');
      fetchAssets();
      setFormData({ 
        sn: '', specification: '', type: '', brand: brands[0]?.name || '', model: '', client: '', 
        hostname: '', location: '', installed_date: '', customer_warranty_expire: '', system_date: '', warranty_expire: '',
        os: '', nic: '', custom_attributes: {}
      });
      if (isBulkMode) setBulkSns('');
      setFormKey(prev => prev + 1);
    } catch (err) {
      alert('建檔失敗: ' + err.message);
    }
  };

  // Styles
  const containerStyle = { padding: '24px', backgroundColor: '#f1f5f9', minHeight: '100vh', display: 'flex', gap: '24px' };
  const leftSectionStyle = { flex: '0 0 60%' };
  const rightSectionStyle = { flex: '0 0 40%' };
  const cardStyle = { backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '24px' };
  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' };
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box', outline: 'none' };
  const iconButtonStyle = { padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer' };
  const manageItemStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', fontSize: '13px', borderBottom: '1px solid #f1f5f9' };
  const modeBtnStyle = (active) => ({
    flex: 1, padding: '10px', borderRadius: '8px', border: 'none', 
    backgroundColor: active ? '#2563eb' : '#f1f5f9', 
    color: active ? '#fff' : '#475569',
    fontWeight: '700', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
  });

  return (
    <div style={containerStyle}>
      <div style={leftSectionStyle}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Monitor size={24} color="#2563eb" /> 設備建檔 (Device Registration)
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
                    <option value="">請選擇</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button onClick={() => setShowAddModel(!showAddModel)} style={iconButtonStyle}><Plus size={18} /></button>
                  <button onClick={() => setShowManageModel(!showManageModel)} style={iconButtonStyle}><Settings2 size={18} /></button>
                </div>
                {showAddModel && <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}><input type="text" value={newModelName} onChange={e => setNewModelName(e.target.value)} style={inputStyle} /><button onClick={handleAddModel} style={{ ...iconButtonStyle, background: '#2563eb', color: '#fff' }}><Plus size={18}/></button></div>}
                {showManageModel && <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>{models.map(m => ( <div key={m} style={manageItemStyle}><span>{m}</span><Trash2 size={14} color="#ef4444" style={{ cursor: 'pointer' }} onClick={() => handleDeleteModel(m)} /></div> ))}</div>}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.5fr) 1fr', gap: '16px' }}>
              <div><label style={labelStyle}>規格 (Specification)</label><input type="text" name="specification" value={formData.specification} onChange={handleChange} style={inputStyle} /></div>
              <div>
                <label style={labelStyle}>建檔模式</label>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                   <button type="button" onClick={() => setIsBulkMode(false)} style={modeBtnStyle(!isBulkMode)}><ListFilter size={14}/> 單筆</button>
                   <button type="button" onClick={() => setIsBulkMode(true)} style={modeBtnStyle(isBulkMode)}><Layers size={14}/> 多筆</button>
                </div>
              </div>
            </div>

            <div>
              <label style={labelStyle}>
                {isBulkMode ? (
                  <>設備序號清單 (每行一個序號) <span style={{ color: "#ef4444" }}>*</span></>
                ) : (
                  '設備序號 / SN'
                )}
              </label>
              {isBulkMode ? (
                <textarea 
                  value={bulkSns} 
                  onChange={e => setBulkSns(e.target.value)} 
                  style={{ ...inputStyle, minHeight: '120px', fontFamily: 'monospace' }} 
                  placeholder="請在此處貼上多個序號..."
                />
              ) : (
                <input type="text" name="sn" value={formData.sn} onChange={handleChange} style={inputStyle} placeholder="請輸入設備序號" />
              )}
              {isBulkMode && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>已偵測: <b>{bulkSns.split('\n').filter(s => s.trim()).length}</b> 個序號</div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div><label style={labelStyle}>客戶名稱 (Customer)</label><select name="client" value={formData.client} onChange={handleChange} style={inputStyle}><option value="">請選擇</option>{customers.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label style={labelStyle}>放置位置 (Location)</label><input type="text" name="location" value={formData.location} onChange={handleChange} style={inputStyle} /></div>
            </div>

            {/* Custom attributes section if visible... simplified for space */}
            {customFieldDefs.filter(f => isFieldVisible(formData.brand, f.id)).length > 0 && (
              <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {customFieldDefs.filter(f => isFieldVisible(formData.brand, f.id)).map(f => (
                    <div key={f.id}><label style={labelStyle}>{f.label}</label><input type="text" value={f.isNative ? formData[f.id] : (formData.custom_attributes[f.id] || '')} onChange={e => { if (f.isNative) setFormData({...formData, [f.id]:e.target.value}); else setFormData({...formData, custom_attributes:{...formData.custom_attributes, [f.id]:e.target.value}}); }} style={inputStyle} /></div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ textAlign: 'right' }}><button onClick={handleAddAsset} style={{ ...inputStyle, width: '100%', backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '14px', fontWeight: '900', cursor: 'pointer', borderRadius: '12px', fontSize: '16px' }}><Save size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} /> {isBulkMode ? `開始多筆建檔 (${bulkSns.split('\n').filter(s => s.trim()).length} 筆)` : '儲存設備資料'}</button></div>
          </div>
        </div>
      </div>

      <div style={rightSectionStyle}>
        <div style={cardStyle}>
          <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: '#475569' }}>
            <Clock size={18} /> 最新 10 筆建檔記錄
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map(item => (
              <div key={item.id} style={{ padding: '16px', borderRadius: '12px', border: '1px solid #f1f5f9', backgroundColor: '#fafafa' }}>
                <div style={{ fontWeight: '800', color: '#2563eb', fontSize: '14px', marginBottom: '4px' }}>{item.brand} - {item.model}</div>
                <div style={{ fontSize: '13px', color: '#334155', fontWeight: '600', marginBottom: '6px' }}>SN: {item.sn || '無序號'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><User size={12}/> {item.client || '--'}</span>
                    {(item.partner_contact || item.partner_phone) && (
                      <span style={{ fontSize: '11px', color: '#64748b', paddingLeft: '16px' }}>{item.partner_contact} {item.partner_phone}</span>
                    )}
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12}/> {item.location || '--'}</span>
                </div>
              </div>
            ))}
            {items.length === 0 && <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>尚無資料</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Devices;
