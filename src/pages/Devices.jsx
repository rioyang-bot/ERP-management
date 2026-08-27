import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Save, Settings2, Trash2, X, Monitor, Clock, User, MapPin, ListFilter, Layers, Server, FileSpreadsheet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logCreate } from '../utils/auditLogger';
import DeviceBatchImportModal from '../components/DeviceBatchImportModal';

const Devices = ({ isSplitMode = false }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [types, setTypes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showBatchImport, setShowBatchImport] = useState(false);
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
  const [projects, setProjects] = useState([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [formData, setFormData] = useState({
    type: '', brand: '', model: '', sn: '', specification: '', client: '',
    hostname: '', location: '', installed_date: '',
    customer_warranty_expire: '', system_date: '', warranty_expire: '',
    os: '', nic: '', custom_attributes: {}, ownership: 'FOR_SALE',
    contact_person: '', contact_phone: '', project_name: ''
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
    if (res.success) setCustomers(res.rows);
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

  const fetchProjects = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchActiveProjects');
    if (res.success) setProjects(res.rows || []);
  }, []);

  useEffect(() => {
    const initData = async () => {
      await Promise.all([
        fetchAssets(),
        fetchCustomers(),
        fetchSettings(),
        fetchBrands(),
        fetchProjects()
      ]);
    };
    initData();
  }, [fetchAssets, fetchCustomers, fetchSettings, fetchBrands, fetchProjects]);

  const handleAddType = async () => {
    const name = validateAndSanitize(newTypeName, '類型名稱');
    if (!name || !formData.brand) return;
    const res = await window.electronAPI.namedQuery('insertDeviceType', ['設備', formData.brand, name]);
    if (res.success) {
      setFormData(prev => ({ ...prev, type: name }));
      await fetchTypes(formData.brand, name);
      setNewTypeName(''); setShowAddType(false);
    }
  };

  const handleDeleteType = async (typeName) => {
    if (!confirm(`確定要刪除「${typeName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceType', [typeName, '設備', formData.brand]);
    if (res.success) {
      await fetchTypes(formData.brand, formData.type);
      if (formData.type === typeName) setFormData(prev => ({ ...prev, type: '' }));
    }
  };

  const handleAddModel = async () => {
    const name = validateAndSanitize(newModelName, '型號名稱');
    if (!name || !formData.brand || !formData.type) return;
    const res = await window.electronAPI.namedQuery('insertDeviceModel', [formData.brand, formData.type, '設備', name]);
    if (res.success) {
      if (res.rowCount === 0) return alert('失敗：關聯錯誤');
      setFormData(prev => ({ ...prev, model: name }));
      await fetchModels(formData.brand, formData.type);
      setNewModelName(''); setShowAddModel(false);
    }
  };

  const handleDeleteModel = async (modelName) => {
    if (!confirm(`確定要刪除「${modelName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceModel', [modelName, formData.brand, formData.type, '設備']);
    if (res.success) {
      await fetchModels(formData.brand, formData.type);
      if (formData.model === modelName) setFormData(prev => ({ ...prev, model: '' }));
    }
  };

  const handleAddBrand = async () => {
    const name = validateAndSanitize(newBrandName, '廠牌名稱');
    if (!name) return;
    const res = await window.electronAPI.namedQuery('insertDeviceBrand', ['設備', name]);
    if (res.success) {
      setFormData(prev => ({ ...prev, brand: name }));
      await fetchBrands(); await fetchTypes(name);
      setNewBrandName(''); setShowAddBrand(false);
    }
  };

  const handleDeleteBrand = async (brandName) => {
    if (!confirm(`確定要刪除「${brandName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceBrand', [brandName, '設備']);
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
    } else if (name === 'client') {
      const matches = customers.filter(c => c.name === value);
      if (matches.length === 1) {
        setFormData(prev => ({
          ...prev,
          client: value,
          contact_person: matches[0].contact || '',
          contact_phone: matches[0].phone || ''
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          client: value,
          contact_person: '',
          contact_phone: ''
        }));
      }
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
        const res = await window.electronAPI.namedQuery('insertItemMaster', [formData.specification || '', formData.type, formData.brand, formData.model, '台', '設備']);
        if (res.success) masterId = res.rows[0].id;
      }
      if (!masterId) throw new Error('建立物料主檔失敗');

      let successCount = 0;
      const updatedCustomAttributes = {
        ...formData.custom_attributes,
        contact_person: formData.contact_person || '',
        contact_phone: formData.contact_phone || '',
        project_name: formData.project_name || ''
      };
      for (const sn of snList) {
        const res = await window.electronAPI.namedQuery('insertAssetRecord', [
          masterId, sn || null, formData.client, formData.hostname, formData.location, formData.installed_date || null,
          formData.customer_warranty_expire || null, formData.system_date || null, formData.warranty_expire || null,
          formData.os, formData.nic, updatedCustomAttributes, formData.ownership || 'FOR_SALE'
        ]);
        if (res.success) successCount++;
      }

      if (successCount > 0) {
        logCreate(
          'DEVICE',
          isBulkMode ? `批次 ${snList.length} 台` : (formData.sn || '無序號'),
          `${formData.brand} ${formData.model}`,
          `新增設備 [${formData.brand} ${formData.model}] ${isBulkMode ? `批次建立 ${successCount} 筆` : `序號: ${formData.sn || '未指定'}`}`,
          { isBulkMode, count: successCount, brand: formData.brand, type: formData.type, model: formData.model, snList: isBulkMode ? snList : [formData.sn], client: formData.client, location: formData.location }
        );
      }

      alert(isBulkMode ? `批次建檔完成！成功建立 ${successCount} 筆設備紀錄。` : '設備建檔成功！');
      fetchAssets();
      setFormData({
        sn: '', specification: '', type: '', brand: brands[0]?.name || '', model: '', client: '',
        hostname: '', location: '', installed_date: '', customer_warranty_expire: '', system_date: '', warranty_expire: '',
        os: '', nic: '', custom_attributes: {},
        contact_person: '', contact_phone: '', project_name: ''
      });
      if (isBulkMode) setBulkSns('');
      setFormKey(prev => prev + 1);
    } catch (err) {
      alert('建檔失敗: ' + err.message);
    }
  };

  // Styles
  const containerStyle = { padding: '24px', backgroundColor: 'var(--bg-app)', minHeight: '100vh', display: 'flex', flexDirection: isSplitMode ? 'column' : 'row', gap: '24px' };
  const leftSectionStyle = isSplitMode ? { width: '100%' } : { flex: '0 0 60%' };
  const rightSectionStyle = isSplitMode ? { width: '100%' } : { flex: '1' };
  const cardStyle = { backgroundColor: 'var(--bg-surface)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', marginBottom: '24px', color: 'var(--text-main)' };
  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '8px' };
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '14px', boxSizing: 'border-box', outline: 'none' };
  const iconButtonStyle = { padding: '8px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', cursor: 'pointer' };
  const manageItemStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', fontSize: '13px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)' };
  const modeBtnStyle = (active) => ({
    flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
    backgroundColor: active ? 'var(--primary-color)' : 'var(--bg-surface-subtle)',
    color: active ? '#fff' : 'var(--text-muted)',
    fontWeight: '700', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
  });

  return (
    <div style={containerStyle}>
      <div style={leftSectionStyle}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
                <Monitor size={26} color="var(--primary-color)" /> 設備建檔 (Device Registration)
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>新增具備獨立序號配置的主硬體設備，並提供序號追蹤管理。</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowBatchImport(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)',
                  transition: 'all 0.2s'
                }}
                title="上傳 Excel/CSV 檔案進行設備批次建檔"
              >
                <FileSpreadsheet size={16} /> 批次匯入 (Excel/CSV)
              </button>
              {!isSplitMode && (
                <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <button style={{ padding: '6px 14px', backgroundColor: 'var(--bg-surface)', color: 'var(--primary-color)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '800', boxShadow: 'var(--card-shadow)', cursor: 'default' }}>
                    📝 建檔
                  </button>
                  <button onClick={() => navigate('/device-split')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
                    ◫ 雙開
                  </button>
                  <button onClick={() => navigate('/device-list')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
                    📋 清單
                  </button>
                </div>
              )}
            </div>
          </div>
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
                {showAddBrand && <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}><input type="text" value={newBrandName} onChange={e => setNewBrandName(e.target.value)} style={inputStyle} /><button onClick={handleAddBrand} style={{ ...iconButtonStyle, background: '#2563eb', color: '#fff' }}><Plus size={18} /></button></div>}
                {showManageBrand && <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>{brands.map(b => (<div key={b.id} style={manageItemStyle}><span>{b.name}</span><Trash2 size={14} color="#ef4444" style={{ cursor: 'pointer' }} onClick={() => handleDeleteBrand(b.name)} /></div>))}</div>}
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
                {showAddType && <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}><input type="text" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} style={inputStyle} /><button onClick={handleAddType} style={{ ...iconButtonStyle, background: '#2563eb', color: '#fff' }}><Plus size={18} /></button></div>}
                {showManageType && <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>{types.map(t => (<div key={t} style={manageItemStyle}><span>{t}</span><Trash2 size={14} color="#ef4444" style={{ cursor: 'pointer' }} onClick={() => handleDeleteType(t)} /></div>))}</div>}
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
                {showAddModel && <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}><input type="text" value={newModelName} onChange={e => setNewModelName(e.target.value)} style={inputStyle} /><button onClick={handleAddModel} style={{ ...iconButtonStyle, background: '#2563eb', color: '#fff' }}><Plus size={18} /></button></div>}
                {showManageModel && <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>{models.map(m => (<div key={m} style={manageItemStyle}><span>{m}</span><Trash2 size={14} color="#ef4444" style={{ cursor: 'pointer' }} onClick={() => handleDeleteModel(m)} /></div>))}</div>}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.5fr) 1fr 1fr', gap: '16px' }}>
              <div><label style={labelStyle}>規格 (Specification)</label><input type="text" name="specification" value={formData.specification} onChange={handleChange} style={inputStyle} placeholder="例如: 伺服器主機規格" /></div>
              <div>
                <label style={labelStyle}>資產歸屬</label>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, ownership: 'FOR_SALE' }))} style={modeBtnStyle(formData.ownership === 'FOR_SALE')}>一般銷售</button>
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, ownership: 'COMPANY' }))} style={modeBtnStyle(formData.ownership === 'COMPANY')}>公司資產</button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>建檔模式</label>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <button type="button" onClick={() => setIsBulkMode(false)} style={modeBtnStyle(!isBulkMode)}><ListFilter size={14} /> 單筆</button>
                  <button type="button" onClick={() => setIsBulkMode(true)} style={modeBtnStyle(isBulkMode)}><Layers size={14} /> 多筆</button>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', alignItems: 'start' }}>
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
                {isBulkMode && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>已偵測: <b>{bulkSns.split('\n').filter(s => s.trim()).length}</b> 個序號</div>}
              </div>
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>專案名稱 (Project)</label>
                <input 
                  type="text" 
                  name="project_name" 
                  value={formData.project_name || ''} 
                  onChange={handleChange} 
                  onFocus={() => setShowProjectDropdown(true)}
                  onBlur={() => {
                    setTimeout(() => setShowProjectDropdown(false), 250);
                  }}
                  style={inputStyle} 
                  placeholder="輸入關鍵字搜尋專案代號或名稱" 
                  autoComplete="off"
                />
                {showProjectDropdown && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, 
                    backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', 
                    borderRadius: '8px', marginTop: '4px', maxHeight: '200px', 
                    overflowY: 'auto', zIndex: 50, boxShadow: 'var(--modal-shadow)'
                  }}>
                    {(() => {
                      const searchStr = (formData.project_name || '').toLowerCase().trim();
                      const matches = projects.filter(p => 
                        !searchStr ||
                        (p.project_no || '').toLowerCase().includes(searchStr) || 
                        (p.project_name || '').toLowerCase().includes(searchStr)
                      );
                      if (matches.length === 0) {
                        return <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '12px' }}>無符合專案（可直接輸入自訂名稱）</div>;
                      }
                      return matches.map(p => (
                        <div 
                          key={p.project_no || p.id}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: '13px' }}
                          onMouseDown={() => {
                            setFormData(prev => ({ ...prev, project_name: p.project_name }));
                            setShowProjectDropdown(false);
                          }}
                        >
                          <div style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{p.project_no}</span>
                            {p.client_name && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal' }}>{p.client_name}</span>}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>{p.project_name}</div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div>
                <label htmlFor="client-select" style={labelStyle}>客戶名稱 (Customer)</label>
                <select id="client-select" name="client" value={formData.client} onChange={handleChange} style={inputStyle}>
                  <option value="">請選擇</option>
                  {Array.from(new Set(customers.map(c => c.name))).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="contact-select" style={labelStyle}>聯絡人 (Contact Person)</label>
                {(() => {
                  const matches = customers.filter(c => c.name === formData.client);
                  if (matches.length > 1) {
                    return (
                      <select
                        id="contact-select"
                        name="contact_person"
                        value={formData.contact_person}
                        onChange={(e) => {
                          const contactVal = e.target.value;
                          const found = matches.find(m => m.contact === contactVal);
                          setFormData(prev => ({
                            ...prev,
                            contact_person: contactVal,
                            contact_phone: found ? (found.phone || '') : ''
                          }));
                        }}
                        style={inputStyle}
                      >
                        <option value="">請選擇聯絡人</option>
                        {matches.map((m, idx) => (
                          <option key={idx} value={m.contact || ''}>
                            {m.contact || '無姓名'} ({m.phone || '無電話'})
                          </option>
                        ))}
                      </select>
                    );
                  } else {
                    return (
                      <input
                        id="contact-select"
                        type="text"
                        name="contact_person"
                        value={formData.contact_person}
                        onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
                        placeholder="聯絡人姓名"
                        style={inputStyle}
                      />
                    );
                  }
                })()}
              </div>
              <div><label style={labelStyle}>放置位置 (Location)</label><input type="text" name="location" value={formData.location} onChange={handleChange} style={inputStyle} /></div>
            </div>

            {/* Custom attributes section if visible */}
            {customFieldDefs.filter(f => isFieldVisible(formData.brand, f.id)).length > 0 && (
              <div style={{ padding: '16px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {customFieldDefs
                    .filter(f => isFieldVisible(formData.brand, f.id))
                    .filter(f => !['sn', 'hostname', 'specification', 'client', 'location', 'installed_date', 'system_date', 'warranty_expire', 'customer_warranty_expire'].includes(f.id))
                    .map(f => (
                      <div key={f.id}><label style={labelStyle}>{f.label}</label><input type="text" value={f.isNative ? formData[f.id] : (formData.custom_attributes[f.id] || '')} onChange={e => { if (f.isNative) setFormData({ ...formData, [f.id]: e.target.value }); else setFormData({ ...formData, custom_attributes: { ...formData.custom_attributes, [f.id]: e.target.value } }); }} style={inputStyle} /></div>
                    ))}
                </div>
              </div>
            )}

            <div style={{ textAlign: 'right' }}><button onClick={handleAddAsset} style={{ ...inputStyle, width: '100%', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', padding: '14px', fontWeight: '900', cursor: 'pointer', borderRadius: '12px', fontSize: '16px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}><Save size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} /> {isBulkMode ? `開始多筆建檔 (${bulkSns.split('\n').filter(s => s.trim()).length} 筆)` : '儲存設備資料'}</button></div>
          </div>
        </div>
      </div>

      <div style={rightSectionStyle}>
        <div style={cardStyle}>
          <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
            <Clock size={18} color="var(--text-muted)" /> 最新 10 筆建檔記錄
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map(item => (
              <div key={item.id} style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)' }}>
                <div style={{ fontWeight: '800', fontSize: '13px', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ color: 'var(--primary-color)' }}>{item.brand}</span>
                  <span style={{ color: 'var(--text-subtle)', margin: '0 4px' }}>/</span>
                  <span style={{ color: 'var(--text-muted)' }}>{item.type}</span>
                  <span style={{ color: 'var(--text-subtle)', margin: '0 4px' }}>/</span>
                  <span style={{ color: 'var(--text-main)' }}>{item.model}</span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: '500', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(item.specification || '').replace(`${item.type} ${item.brand}`, '').trim().replace(/^\(|\)$/g, '') || '--'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: '600' }}>SN: {item.sn || '無序號'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-subtle)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-main)' }}><User size={12} /> {item.client || '--'}</span>
                    {(item.partner_contact || item.partner_phone) && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '16px' }}>{item.partner_contact} {item.partner_phone}</span>
                    )}
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}><MapPin size={12} /> {item.location || '--'}</span>
                </div>
              </div>
            ))}
            {items.length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>尚無資料</div>}
          </div>
        </div>
      </div>

      <DeviceBatchImportModal
        isOpen={showBatchImport}
        onClose={() => setShowBatchImport(false)}
        onSuccess={async () => {
          await fetchAssets();
          await fetchBrands();
          if (formData.brand) {
            const { nextType } = await fetchTypes(formData.brand, formData.type);
            if (nextType) await fetchModels(formData.brand, nextType);
          }
          window.dispatchEvent(new CustomEvent('db-update'));
        }}
        existingBrands={brands}
      />
    </div>
  );
};

export default Devices;
