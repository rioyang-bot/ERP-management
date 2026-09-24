import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getMatchingSpecs } from '../utils/matchingSpecs';
import { Plus, Save, X, Monitor, User, MapPin, ListFilter, Server, FileSpreadsheet, Check, Layers } from 'lucide-react';
import { logCreate } from '../utils/auditLogger';
import CardPickerModal from './CardPickerModal';
import DeviceBatchImportModal from './DeviceBatchImportModal';
import { normalizeMasterName } from '../utils/normalizeMasterData';
import { validateName as validateAndSanitize } from '../utils/nameValidation';

const DeviceRegistrationModal = ({ isOpen, onClose, onSuccess }) => {
  const [types, setTypes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [showAddType, setShowAddType] = useState(false);
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 這次建檔中新輸入、但還沒真正建立的類型／廠牌／型號。
  // 下拉選單已改讀「既有卡片」，新值在存檔前還沒有卡片、查不到，
  // 因此先暫存在這裡讓使用者選得到；按下儲存建立卡片後就會自然出現在清單中。
  // 取消建檔則什麼都不會留下。
  const [showCardPicker, setShowCardPicker] = useState(false);
  // 既有卡片。規格的建議清單要依目前選的類型／廠牌／型號縮小範圍，
  // 因此整份留著，不先壓成規格清單。
  const [existingCards, setExistingCards] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      const res = await window.electronAPI.namedQuery('fetchExistingCards', ['設備']);
      if (res?.success) setExistingCards(res.rows || []);
    })();
  }, [isOpen]);

  // 只列出符合目前選取條件的規格；選得越細，候選越少。
  // 相依只看這三個欄位 —— 用整個 formData 的話，序號、備註每打一個字都會重算。
  const cardSpecs = useMemo(
    () => getMatchingSpecs(existingCards, {
      type: formData.type, brand: formData.brand, model: formData.model,
    }),
    [existingCards, formData.type, formData.brand, formData.model]
  );

  // 從既有卡片一次帶入類型／廠牌／型號／規格。
  // 帶進來的值一定已經存在於清單中，因此不需要進暫存。
  const handlePickCard = async (card) => {
    // 帶入的值來自既有卡片，必定有效；但各下拉的選項清單未必已經載入該值
    //（例如型號清單還停在原本的廠牌），因此先確保選項存在再設定值，
    // 否則 select 會因為沒有對應的 option 而顯示空白。
    setTypes(prev => (prev.includes(card.type) ? prev : [...prev, card.type]));
    setBrands(prev => (prev.some(b => b.name === card.brand) ? prev : [...prev, { id: 'card-' + card.brand, name: card.brand }]));
    await fetchModels(card.brand);
    setModels(prev => (prev.includes(card.model) ? prev : [...prev, card.model]));
    setFormData(prev => ({
      ...prev,
      type: card.type || '',
      brand: card.brand || '',
      model: card.model || '',
      specification: card.specification || '',
    }));
  };

  const [pending, setPending] = useState({ types: [], brands: [], models: [] });
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  /** 把暫存值併進查詢結果，重複的不重覆列出 */
  const withPending = (names, kind) => {
    const extra = pendingRef.current[kind].filter((x) => !names.includes(x));
    return [...names, ...extra];
  };

  const fetchModels = useCallback(async (brandName) => {
    if (!brandName) { setModels([]); return { modelNames: [] }; }
    const res = await window.electronAPI.namedQuery('fetchModelsByBrand', [brandName]);
    if (res.success) {
      const modelNames = withPending(res.rows.map(r => r.name), 'models');
      setModels(modelNames);
      setFormData(prev => ({ ...prev, model: modelNames.includes(prev.model) ? prev.model : (modelNames[0] || '') }));
      return { modelNames };
    }
    return { modelNames: [] };
  }, []);

  const fetchTypes = useCallback(async (currentType = '') => {
    const res = await window.electronAPI.namedQuery('fetchDeviceTypes');
    if (res.success) {
      const typeNames = withPending(res.rows.map(r => r.name), 'types');
      setTypes(typeNames);
      setFormData(prev => ({
        ...prev,
        type: typeNames.includes(prev.type) ? prev.type : (typeNames.includes(currentType) ? currentType : '')
      }));
      return { typeNames };
    }
    return { typeNames: [] };
  }, []);

  const fetchBrands = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchDeviceBrands');
    if (res.success) {
      const brandRows = [
        ...res.rows,
        ...pendingRef.current.brands
          .filter((n) => !res.rows.some((r) => r.name === n))
          .map((n) => ({ id: 'pending-' + n, name: n })),
      ];
      setBrands(brandRows);
      if (!formData.brand && res.rows.length > 0) {
        const initialBrand = res.rows[0].name;
        setFormData(prev => ({ ...prev, brand: initialBrand }));
        await fetchModels(initialBrand);
      }
    }
  }, [formData.brand, fetchModels]);

  const fetchCustomers = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchCustomers');
    if (res.success) setCustomers(res.rows);
  }, []);

  const fetchSettings = useCallback(async () => {
  }, []);

  const fetchProjects = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchActiveProjects');
    if (res.success) setProjects(res.rows || []);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
      fetchSettings();
      fetchTypes();
      fetchBrands();
      fetchProjects();
    }
  }, [isOpen, fetchCustomers, fetchSettings, fetchTypes, fetchBrands, fetchProjects]);

  if (!isOpen) return null;


  const handleAddType = () => {
    const name = normalizeMasterName(validateAndSanitize(newTypeName, '類型名稱'));
    if (!name) return;
    // 只暫存，等整張建檔儲存時才會隨卡片一起建立
    setPending(prev => ({ ...prev, types: [...new Set([...prev.types, name])] }));
    setTypes(prev => (prev.includes(name) ? prev : [...prev, name]));
    setFormData(prev => ({ ...prev, type: name }));
    setNewTypeName(''); setShowAddType(false);
  };


  const handleAddModel = () => {
    const name = normalizeMasterName(validateAndSanitize(newModelName, '型號名稱'));
    if (!name || !formData.brand) return alert('請先選擇或輸入廠牌');
    setPending(prev => ({ ...prev, models: [...new Set([...prev.models, name])] }));
    setModels(prev => (prev.includes(name) ? prev : [...prev, name]));
    setFormData(prev => ({ ...prev, model: name }));
    setNewModelName(''); setShowAddModel(false);
  };


  const handleAddBrand = () => {
    const name = normalizeMasterName(validateAndSanitize(newBrandName, '廠牌名稱'));
    if (!name) return;
    setPending(prev => ({ ...prev, brands: [...new Set([...prev.brands, name])] }));
    setBrands(prev => (prev.some(b => b.name === name) ? prev : [...prev, { id: 'pending-' + name, name }]));
    setFormData(prev => ({ ...prev, brand: name, model: '' }));
    // 新廠牌底下還沒有任何型號，清空型號清單讓使用者自行新增
    setModels([]);
    setNewBrandName(''); setShowAddBrand(false);
  };


  const handleChange = async (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'brand') {
      await fetchModels(value);
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
    if (!formData.brand || !formData.type || !formData.model) {
      return alert('請填寫必填欄位 (廠牌、類型、型號為必填)');
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
      const spec = (formData.specification || '').trim();
      let masterId;
      const findRes = await window.electronAPI.namedQuery('findItemMaster', [spec, formData.type, formData.brand, formData.model]);
      if (findRes.success && findRes.rows.length > 0) {
        masterId = findRes.rows[0].id;
      } else {
        const res = await window.electronAPI.namedQuery('insertItemMaster', [spec, formData.type, formData.brand, formData.model, '台', '設備']);
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
          masterId,
          sn || null,
          formData.client || null,
          formData.hostname || null,
          formData.location || null,
          formData.installed_date || null,
          formData.customer_warranty_expire || null,
          formData.system_date || null,
          formData.warranty_expire || null,
          formData.os || null,
          formData.nic || null,
          updatedCustomAttributes,
          formData.ownership || 'FOR_SALE',
          formData.status || 'ACTIVE',
          formData.remarks || null
        ]);
        if (res.success) {
          successCount++;
        } else {
          console.error('[insertAssetRecord error]:', res.error);
          throw new Error(res.error || '新增資產紀錄失敗');
        }
      }

      if (successCount === 0) {
        throw new Error('未成功建立任何設備紀錄，請確認資料是否正確');
      }

      logCreate(
        'DEVICE',
        isBulkMode ? `批次 ${snList.length} 台` : (formData.sn || '無序號'),
        `${formData.brand} ${formData.model}`,
        `新增設備 [${formData.brand} ${formData.model}] ${isBulkMode ? `批次建立 ${successCount} 筆` : `序號: ${formData.sn || '未指定'}`}`,
        { isBulkMode, count: successCount, brand: formData.brand, type: formData.type, model: formData.model, snList: isBulkMode ? snList : [formData.sn], client: formData.client, location: formData.location }
      );

      const createdInfo = {
        brand: formData.brand,
        model: formData.model,
        type: formData.type,
        specification: spec,
        sn: isBulkMode ? (snList[0] || '') : (formData.sn ? formData.sn.trim() : '')
      };

      window.dispatchEvent(new CustomEvent('db-update'));
      if (onSuccess) onSuccess(createdInfo);

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
              {/* 類型 (Type) * */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <label htmlFor="dev-reg-type" style={labelStyle}>類型 (Type) *</label>
                  <button
                    type="button"
                    onClick={() => setShowCardPicker(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px',
                      borderRadius: '6px', border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--primary-color)',
                      fontSize: '11px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                    title="從既有卡片一次帶入類型、廠牌、型號與規格"
                  >
                    <Layers size={12} /> 從既有卡片選取
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select id="dev-reg-type" name="type" value={formData.type} onChange={handleChange} style={inputStyle} required>
                    <option value="">選擇類型</option>
                    {types.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowAddType(!showAddType)} style={iconButtonStyle} title="新增類型"><Plus size={16} /></button>
                </div>
                {showAddType && (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <input placeholder="新類型名稱" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} style={inputStyle} />
                    <button type="button" onClick={handleAddType} style={{ ...iconButtonStyle, backgroundColor: 'var(--primary-color)', color: '#fff' }}>儲存</button>
                  </div>
                )}
              </div>

              {/* 廠牌 */}
              <div>
                <label htmlFor="dev-reg-brand" style={labelStyle}>廠牌 (Brand) *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select id="dev-reg-brand" name="brand" value={formData.brand} onChange={handleChange} style={inputStyle} required>
                    <option value="">選擇廠牌</option>
                    {brands.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowAddBrand(!showAddBrand)} style={iconButtonStyle} title="新增廠牌"><Plus size={16} /></button>
                </div>
                {showAddBrand && (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <input placeholder="新廠牌名稱" value={newBrandName} onChange={e => setNewBrandName(e.target.value)} style={inputStyle} />
                    <button type="button" onClick={handleAddBrand} style={{ ...iconButtonStyle, backgroundColor: 'var(--primary-color)', color: '#fff' }}>儲存</button>
                  </div>
                )}
              </div>

              {/* 型號 */}
              <div>
                <label htmlFor="dev-reg-model" style={labelStyle}>型號 (Model) *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select id="dev-reg-model" name="model" value={formData.model} onChange={handleChange} style={inputStyle} required>
                    <option value="">選擇型號</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowAddModel(!showAddModel)} style={iconButtonStyle} title="新增型號"><Plus size={16} /></button>
                </div>
                {showAddModel && (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <input placeholder="新型號名稱" value={newModelName} onChange={e => setNewModelName(e.target.value)} style={inputStyle} />
                    <button type="button" onClick={handleAddModel} style={{ ...iconButtonStyle, backgroundColor: 'var(--primary-color)', color: '#fff' }}>儲存</button>
                  </div>
                )}
              </div>
            </div>

            {/* 規格 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>規格 (Specification) <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(選填)</span></label>
              {/* textarea 不支援建議清單，改用下拉直接套用既有卡片用過的規格 */}
              {cardSpecs.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) setFormData(prev => ({ ...prev, specification: e.target.value })); }}
                  style={{ ...inputStyle, marginBottom: '6px', fontSize: '12px' }}
                  title="從既有卡片用過的規格挑一個填入"
                >
                  <option value="">套用既有規格…（符合目前類型／廠牌／型號的 {cardSpecs.length} 筆）</option>
                  {cardSpecs.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                </select>
              )}
              <textarea name="specification" value={formData.specification} onChange={handleChange} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} placeholder="選填，可輸入硬體核心規格與配置..." />
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
      <CardPickerModal
        isOpen={showCardPicker}
        onClose={() => setShowCardPicker(false)}
        category="設備"
        onSelect={handlePickCard}
      />
    </div>
  );
};

export default DeviceRegistrationModal;
