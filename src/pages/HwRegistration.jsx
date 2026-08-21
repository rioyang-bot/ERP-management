import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Save, Trash2, Cpu, Settings2, X, Server, Clock, User, MapPin, Layers, ListFilter } from 'lucide-react';

const HwRegistration = ({ isSplitMode = false }) => {
  const navigate = useNavigate();
  const [brands, setBrands] = useState([]);
  const [types, setTypes] = useState([]);
  const [models, setModels] = useState([]);
  const [recentItems, setRecentItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

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
    order_date: '', server_sn: '', project_name: '', ownership: 'FOR_SALE'
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

  const fetchProjects = useCallback(async () => {
    try {
      const res = await window.electronAPI.namedQuery('fetchActiveProjects');
      if (res.success) setProjects(res.rows || []);
    } catch (err) {
      console.error('Fetch projects error:', err);
    }
  }, []);

  useEffect(() => {
    fetchBrands();
    fetchRecentItems();
    fetchProjects();
  }, [fetchBrands, fetchRecentItems, fetchProjects]);

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
    const res = await window.electronAPI.namedQuery('insertDeviceBrand', ['硬體', name]);
    if (res.success) { await fetchBrands(); setNewBrandName(''); setActiveAdd(null); }
    else alert('新增失敗：' + res.error);
  };

  const handleAddType = async () => {
    const name = validateAndSanitize(newTypeName, '類型名稱');
    if (!name || !formData.brand) return;
    const res = await window.electronAPI.namedQuery('insertDeviceType', ['硬體', formData.brand, name]);
    if (res.success) { await fetchTypes(formData.brand); setNewTypeName(''); setActiveAdd(null); }
    else alert('新增失敗：' + res.error);
  };

  const handleAddModel = async () => {
    const name = validateAndSanitize(newModelName, '型號名稱');
    if (!name || !formData.brand || !formData.type) return;
    const res = await window.electronAPI.namedQuery('insertDeviceModel', [formData.brand, formData.type, '硬體', name]);
    if (res.success) { await fetchModels(formData.brand, formData.type); setNewModelName(''); setActiveAdd(null); }
    else alert('新增失敗：' + res.error);
  };

  const handleDeleteBrand = async (brandName) => {
    if (!confirm(`確定要刪除廠牌「${brandName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceBrand', [brandName, '硬體']);
    if (res.success) await fetchBrands();
    else alert('刪除失敗：' + res.error);
  };

  const handleDeleteType = async (typeName) => {
    if (!confirm(`確定要刪除類型「${typeName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceType', [typeName, '硬體', formData.brand]);
    if (res.success) await fetchTypes(formData.brand);
    else alert('刪除失敗：' + res.error);
  };

  const handleDeleteModel = async (modelName) => {
    if (!confirm(`確定要刪除型號「${modelName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceModel', [modelName, formData.brand, formData.type, '硬體']);
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

    if (!safeBrand || !safeType || !safeModel) {
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
        const insMaster = await window.electronAPI.namedQuery('insertItemMaster', [safeSpec || '', safeType, safeBrand, safeModel, '個', '硬體']);
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
          server_sn: safeServerSn,
          project_name: formData.project_name || ''
        };

        const res = await window.electronAPI.namedQuery('insertAssetRecord', [
          itemMasterId, sn || null, '', '', '',
          null, null, null, null, '', '',
          custom_attributes, formData.ownership || 'FOR_SALE'
        ]);

        if (res.success) successCount++;
        else failCount++;
      }

      if (successCount > 0) {
        alert(`成功建檔 ${successCount} 筆資料${failCount > 0 ? `，失敗 ${failCount} 筆` : ''}。`);
        setFormData({ ...formData, sn: '', server_sn: '', project_name: '' });
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

  const containerStyle = { padding: '24px', backgroundColor: 'var(--bg-app)', minHeight: '100vh', display: 'flex', flexDirection: isSplitMode ? 'column' : 'row', gap: '24px' };
  const leftSectionStyle = isSplitMode ? { width: '100%' } : { flex: '0 0 60%' };
  const rightSectionStyle = isSplitMode ? { width: '100%' } : { flex: '1' };
  const cardStyle = { backgroundColor: 'var(--bg-surface)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', marginBottom: '24px', color: 'var(--text-main)' };
  const labelStyle = { display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' };
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '14px', outline: 'none' };
  const iconBtnStyle = { padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center' };

  const modeBtnStyle = (active) => ({
    flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
    backgroundColor: active ? 'var(--primary-color)' : 'var(--bg-surface-subtle)',
    color: active ? '#fff' : 'var(--text-muted)',
    fontWeight: '700', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
  });

  const RenderInlineMgmt = ({ title, items, onDelete }) => (
    <div style={{ marginTop: '8px', border: '1px solid var(--border-color)', borderRadius: '10px', backgroundColor: 'var(--bg-surface)', boxShadow: 'var(--modal-shadow)' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', color: 'var(--text-main)' }}>
        <span>管理{title}清單</span>
        <X size={14} onClick={() => setActiveMgmt(null)} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} />
      </div>
      <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
        {items.map(item => (
          <div key={typeof item === 'object' ? item.id : item} style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)', margin: 0 }}>
                <Cpu size={26} color="var(--primary-color)" /> 硬體建檔 (Hardware Registration)
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>新增硬體元件（如網卡、記憶體等）並建立獨立序號進行管理。</p>
            </div>
            {!isSplitMode && (
              <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <button style={{ padding: '6px 14px', backgroundColor: 'var(--bg-surface)', color: 'var(--primary-color)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '800', boxShadow: 'var(--card-shadow)', cursor: 'default' }}>
                  📝 建檔
                </button>
                <button onClick={() => navigate('/hw-split')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
                  ◫ 雙開
                </button>
                <button onClick={() => navigate('/hw-list')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
                  📋 清單
                </button>
              </div>
            )}
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={labelStyle}>廠牌 (Brand) <span style={{ color: '#ef4444' }}>*</span></label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <select name="brand" value={formData.brand} onChange={handleChange} style={inputStyle} required>
                    <option value="">選擇廠牌</option>
                    {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setActiveAdd(activeAdd === 'brand' ? null : 'brand')} style={iconBtnStyle}><Plus size={18} /></button>
                  <button type="button" onClick={() => setActiveMgmt(activeMgmt === 'brand' ? null : 'brand')} style={iconBtnStyle}><Settings2 size={18} /></button>
                </div>
                {activeAdd === 'brand' && <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}><input type="text" value={newBrandName} onChange={e => setNewBrandName(e.target.value)} placeholder="新廠牌" style={inputStyle} /><button type="button" onClick={handleAddBrand} style={{ ...iconBtnStyle, background: '#2563eb', color: '#fff' }}><Plus size={18} /></button></div>}
                {activeMgmt === 'brand' && <RenderInlineMgmt title="廠牌" items={brands} onDelete={handleDeleteBrand} />}
              </div>

              <div>
                <label style={labelStyle}>類型 (Type) <span style={{ color: '#ef4444' }}>*</span></label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <select name="type" value={formData.type} onChange={handleChange} style={inputStyle} required disabled={!formData.brand}>
                    <option value="">選擇類型</option>
                    {types.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button type="button" onClick={() => setActiveAdd(activeAdd === 'type' ? null : 'type')} style={iconBtnStyle} disabled={!formData.brand}><Plus size={18} /></button>
                  <button type="button" onClick={() => setActiveMgmt(activeMgmt === 'type' ? null : 'type')} style={iconBtnStyle} disabled={!formData.brand}><Settings2 size={18} /></button>
                </div>
                {activeAdd === 'type' && <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}><input type="text" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="新類型" style={inputStyle} /><button type="button" onClick={handleAddType} style={{ ...iconBtnStyle, background: '#2563eb', color: '#fff' }}><Plus size={18} /></button></div>}
                {activeMgmt === 'type' && <RenderInlineMgmt title="類型" items={types.map(t => ({ name: t }))} onDelete={handleDeleteType} />}
              </div>

              <div>
                <label style={labelStyle}>型號 (Model) <span style={{ color: '#ef4444' }}>*</span></label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <select name="model" value={formData.model} onChange={handleChange} style={inputStyle} required disabled={!formData.type}>
                    <option value="">選擇型號</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button type="button" onClick={() => setActiveAdd(activeAdd === 'model' ? null : 'model')} style={iconBtnStyle} disabled={!formData.type}><Plus size={18} /></button>
                  <button type="button" onClick={() => setActiveMgmt(activeMgmt === 'model' ? null : 'model')} style={iconBtnStyle} disabled={!formData.type}><Settings2 size={18} /></button>
                </div>
                {activeAdd === 'model' && <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}><input type="text" value={newModelName} onChange={e => setNewModelName(e.target.value)} placeholder="新型號" style={inputStyle} /><button type="button" onClick={handleAddModel} style={{ ...iconBtnStyle, background: '#2563eb', color: '#fff' }}><Plus size={18} /></button></div>}
                {activeMgmt === 'model' && <RenderInlineMgmt title="型號" items={models.map(m => ({ name: m }))} onDelete={handleDeleteModel} />}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={labelStyle}>規格 (Specification)</label>
                <input type="text" name="specification" value={formData.specification} onChange={handleChange} style={inputStyle} placeholder="例如: 10GbE SFP+ Dual Port" />
              </div>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', marginBottom: '24px', alignItems: 'start' }}>
              <div>
                <label style={labelStyle}>{isBulkMode ? '硬體序號清單 (每行一個序號)' : '硬體序號 (SN)'}</label>
                {isBulkMode ? (
                  <textarea
                    value={bulkSns}
                    onChange={e => setBulkSns(e.target.value)}
                    style={{ ...inputStyle, minHeight: '160px', fontFamily: 'monospace', lineHeight: '1.6' }}
                    placeholder="請在此處貼上或掃描多個序號..."
                  />
                ) : (
                  <input type="text" name="sn" value={formData.sn} onChange={handleChange} style={inputStyle} placeholder="請輸入硬體序號" />
                )}
                {isBulkMode && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>已輸入: <b>{bulkSns.split('\n').filter(s => s.trim()).length}</b> 個序號</div>}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={labelStyle}>訂單日期 (Order Date)</label>
                <input type="date" name="order_date" value={formData.order_date} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>對應 Server SN</label>
                <div style={{ position: 'relative' }}>
                  <Server size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
                  <input type="text" name="server_sn" value={formData.server_sn} onChange={handleChange} style={{ ...inputStyle, paddingLeft: '38px' }} placeholder="同步對應主機" />
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <button type="submit" style={{ ...inputStyle, width: '100%', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', padding: '14px', fontWeight: '900', cursor: 'pointer', borderRadius: '12px', fontSize: '16px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>
                <Save size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} /> {isBulkMode ? `開始多筆建檔 (${bulkSns.split('\n').filter(s => s.trim()).length} 筆)` : '儲存硬體資料'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div style={rightSectionStyle}>
        <div style={cardStyle}>
          <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
            <Clock size={18} color="var(--text-muted)" /> 最新 10 筆建檔記錄
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recentItems.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px', fontSize: '13px' }}>尚無建檔紀錄</div>
            ) : (
              recentItems.map(item => (
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
                  <div style={{ fontSize: '11px', color: 'var(--text-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>SN: <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--text-main)' }}>{item.sn || '--'}</span></span>
                    {item.custom_attributes?.server_sn && (
                      <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '1px 6px', borderRadius: '4px', fontWeight: '800', fontSize: '10px' }}>
                        Host: {item.custom_attributes.server_sn}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-subtle)', marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-main)' }}><User size={12} /> {item.server_client || item.client || '--'}</span>
                      {(item.partner_contact || item.partner_phone) && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', paddingLeft: '16px' }}>{item.partner_contact} {item.partner_phone}</span>
                      )}
                    </div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}><MapPin size={12} /> {item.server_location || '--'}</span>
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

export default HwRegistration;
