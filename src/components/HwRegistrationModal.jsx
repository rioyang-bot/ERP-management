import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getMatchingSpecs } from '../utils/matchingSpecs';
import { Plus, Save, Trash2, Cpu, Settings2, X, Server, FileSpreadsheet, Check, Layers } from 'lucide-react';
import { logCreate } from '../utils/auditLogger';
import CardPickerModal from './CardPickerModal';
import HwBatchImportModal from './HwBatchImportModal';
import { normalizeMasterName } from '../utils/normalizeMasterData';

const HwRegistrationModal = ({ isOpen, onClose, onSuccess }) => {
  const [brands, setBrands] = useState([]);
  const [types, setTypes] = useState([]);
  const [models, setModels] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showBatchImport, setShowBatchImport] = useState(false);

  const [activeAdd, setActiveAdd] = useState(null);

  const [newBrandName, setNewBrandName] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [newModelName, setNewModelName] = useState('');

  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkSns, setBulkSns] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    brand: '', type: '', model: '', specification: '', sn: '',
    order_source: '', server_sn: '', project_name: '', ownership: 'FOR_SALE'
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
      const res = await window.electronAPI.namedQuery('fetchExistingCards', ['硬體']);
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

  /** 併入暫存廠牌（廠牌是物件陣列，與類型／型號的字串陣列不同） */
  const brandRowsWithPending = (rows) => ([
    ...rows,
    ...pendingRef.current.brands
      .filter((n) => !rows.some((r) => r.name === n))
      .map((n) => ({ id: 'pending-' + n, name: n })),
  ]);

  const fetchBrands = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchHwBrands');
    if (res.success) setBrands(brandRowsWithPending(res.rows));
  }, []);

  const fetchTypes = useCallback(async (currentType = '') => {
    const res = await window.electronAPI.namedQuery('fetchHwTypes');
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

  const fetchModels = useCallback(async (brandName) => {
    if (!brandName) { setModels([]); return { modelNames: [] }; }
    const res = await window.electronAPI.namedQuery('fetchHwModelsByBrand', [brandName]);
    if (res.success) {
      const modelNames = withPending(res.rows.map(r => r.name), 'models');
      setModels(modelNames);
      setFormData(prev => ({ ...prev, model: modelNames.includes(prev.model) ? prev.model : '' }));
      return { modelNames };
    }
    return { modelNames: [] };
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
    if (isOpen) {
      fetchTypes();
      fetchBrands();
      fetchProjects();
    }
  }, [isOpen, fetchTypes, fetchBrands, fetchProjects]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'brand') {
      setModels([]);
      setFormData(prev => ({ ...prev, model: '' }));
      fetchModels(value);
    }
  };

  const handleSnBlur = async (snValue) => {
    const cleanSn = (snValue || '').trim();
    if (!cleanSn || formData.server_sn) return;
    try {
      const devRes = await window.electronAPI.namedQuery('findDeviceByMountedHwSn', [cleanSn]);
      if (devRes.success && devRes.rows && devRes.rows.length > 0) {
        const dev = devRes.rows[0];
        setFormData(prev => ({
          ...prev,
          server_sn: prev.server_sn || dev.sn,
          project_name: prev.project_name || dev.project_name || ''
        }));
      }
    } catch (err) {
      console.error('findDeviceByMountedHwSn error:', err);
    }
  };

  const handleAddBrand = async () => {
    const name = normalizeMasterName(validateAndSanitize(newBrandName, '廠牌名稱'));
    if (!name) return;
    // 只暫存，等整張建檔儲存時才會隨卡片一起建立
    setPending(prev => ({ ...prev, brands: [...new Set([...prev.brands, name])] }));
    setBrands(prev => (prev.some(b => b.name === name) ? prev : [...prev, { id: 'pending-' + name, name }]));
    {
      setFormData(prev => ({ ...prev, brand: name, model: '' }));
      // 新廠牌底下還沒有任何型號
      setModels([]);
      setNewBrandName('');
      setActiveAdd(null);
    }
  };

  const handleAddType = async () => {
    const name = normalizeMasterName(validateAndSanitize(newTypeName, '類型名稱'));
    if (!name) return;
    setPending(prev => ({ ...prev, types: [...new Set([...prev.types, name])] }));
    setTypes(prev => (prev.includes(name) ? prev : [...prev, name]));
    {
      setFormData(prev => ({ ...prev, type: name }));
      setNewTypeName('');
      setActiveAdd(null);
    }
  };

  const handleAddModel = async () => {
    const name = normalizeMasterName(validateAndSanitize(newModelName, '型號名稱'));
    if (!name || !formData.brand) return alert('請先選擇廠牌後再新增型號');
    setPending(prev => ({ ...prev, models: [...new Set([...prev.models, name])] }));
    setModels(prev => (prev.includes(name) ? prev : [...prev, name]));
    {
      setFormData(prev => ({ ...prev, model: name }));
      setNewModelName('');
      setActiveAdd(null);
    }
  };




  const handleSave = async (continueAdd = false) => {
    const safeType = validateAndSanitize(formData.type, '類型');
    const safeBrand = validateAndSanitize(formData.brand, '廠牌');
    const safeModel = validateAndSanitize(formData.model, '型號');
    const safeSpec = formData.specification ? (validateAndSanitize(formData.specification, '規格') || '') : '';
    const safeServerSn = validateAndSanitize(formData.server_sn, 'Server SN');

    if (!safeType || !safeBrand || !safeModel) {
      return alert('請填寫必填欄位 (類型、廠牌、型號為必填) 並確保符合安全規範');
    }

    let snList = [];
    if (isBulkMode) {
      snList = bulkSns.split('\n').map(s => s.trim()).filter(s => s !== '');
      if (snList.length === 0) return alert('請輸入至少一個序號');
      if (new Set(snList).size !== snList.length) {
        if (!confirm('偵測到重複輸入的序號，系統將自動去重後繼續，是否確定？')) return;
        snList = Array.from(new Set(snList));
      }
    } else {
      const cleanSn = (formData.sn || '').trim();
      snList = cleanSn ? [cleanSn] : [''];
    }

    // 檢查序號是否已存在
    for (const sn of snList) {
      if (sn) {
        const checkRes = await window.electronAPI.namedQuery('checkAssetSnExists', [sn]);
        if (checkRes.success && checkRes.rows?.length > 0) {
          alert(`序號「${sn}」已存在於系統資產庫中，請勿重複使用！`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    let lastError = '';
    try {
      let itemMasterId;
      const findRes = await window.electronAPI.namedQuery('findItemMaster', [safeSpec || '', safeType, safeBrand, safeModel]);

      if (findRes.success && findRes.rows.length > 0) {
        itemMasterId = findRes.rows[0].id;
      } else {
        const insMaster = await window.electronAPI.namedQuery('insertItemMaster', [safeSpec || '', safeType, safeBrand, safeModel, '個', '硬體']);
        if (insMaster.success && insMaster.rows?.length > 0) {
          itemMasterId = insMaster.rows[0].id;
        } else {
          throw new Error('建立硬體物料主檔失敗：' + (insMaster?.error || '未知錯誤'));
        }
      }

      let successCount = 0;
      let failCount = 0;

      for (const sn of snList) {
        const custom_attributes = {
          order_source: formData.order_source || '',
          server_sn: safeServerSn,
          project_name: formData.project_name || ''
        };

        const res = await window.electronAPI.namedQuery('insertAssetRecord', [
          itemMasterId, sn || null, '', '', '',
          null, null, null, null, '', '',
          custom_attributes, formData.ownership || 'FOR_SALE',
          'ACTIVE',
          formData.remarks || null
        ]);

        if (res.success) {
          successCount++;
          if (safeServerSn && sn) {
            try {
              await window.electronAPI.namedQuery('appendMountedHwSnToDevice', [safeServerSn, sn]);
            } catch (err) {
              console.error('appendMountedHwSnToDevice error:', err);
            }
          }
        } else {
          failCount++;
          lastError = res.error || '';
        }
      }

      if (successCount > 0) {
        logCreate(
          'HARDWARE',
          isBulkMode ? `批次 ${snList.length} 件` : (formData.sn || '無序號'),
          `${safeBrand} ${safeModel}`,
          `新增硬體 (${safeBrand} ${safeModel} x${successCount})`,
          { brand: safeBrand, type: safeType, model: safeModel, count: successCount, sns: snList }
        );

        alert(`成功建檔 ${successCount} 筆硬體資料！${failCount > 0 ? ` (失敗 ${failCount} 筆)` : ''}`);
        if (onSuccess) onSuccess();

        if (continueAdd) {
          setFormData(prev => ({
            ...prev,
            sn: '',
            specification: '',
            server_sn: ''
          }));
          setBulkSns('');
        } else {
          onClose();
        }
      } else {
        alert(`建檔失敗${lastError ? `：${lastError}` : '，請確認序號是否重複或連線異常。'}`);
      }
    } catch (err) {
      console.error(err);
      alert('建檔過程發生錯誤：' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-main)',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text-muted)',
    marginBottom: '6px'
  };

  const iconBtnStyle = {
    padding: '8px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-main)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  };

  const modeBtnStyle = (active) => ({
    flex: 1,
    padding: '8px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: active ? 'var(--primary-color)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  });

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--card-shadow)',
        width: '100%',
        maxWidth: '850px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface-subtle)'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={22} color="var(--primary-color)" /> 新增硬體建檔 (Hardware Registration)
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              建立伺服器硬體零組件（網卡、CPU、記憶體等）之主檔與序號資產。
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
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
              {/* 1. 類型 (Type) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <label style={labelStyle}>類型 (Type) *</label>
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
                  <select name="type" value={formData.type} onChange={handleChange} style={inputStyle} required>
                    <option value="">請選擇類型</option>
                    {types.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button type="button" onClick={() => setActiveAdd(activeAdd === 'type' ? null : 'type')} style={iconBtnStyle} title="新增類型"><Plus size={16} /></button>
                </div>
                {activeAdd === 'type' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="類型名稱 (例: NIC)" style={inputStyle} />
                    <button type="button" onClick={handleAddType} style={{ ...iconBtnStyle, backgroundColor: 'var(--primary-color)', color: '#fff' }}>儲存</button>
                  </div>
                )}
              </div>

              {/* 2. 廠牌 (Brand) */}
              <div>
                <label style={labelStyle}>廠牌 (Brand) *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select name="brand" value={formData.brand} onChange={handleChange} style={inputStyle} required>
                    <option value="">請選擇廠牌</option>
                    {brands.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setActiveAdd(activeAdd === 'brand' ? null : 'brand')} style={iconBtnStyle} title="新增廠牌"><Plus size={16} /></button>
                </div>
                {activeAdd === 'brand' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input value={newBrandName} onChange={e => setNewBrandName(e.target.value)} placeholder="廠牌名稱" style={inputStyle} />
                    <button type="button" onClick={handleAddBrand} style={{ ...iconBtnStyle, backgroundColor: 'var(--primary-color)', color: '#fff' }}>儲存</button>
                  </div>
                )}
              </div>

              {/* 3. 型號 (Model) */}
              <div>
                <label style={labelStyle}>型號 (Model) *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select name="model" value={formData.model} onChange={handleChange} style={inputStyle} disabled={!formData.brand} required>
                    <option value="">請選擇型號</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button type="button" onClick={() => setActiveAdd(activeAdd === 'model' ? null : 'model')} disabled={!formData.brand} style={iconBtnStyle} title="新增型號"><Plus size={16} /></button>
                </div>
                {activeAdd === 'model' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input value={newModelName} onChange={e => setNewModelName(e.target.value)} placeholder="型號名稱" style={inputStyle} />
                    <button type="button" onClick={handleAddModel} style={{ ...iconBtnStyle, backgroundColor: 'var(--primary-color)', color: '#fff' }}>儲存</button>
                  </div>
                )}
              </div>
            </div>

            {/* 規格 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>規格 (Specification) <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(選填)</span></label>
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
                  <label style={labelStyle}>硬體序號 (S/N)</label>
                  <input
                    name="sn"
                    value={formData.sn}
                    onChange={handleChange}
                    onBlur={() => handleSnBlur(formData.sn)}
                    style={inputStyle}
                    placeholder="請輸入或掃描序號"
                  />
                </div>
                <div>
                  <label style={labelStyle}>搭載設備序號 (Server S/N)</label>
                  <input name="server_sn" value={formData.server_sn} onChange={handleChange} style={inputStyle} placeholder="選填：搭載之主機序號" />
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>批次序號清單 (每行一個序號) *</label>
                <textarea rows={4} value={bulkSns} onChange={e => setBulkSns(e.target.value)} placeholder="SN001&#10;SN002&#10;SN003" style={{ ...inputStyle, fontFamily: 'monospace' }} />
              </div>
            )}

            {/* 專案與下單日期 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>專案名稱 (Project)</label>
                <input name="project_name" value={formData.project_name} onChange={handleChange} style={inputStyle} placeholder="輸入或選取專案" />
              </div>
              <div>
                <label style={labelStyle}>訂單來源 (OrderSource)</label>
                <input
                  type="text"
                  name="order_source"
                  value={formData.order_source}
                  onChange={handleChange}
                  style={inputStyle}
                  placeholder="請輸入訂單來源 (例: XeAU Nov2022)"
                />
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
        <HwBatchImportModal
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
        category="硬體"
        onSelect={handlePickCard}
      />
    </div>
  );
};

export default HwRegistrationModal;
