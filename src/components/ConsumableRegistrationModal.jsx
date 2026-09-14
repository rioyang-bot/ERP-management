import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Save, Settings2, Trash2, X, Package, Check, FileSpreadsheet, Layers } from 'lucide-react';
import { logCreate } from '../utils/auditLogger';
import CardPickerModal from './CardPickerModal';
import ConsumableBatchImportModal from './ConsumableBatchImportModal';
import { normalizeMasterName } from '../utils/normalizeMasterData';

const ConsumableRegistrationModal = ({ isOpen, onClose, onSuccess }) => {
  const [types, setTypes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [showAddType, setShowAddType] = useState(false);
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newBrandName, setNewBrandName] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [models, setModels] = useState([]);
  const [formData, setFormData] = useState({ type: '', brand: '', model: '', spec: '', safety_stock: 0, stock_qty: 0 });
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

  // 這次建檔中新輸入、但還沒真正建立的類型／廠牌／型號。
  // 下拉選單已改讀「既有卡片」，新值在存檔前還沒有卡片、查不到，
  // 因此先暫存在這裡讓使用者選得到；按下儲存建立卡片後就會自然出現在清單中。
  // 取消建檔則什麼都不會留下。
  const [showCardPicker, setShowCardPicker] = useState(false);

  // 從既有卡片一次帶入類型／廠牌／型號。
  // 耗材的「型號/規格」在畫面上是同一欄（model），另有一個規格欄位 spec。
  const handlePickCard = async (card) => {
    // 先確保各下拉的選項清單含有帶入的值，否則 select 會顯示空白
    setTypes(prev => (prev.includes(card.type) ? prev : [...prev, card.type]));
    setBrands(prev => (prev.some(b => b.name === card.brand) ? prev : [...prev, { id: 'card-' + card.brand, name: card.brand }]));
    await fetchModels(card.brand, card.type);
    setModels(prev => (prev.includes(card.model) ? prev : [...prev, card.model]));
    setFormData(prev => ({
      ...prev,
      type: card.type || '',
      brand: card.brand || '',
      model: card.model || '',
      spec: card.specification || prev.spec,
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

  const fetchTypes = useCallback(async (brandName, currentType = '') => {
    if (!brandName) { setTypes([]); return { typeNames: [], nextType: '' }; }
    const res = await window.electronAPI.namedQuery('fetchConsumableTypes', []);
    if (res.success) {
      const typeNames = withPending(res.rows.map(r => r.name), 'types');
      setTypes(typeNames);
      const nextType = typeNames.includes(currentType) ? currentType : (typeNames[0] || '');
      setFormData(prev => ({ ...prev, type: nextType }));
      return { typeNames, nextType };
    }
    return { typeNames: [], nextType: '' };
  }, []);

  const fetchModels = useCallback(async (brandName, typeName) => {
    if (!brandName || !typeName) { setModels([]); return { modelNames: [] }; }
    const res = await window.electronAPI.namedQuery('fetchConsumableModelsByBrand', [brandName]);
    if (res.success) {
      const modelNames = withPending(res.rows.map(r => r.name), 'models');
      setModels(modelNames);
      setFormData(prev => ({ ...prev, model: modelNames.includes(prev.model) ? prev.model : (modelNames[0] || '') }));
      return { modelNames };
    }
    return { modelNames: [] };
  }, []);

  const fetchBrands = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchConsumableBrands');
    if (res.success) {
      setBrands(brandRowsWithPending(res.rows));
      if (!formData.brand && res.rows.length > 0) {
        const initialBrand = res.rows[0].name;
        setFormData(prev => ({ ...prev, brand: initialBrand }));
        const { nextType } = await fetchTypes(initialBrand);
        if (nextType) await fetchModels(initialBrand, nextType);
      }
    }
  }, [formData.brand, fetchTypes, fetchModels]);

  useEffect(() => {
    if (isOpen) {
      fetchBrands();
    }
  }, [isOpen, fetchBrands]);

  if (!isOpen) return null;

  const handleAddType = async () => {
    const name = normalizeMasterName(validateAndSanitize(newTypeName, '類型名稱'));
    if (!name || !formData.brand) return;
    setPending(prev => ({ ...prev, types: [...new Set([...prev.types, name])] }));
    setTypes(prev => (prev.includes(name) ? prev : [...prev, name]));
    {
      setFormData(prev => ({ ...prev, type: name }));
      setNewTypeName('');
      setShowAddType(false);
    }
  };


  const handleAddBrand = async () => {
    const name = normalizeMasterName(validateAndSanitize(newBrandName, '廠牌名稱'));
    if (!name) return;
    setPending(prev => ({ ...prev, brands: [...new Set([...prev.brands, name])] }));
    setBrands(prev => (prev.some(b => b.name === name) ? prev : [...prev, { id: 'pending-' + name, name }]));
    {
      setFormData({ ...formData, brand: name });
      setNewBrandName('');
      setShowAddBrand(false);
    }
  };

  const handleAddModel = async () => {
    const name = normalizeMasterName(validateAndSanitize(newModelName, '型號名稱'));
    if (!name || !formData.brand || !formData.type) return;
    setPending(prev => ({ ...prev, models: [...new Set([...prev.models, name])] }));
    setModels(prev => (prev.includes(name) ? prev : [...prev, name]));
    {
      setFormData(prev => ({ ...prev, model: name }));
      setNewModelName('');
      setShowAddModel(false);
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

  const handleSave = async (continueAdd = false) => {
    if (!formData.type || !formData.brand || !formData.model) {
      return alert('請填寫必填欄位 (廠牌、類型、型號/規格為必填)');
    }

    const trimmedSpec = (formData.spec || '').trim();

    const checkRes = await window.electronAPI.namedQuery('checkDuplicateConsumable', [
      formData.brand.trim(),
      formData.type.trim(),
      formData.model.trim(),
      trimmedSpec
    ]);

    if (checkRes.success && checkRes.rows && checkRes.rows.length > 0) {
      const existing = checkRes.rows[0];
      return alert(
        `⚠️ 無法建立：此耗材品項已經存在！\n\n` +
        `【已存在項目】\n` +
        `• 廠牌：${formData.brand}\n` +
        `• 類型：${formData.type}\n` +
        `• 型號/規格：${formData.model}\n` +
        `• 備註：${existing.specification || '(無)'}\n` +
        `• 目前 Stock 庫存：${existing.stock_qty || 0} / LAB：${existing.lab_qty || 0}\n\n` +
        `系統不允許建立重複的「廠牌 + 類型 + 型號/規格 + 備註」，如需補充庫存請至「進貨入庫」作業。`
      );
    }

    setIsSubmitting(true);
    try {
      const res = await window.electronAPI.namedQuery('insertConsumableMaster', [
        trimmedSpec,
        formData.type,
        formData.brand,
        formData.model,
        '個',
        Number(formData.safety_stock || 0),
        Number(formData.stock_qty || 0),
        '耗材'
      ]);

      if (res.success) {
        logCreate(
          'CONSUMABLE',
          `${formData.brand}-${formData.model}`,
          `${formData.brand} ${formData.model}`,
          `建立耗材物料 [${formData.brand} ${formData.model}] 規格: ${formData.spec.trim()} 初始庫存: ${formData.stock_qty || 0}`,
          { brand: formData.brand, type: formData.type, model: formData.model, spec: formData.spec.trim(), stock_qty: formData.stock_qty, safety_stock: formData.safety_stock }
        );

        if (onSuccess) onSuccess();

        if (continueAdd) {
          alert('耗材建檔成功！請繼續輸入下一筆。');
          setFormData(prev => ({
            ...prev,
            model: '',
            spec: '',
            stock_qty: 0
          }));
        } else {
          alert('耗材建檔成功！');
          onClose();
        }
      } else {
        console.error('Registration Error:', res.error);
        alert('⚠️ 儲存失敗：請確認輸入格式無誤，或聯繫技術人員。');
      }
    } catch (err) {
      alert('建檔失敗: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelStyle = { display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '8px' };
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' };
  const iconButtonStyle = { padding: '8px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', cursor: 'pointer' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(5px)', padding: '20px' }}>
      <div style={{ backgroundColor: 'var(--bg-surface)', width: '100%', maxWidth: '850px', maxHeight: '90vh', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Modal Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
              <Package size={22} color="var(--primary-color)" /> 新增耗材主檔 (Consumable Registration)
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>建立新的耗材品項分類、型號規格並設定安全庫存水準。</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setShowBatchImport(true)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                color: '#10b981',
                fontSize: '13px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <FileSpreadsheet size={16} /> 批次匯入 (Batch Import)
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ width: '36px', height: '36px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
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
                </div>
                {showAddBrand && (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <input placeholder="新廠牌名稱" value={newBrandName} onChange={e => setNewBrandName(e.target.value)} style={inputStyle} />
                    <button type="button" onClick={handleAddBrand} style={{ ...iconButtonStyle, backgroundColor: 'var(--primary-color)', color: '#fff' }}>儲存</button>
                  </div>
                )}
              </div>

              {/* 類型 */}
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
                    title="從既有卡片一次帶入類型、廠牌與型號/規格"
                  >
                    <Layers size={12} /> 從既有卡片選取
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select name="type" value={formData.type} onChange={handleChange} style={inputStyle} required>
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

              {/* 型號/規格 */}
              <div>
                <label style={labelStyle}>型號/規格 (Model / Spec) *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select name="model" value={formData.model} onChange={handleChange} style={inputStyle} required>
                    <option value="">選擇型號/規格</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowAddModel(!showAddModel)} style={iconButtonStyle} title="新增型號/規格"><Plus size={16} /></button>
                </div>
                {showAddModel && (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <input placeholder="新型號/規格名稱" value={newModelName} onChange={e => setNewModelName(e.target.value)} style={inputStyle} />
                    <button type="button" onClick={handleAddModel} style={{ ...iconButtonStyle, backgroundColor: 'var(--primary-color)', color: '#fff' }}>儲存</button>
                  </div>
                )}
              </div>
            </div>

            {/* 備註 */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>備註 (Remarks) <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(選填)</span></label>
              <textarea name="spec" value={formData.spec} onChange={handleChange} style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} placeholder="請輸入耗材備註說明 (選填)..." />
            </div>

            {/* 初始庫存與安全庫存 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>初始庫存數量 (Initial Qty)</label>
                <input type="number" name="stock_qty" min="0" value={formData.stock_qty} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>安全庫存警示量 (Safety Stock)</label>
                <input type="number" name="safety_stock" min="0" value={formData.safety_stock} onChange={handleChange} style={inputStyle} />
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
        <ConsumableBatchImportModal
          isOpen={showBatchImport}
          onClose={() => setShowBatchImport(false)}
          onSuccess={() => {
            if (onSuccess) onSuccess();
            setShowBatchImport(false);
            onClose();
          }}
        />
      )}
      <CardPickerModal
        isOpen={showCardPicker}
        onClose={() => setShowCardPicker(false)}
        category="耗材"
        onSelect={handlePickCard}
      />
    </div>
  );
};

export default ConsumableRegistrationModal;
