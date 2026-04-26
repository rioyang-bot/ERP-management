import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Save, Trash2, Cpu, Settings2, X, Server, Clock, User, MapPin, Layers, ListFilter } from 'lucide-react';

const NicRegistration = () => {
  const [brands, setBrands] = useState([]);
  const [types, setTypes] = useState([]);
  const [models, setModels] = useState([]);
  const [recentItems, setRecentItems] = useState([]);
  
  const [activeMgmt, setActiveMgmt] = useState(null);
  const [activeAdd, setActiveAdd] = useState(null);

  const [newBrandName, setNewBrandName] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [newModelName, setNewModelName] = useState('');

  // 新增：大量模式 State
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkSns, setBulkSns] = useState('');

  const [formData, setFormData] = useState({
    brand: '', type: '', model: '', specification: '', sn: '',
    order_date: '', server_sn: ''
  });

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

  const fetchBrands = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchNicBrands');
    if (res.success) setBrands(res.rows);
  }, []);

  const fetchRecentItems = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchNicList');
    if (res.success) {
      setRecentItems(res.rows.slice(0, 10));
    }
  }, []);

  const fetchTypes = useCallback(async (brandName) => {
    if (!brandName) return;
    const res = await window.electronAPI.namedQuery('fetchNicTypesByBrand', [brandName]);
    if (res.success) setTypes(res.rows.map(r => r.name));
  }, []);

  const fetchModels = useCallback(async (brandName, typeName) => {
    if (!brandName || !typeName) return;
    const res = await window.electronAPI.namedQuery('fetchNicModelsByBrandType', [brandName, typeName]);
    if (res.success) setModels(res.rows.map(r => r.name));
  }, []);

  useEffect(() => {
    fetchBrands();
    fetchRecentItems();
  }, [fetchBrands, fetchRecentItems]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'brand') {
      setTypes([]); setModels([]);
      setFormData(prev => ({ ...prev, type: '', model: '' }));
      fetchTypes(value);
    }
    if (name === 'type') {
      setModels([]);
      setFormData(prev => ({ ...prev, model: '' }));
      fetchModels(formData.brand, value);
    }
  };

  const handleAddBrand = async () => {
    const name = validateAndSanitize(newBrandName, '廠牌名稱');
    if (!name) return;
    const res = await window.electronAPI.namedQuery('insertDeviceBrand', ['網卡', name]);
    if (res.success) { await fetchBrands(); setNewBrandName(''); setActiveAdd(null); }
    else alert('新增失敗：' + res.error);
  };

  const handleAddType = async () => {
    const name = validateAndSanitize(newTypeName, '類型名稱');
    if (!name || !formData.brand) return;
    const res = await window.electronAPI.namedQuery('insertDeviceType', ['網卡', formData.brand, name]);
    if (res.success) { await fetchTypes(formData.brand); setNewTypeName(''); setActiveAdd(null); }
    else alert('新增失敗：' + res.error);
  };

  const handleAddModel = async () => {
    const name = validateAndSanitize(newModelName, '型號名稱');
    if (!name || !formData.brand || !formData.type) return;
    const res = await window.electronAPI.namedQuery('insertDeviceModel', [formData.brand, formData.type, '網卡', name]);
    if (res.success) { await fetchModels(formData.brand, formData.type); setNewModelName(''); setActiveAdd(null); }
    else alert('新增失敗：' + res.error);
  };

  const handleDeleteBrand = async (brandName) => {
    if (!confirm(`確定要刪除廠牌「${brandName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceBrand', [brandName, '網卡']);
    if (res.success) await fetchBrands();
    else alert('刪除失敗：' + res.error);
  };

  const handleDeleteType = async (typeName) => {
    if (!confirm(`確定要刪除類型「${typeName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceType', [typeName, '網卡', formData.brand]);
    if (res.success) await fetchTypes(formData.brand);
    else alert('刪除失敗：' + res.error);
  };

  const handleDeleteModel = async (modelName) => {
    if (!confirm(`確定要刪除型號「${modelName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceModel', [modelName, formData.brand, formData.type, '網卡']);
    if (res.success) await fetchModels(formData.brand, formData.type);
    else alert('刪除失敗：' + res.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // 取得基本資訊
    const safeBrand = validateAndSanitize(formData.brand, '廠牌');
    const safeType = validateAndSanitize(formData.type, '類型');
    const safeModel = validateAndSanitize(formData.model, '型號');
    const safeSpec = validateAndSanitize(formData.specification, '規格');
    const safeServerSn = validateAndSanitize(formData.server_sn, 'Server SN');

    if (!safeBrand || !safeType || !safeModel || !safeSpec) {
      return alert('請填寫必填欄位 (*) 並確保符合安全規範');
    }

    // 解析序號清單
    let snList = [];
    if (isBulkMode) {
      snList = bulkSns.split('\n').map(s => s.trim()).filter(s => s !== '');
      if (snList.length === 0) return alert('請輸入至少一個序號');
      if (new Set(snList).size !== snList.length) {
        if (!confirm('偵測到重複輸入的序號，系統將自動去重後繼續，是否確定？')) return;
        snList = Array.from(new Set(snList));
      }
    } else {
      snList = [formData.sn.trim()];
    }

    try {
      // 1. 處理 Item Master
      let itemMasterId;
      const findRes = await window.electronAPI.namedQuery('findItemMaster', [safeSpec, safeType, safeBrand, safeModel]);
      
      if (findRes.success && findRes.rows.length > 0) {
        itemMasterId = findRes.rows[0].id;
      } else {
        const insMaster = await window.electronAPI.namedQuery('insertItemMaster', [safeSpec, safeType, safeBrand, safeModel, '個', '網卡']);
        if (insMaster.success && insMaster.rows?.length > 0) {
          itemMasterId = insMaster.rows[0].id;
        } else {
          throw new Error('建立物料主檔失敗');
        }
      }

      // 2. 批次新增 Asset
      let successCount = 0;
      let failCount = 0;

      for (const sn of snList) {
        const custom_attributes = { 
          order_date: formData.order_date, 
          server_sn: safeServerSn 
        };

        const res = await window.electronAPI.namedQuery('insertAssetRecord', [
          itemMasterId, sn || null, '', '', '', 
          null, null, null, null, '', '', 
          custom_attributes
        ]);

        if (res.success) successCount++;
        else failCount++;
      }

      if (successCount > 0) {
        alert(`成功建檔 ${successCount} 筆資料${failCount > 0 ? `，失敗 ${failCount} 筆` : ''}。`);
        // 重置表單
        setFormData({ ...formData, sn: '', server_sn: '' });
        setBulkSns('');
        fetchRecentItems();
        window.dispatchEvent(new CustomEvent('db-update'));
      } else {
        alert('建檔失敗。');
      }
    } catch (err) {
      alert('作業錯誤：' + err.message);
    }
  };

  const containerStyle = { padding: '24px', backgroundColor: '#f1f5f9', minHeight: '100vh', display: 'flex', gap: '24px' };
  const leftSectionStyle = { flex: '0 0 60%' };
  const rightSectionStyle = { flex: '0 0 40%' };
  const cardStyle = { backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '24px' };
  const labelStyle = { display: 'block', fontSize: '14px', fontWeight: '800', color: '#475569', marginBottom: '6px' };
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none' };
  const iconBtnStyle = { padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' };
  
  const modeBtnStyle = (active) => ({
    flex: 1, padding: '10px', borderRadius: '8px', border: 'none', 
    backgroundColor: active ? '#2563eb' : '#f1f5f9', 
    color: active ? '#fff' : '#475569',
    fontWeight: '700', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
  });

  const RenderInlineMgmt = ({ title, items, onDelete }) => (
    <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700' }}>
        <span>管理{title}清單</span>
        <X size={14} onClick={() => setActiveMgmt(null)} style={{ cursor: 'pointer' }} />
      </div>
      <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
        {items.map(item => (
          <div key={typeof item === 'object' ? item.id : item} style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderBottom: '1px solid #f9f9f9' }}>
            <span>{typeof item === 'object' ? item.name : item}</span>
            <Trash2 size={14} color="#ef4444" style={{ cursor: 'pointer' }} onClick={() => onDelete(typeof item === 'object' ? item.name : item)} />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={containerStyle}>
      <div style={leftSectionStyle}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: '20px', fontWeight: '900', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px', color: '#1e293b' }}>
            <Cpu size={26} color="#2563eb" /> 網卡建檔 (NIC Registration)
          </h2>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={labelStyle}>廠牌 (Brand) *</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <select name="brand" value={formData.brand} onChange={handleChange} style={inputStyle} required>
                    <option value="">選擇廠牌</option>
                    {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setActiveAdd(activeAdd === 'brand' ? null : 'brand')} style={iconBtnStyle}><Plus size={18}/></button>
                  <button type="button" onClick={() => setActiveMgmt(activeMgmt === 'brand' ? null : 'brand')} style={iconBtnStyle}><Settings2 size={18}/></button>
                </div>
                {activeAdd === 'brand' && <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}><input type="text" value={newBrandName} onChange={e => setNewBrandName(e.target.value)} placeholder="新廠牌" style={inputStyle} /><button type="button" onClick={handleAddBrand} style={{ ...iconBtnStyle, background: '#2563eb', color: '#fff' }}><Plus size={18}/></button></div>}
                {activeMgmt === 'brand' && <RenderInlineMgmt title="廠牌" items={brands} onDelete={handleDeleteBrand} />}
              </div>

              <div>
                <label style={labelStyle}>類型 (Type) *</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <select name="type" value={formData.type} onChange={handleChange} style={inputStyle} required disabled={!formData.brand}>
                    <option value="">選擇類型</option>
                    {types.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button type="button" onClick={() => setActiveAdd(activeAdd === 'type' ? null : 'type')} style={iconBtnStyle} disabled={!formData.brand}><Plus size={18}/></button>
                  <button type="button" onClick={() => setActiveMgmt(activeMgmt === 'type' ? null : 'type')} style={iconBtnStyle} disabled={!formData.brand}><Settings2 size={18}/></button>
                </div>
                {activeAdd === 'type' && <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}><input type="text" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="新類型" style={inputStyle} /><button type="button" onClick={handleAddType} style={{ ...iconBtnStyle, background: '#2563eb', color: '#fff' }}><Plus size={18}/></button></div>}
                {activeMgmt === 'type' && <RenderInlineMgmt title="類型" items={types.map(t => ({ name: t }))} onDelete={handleDeleteType} />}
              </div>

              <div>
                <label style={labelStyle}>型號 (Model) *</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <select name="model" value={formData.model} onChange={handleChange} style={inputStyle} required disabled={!formData.type}>
                    <option value="">選擇型號</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button type="button" onClick={() => setActiveAdd(activeAdd === 'model' ? null : 'model')} style={iconBtnStyle} disabled={!formData.type}><Plus size={18}/></button>
                  <button type="button" onClick={() => setActiveMgmt(activeMgmt === 'model' ? null : 'model')} style={iconBtnStyle} disabled={!formData.type}><Settings2 size={18}/></button>
                </div>
                {activeAdd === 'model' && <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}><input type="text" value={newModelName} onChange={e => setNewModelName(e.target.value)} placeholder="新型號" style={inputStyle} /><button type="button" onClick={handleAddModel} style={{ ...iconBtnStyle, background: '#2563eb', color: '#fff' }}><Plus size={18}/></button></div>}
                {activeMgmt === 'model' && <RenderInlineMgmt title="型號" items={models.map(m => ({ name: m }))} onDelete={handleDeleteModel} />}
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>規格 (Specification) *</label>
              <input type="text" name="specification" value={formData.specification} onChange={handleChange} style={inputStyle} placeholder="例如: 10GbE SFP+ Dual Port" required />
            </div>

            <div style={{ marginBottom: '24px' }}>
               <label style={labelStyle}>建檔模式</label>
               <div style={{ display: 'flex', gap: '10px', backgroundColor: '#f1f5f9', padding: '6px', borderRadius: '12px' }}>
                  <button type="button" onClick={() => setIsBulkMode(false)} style={modeBtnStyle(!isBulkMode)}><ListFilter size={16}/> 單筆建檔</button>
                  <button type="button" onClick={() => setIsBulkMode(true)} style={modeBtnStyle(isBulkMode)}><Layers size={16}/> 多筆建檔</button>
               </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>{isBulkMode ? '網卡序號清單 (每行一個序號)' : '網卡序號 (SN)'}</label>
              {isBulkMode ? (
                <textarea 
                  value={bulkSns} 
                  onChange={e => setBulkSns(e.target.value)} 
                  style={{ ...inputStyle, minHeight: '160px', fontFamily: 'monospace', lineHeight: '1.6' }} 
                  placeholder="請在此處貼上或掃描多個序號..."
                />
              ) : (
                <input type="text" name="sn" value={formData.sn} onChange={handleChange} style={inputStyle} placeholder="請輸入網卡序號" />
              )}
              {isBulkMode && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>已輸入: <b>{bulkSns.split('\n').filter(s => s.trim()).length}</b> 個序號</div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={labelStyle}>訂單日期 (Order Date)</label>
                <input type="date" name="order_date" value={formData.order_date} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>對應 Server SN</label>
                <div style={{ position: 'relative' }}>
                  <Server size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input type="text" name="server_sn" value={formData.server_sn} onChange={handleChange} style={{ ...inputStyle, paddingLeft: '38px' }} placeholder="同步對應主機" />
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <button type="submit" style={{ ...inputStyle, width: '100%', backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '14px', fontWeight: '900', cursor: 'pointer', borderRadius: '12px', fontSize: '16px', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)' }}>
                <Save size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} /> {isBulkMode ? `開始多筆建檔 (${bulkSns.split('\n').filter(s => s.trim()).length} 筆)` : '儲存網卡資料'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div style={rightSectionStyle}>
        <div style={cardStyle}>
          <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
            <Clock size={18} color="#64748b" /> 最近建檔紀錄
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recentItems.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px', fontSize: '13px' }}>尚無建檔紀錄</div>
            ) : (
              recentItems.map(item => (
                <div key={item.id} style={{ padding: '14px', borderRadius: '12px', border: '1px solid #f1f5f9', backgroundColor: '#fcfcfc', transition: 'all 0.2s' }}>
                  <div style={{ fontWeight: '800', fontSize: '14px', color: '#1e293b', marginBottom: '4px' }}>{item.brand} - {item.model}</div>
                  <div style={{ fontSize: '12px', color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
                    <span>SN: <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{item.sn || '--'}</span></span>
                    {item.custom_attributes?.server_sn && (
                      <span style={{ color: '#2563eb', fontWeight: '700' }}>Host: {item.custom_attributes.server_sn}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><User size={12}/> {item.server_client || '--'}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12}/> {item.server_location || '--'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const menuButtonStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#475569', borderRadius: '8px', textAlign: 'left' };
const editLabelStyle = { display: 'block', fontWeight: '800', fontSize: '13px', marginBottom: '6px', color: '#475569' };
const editInputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '13px' };

export default NicRegistration;
