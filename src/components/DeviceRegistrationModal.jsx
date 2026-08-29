import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Save, Settings2, Trash2, X, Monitor, User, MapPin, ListFilter, Server, FileSpreadsheet, Check } from 'lucide-react';
import { logCreate } from '../utils/auditLogger';
import DeviceBatchImportModal from './DeviceBatchImportModal';

const DeviceRegistrationModal = ({ isOpen, onClose, onSuccess }) => {
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
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const fetchProjects = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchActiveProjects');
    if (res.success) setProjects(res.rows || []);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
      fetchSettings();
      fetchBrands();
      fetchProjects();
    }
  }, [isOpen, fetchCustomers, fetchSettings, fetchBrands, fetchProjects]);

  if (!isOpen) return null;

  const isFieldVisible = (brand, fieldName) => {
    if (!brand) return true;
    const config = brandFieldConfigs[brand] || {};
    return config[fieldName] !== undefined ? config[fieldName] : true;
  };

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

  const handleSave = async (continueAdd = false) => {
    if (!formData.brand || !formData.type || !formData.model || !formData.specification?.trim()) {
      return alert('請填寫必填欄位 (廠牌、類型、型號、規格為必填)');
    }

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

    setIsSubmitting(true);
    try {
      let masterId;
      const findRes = await window.electronAPI.namedQuery('findItemMaster', [formData.specification.trim(), formData.type, formData.brand, formData.model]);
      if (findRes.success && findRes.rows.length > 0) {
        masterId = findRes.rows[0].id;
      } else {
        const res = await window.electronAPI.namedQuery('insertItemMaster', [formData.specification.trim(), formData.type, formData.brand, formData.model, '台', '設備']);
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

      if (onSuccess) onSuccess();

      if (continueAdd) {
        alert(isBulkMode ? `批次建檔完成！成功建立 ${successCount} 筆。請繼續新增下一筆。` : '設備建檔成功！請繼續輸入。');
        setFormData(prev => ({
          ...prev,
          sn: '',
          hostname: ''
        }));
        if (isBulkMode) setBulkSns('');
      } else {
        alert(isBulkMode ? `批次建檔完成！成功建立 ${successCount} 筆設備紀錄。` : '設備建檔成功！');
        onClose();
      }
    } catch (err) {
      alert('建檔失敗: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(5px)', padding: '20px' }}>
      <div style={{ backgroundColor: 'var(--bg-surface)', width: '100%', maxWidth: '950px', maxHeight: '92vh', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Modal Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
              <Monitor size={22} color="var(--primary-color)" /> 新增設備建檔 (Device Registration)
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>建立設備主檔、指派序號並登錄資產紀錄。</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setShowBatchImport(true)}
              style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            >
              <FileSpreadsheet size={16} /> 批次匯入
            </button>
            <button
              onClick={onClose}
              style={{ width: '36px', height: '36px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {/* 模式切換 */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px' }}>
            <button type="button" style={modeBtnStyle(!isBulkMode)} onClick={() => setIsBulkMode(false)}>
              單筆建檔模式
            </button>
            <button type="button" style={modeBtnStyle(isBulkMode)} onClick={() => setIsBulkMode(true)}>
              多筆連續建檔模式
            </button>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSave(false); }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
              {/* 廠牌 */}
              <div>
                <label style={labelStyle}>廠牌 (Brand) *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select name="brand" value={formData.brand} onChange={handleChange} style={inputStyle} required>
                    <option value="">選擇廠牌</option>
                    {brands.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowAddBrand(!showAddBrand)} style={iconButtonStyle} title="新增廠牌"><Plus size={16} /></button>
                  <button type="button" onClick={() => setShowManageBrand(!showManageBrand)} style={iconButtonStyle} title="管理廠牌"><Settings2 size={16} /></button>
                </div>
                {showAddBrand && (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <input placeholder="新廠牌名稱" value={newBrandName} onChange={e => setNewBrandName(e.target.value)} style={inputStyle} />
                    <button type="button" onClick={handleAddBrand} style={{ ...iconButtonStyle, backgroundColor: 'var(--primary-color)', color: '#fff' }}>儲存</button>
                  </div>
                )}
                {showManageBrand && (
                  <div style={{ marginTop: '8px', border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                    {brands.map(b => (
                      <div key={b.name} style={manageItemStyle}>
                        <span>{b.name}</span>
                        <Trash2 size={14} color="#ef4444" cursor="pointer" onClick={() => handleDeleteBrand(b.name)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 類型 */}
              <div>
                <label style={labelStyle}>類型 (Type) *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select name="type" value={formData.type} onChange={handleChange} style={inputStyle} required>
                    <option value="">選擇類型</option>
                    {types.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowAddType(!showAddType)} style={iconButtonStyle} title="新增類型"><Plus size={16} /></button>
                  <button type="button" onClick={() => setShowManageType(!showManageType)} style={iconButtonStyle} title="管理類型"><Settings2 size={16} /></button>
                </div>
                {showAddType && (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <input placeholder="新類型名稱" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} style={inputStyle} />
                    <button type="button" onClick={handleAddType} style={{ ...iconButtonStyle, backgroundColor: 'var(--primary-color)', color: '#fff' }}>儲存</button>
                  </div>
                )}
                {showManageType && (
                  <div style={{ marginTop: '8px', border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                    {types.map(t => (
                      <div key={t} style={manageItemStyle}>
                        <span>{t}</span>
                        <Trash2 size={14} color="#ef4444" cursor="pointer" onClick={() => handleDeleteType(t)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 型號 */}
              <div>
                <label style={labelStyle}>型號 (Model) *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select name="model" value={formData.model} onChange={handleChange} style={inputStyle} required>
                    <option value="">選擇型號</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowAddModel(!showAddModel)} style={iconButtonStyle} title="新增型號"><Plus size={16} /></button>
                  <button type="button" onClick={() => setShowManageModel(!showManageModel)} style={iconButtonStyle} title="管理型號"><Settings2 size={16} /></button>
                </div>
                {showAddModel && (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <input placeholder="新型號名稱" value={newModelName} onChange={e => setNewModelName(e.target.value)} style={inputStyle} />
                    <button type="button" onClick={handleAddModel} style={{ ...iconButtonStyle, backgroundColor: 'var(--primary-color)', color: '#fff' }}>儲存</button>
                  </div>
                )}
                {showManageModel && (
                  <div style={{ marginTop: '8px', border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                    {models.map(m => (
                      <div key={m} style={manageItemStyle}>
                        <span>{m}</span>
                        <Trash2 size={14} color="#ef4444" cursor="pointer" onClick={() => handleDeleteModel(m)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 規格 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>規格 (Specification) * <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(必填)</span></label>
              <textarea name="specification" value={formData.specification} onChange={handleChange} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} placeholder="請輸入硬體核心規格與配置..." required />
            </div>

            {/* 序號輸入區 */}
            {!isBulkMode ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>序號 (S/N)</label>
                  <input name="sn" value={formData.sn} onChange={handleChange} style={inputStyle} placeholder="請輸入或掃描序號" />
                </div>
                <div>
                  <label style={labelStyle}>主機名稱 (Hostname)</label>
                  <input name="hostname" value={formData.hostname} onChange={handleChange} style={inputStyle} placeholder="可選填主機名稱" />
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>批次序號清單 (每行一個序號) *</label>
                <textarea rows={4} value={bulkSns} onChange={e => setBulkSns(e.target.value)} placeholder="SN001&#10;SN002&#10;SN003" style={{ ...inputStyle, fontFamily: 'monospace' }} />
              </div>
            )}

            {/* 客戶與聯絡資訊 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>客戶名稱 (Customer)</label>
                <select name="client" value={formData.client} onChange={handleChange} style={inputStyle}>
                  <option value="">選擇客戶 (未指定)</option>
                  {Array.from(new Set(customers.map(c => c.name))).map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>聯絡人 (Contact)</label>
                {formData.client && customers.filter(c => c.name === formData.client).length > 1 ? (
                  <select
                    name="contact_person"
                    value={formData.contact_person || ''}
                    onChange={(e) => {
                      const selectedContact = e.target.value;
                      const matched = customers.find(c => c.name === formData.client && c.contact === selectedContact);
                      setFormData(prev => ({
                        ...prev,
                        contact_person: selectedContact,
                        contact_phone: matched ? (matched.phone || '') : prev.contact_phone
                      }));
                    }}
                    style={inputStyle}
                  >
                    <option value="">選擇聯絡人...</option>
                    {customers.filter(c => c.name === formData.client).map(c => (
                      <option key={c.id} value={c.contact}>{c.contact} {c.phone ? `(${c.phone})` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input name="contact_person" value={formData.contact_person || ''} onChange={handleChange} style={inputStyle} placeholder="聯絡人" />
                )}
              </div>

              <div>
                <label style={labelStyle}>專案名稱 (Project)</label>
                <input
                  name="project_name"
                  value={formData.project_name || ''}
                  onChange={handleChange}
                  style={inputStyle}
                  placeholder="輸入或選取專案"
                />
              </div>
            </div>

            {/* 放置地點與保固 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>放置地點 (Location)</label>
                <input name="location" value={formData.location} onChange={handleChange} style={inputStyle} placeholder="例如：A棟 機房 2F" />
              </div>
              <div>
                <label style={labelStyle}>原廠保固到期日</label>
                <input type="date" name="warranty_expire" value={formData.warranty_expire} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>客戶保固到期日</label>
                <input type="date" name="customer_warranty_expire" value={formData.customer_warranty_expire} onChange={handleChange} style={inputStyle} />
              </div>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
          >
            取消
          </button>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={isSubmitting}
              style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--primary-color)', backgroundColor: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary-color)', fontSize: '13px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} /> 儲存並繼續新增
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={isSubmitting}
              style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary-color)', color: '#fff', fontSize: '13px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)' }}
            >
              <Check size={16} /> 儲存並關閉
            </button>
          </div>
        </div>

      </div>

      {showBatchImport && (
        <DeviceBatchImportModal
          isOpen={showBatchImport}
          onClose={() => setShowBatchImport(false)}
          onSuccess={() => {
            if (onSuccess) onSuccess();
            onClose();
          }}
        />
      )}
    </div>
  );
};

export default DeviceRegistrationModal;
