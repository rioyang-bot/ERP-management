import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Save, Settings2, Trash2, X, Package, Check } from 'lucide-react';
import { logCreate } from '../utils/auditLogger';

const ConsumableRegistrationModal = ({ isOpen, onClose, onSuccess }) => {
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
    if (isOpen) {
      fetchBrands();
    }
  }, [isOpen, fetchBrands]);

  if (!isOpen) return null;

  const handleAddType = async () => {
    const name = validateAndSanitize(newTypeName, '類型名稱');
    if (!name || !formData.brand) return;
    const res = await window.electronAPI.namedQuery('insertDeviceType', ['耗材', formData.brand, name]);
    if (res.success) {
      await fetchTypes(formData.brand);
      setFormData(prev => ({ ...prev, type: name }));
      setNewTypeName('');
      setShowAddType(false);
    }
  };

  const handleDeleteType = async (typeName) => {
    if (!confirm(`確定要刪除「${typeName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceType', [typeName, '耗材', formData.brand]);
    if (res.success) {
      await fetchTypes(formData.brand);
      if (formData.type === typeName) setFormData(prev => ({ ...prev, type: '' }));
    }
  };

  const handleAddBrand = async () => {
    const name = validateAndSanitize(newBrandName, '廠牌名稱');
    if (!name) return;
    const res = await window.electronAPI.namedQuery('insertDeviceBrand', ['耗材', name]);
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
    const res = await window.electronAPI.namedQuery('insertDeviceModel', [formData.brand, formData.type, '耗材', name]);
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
    const res = await window.electronAPI.namedQuery('deleteDeviceModel', [modelName, formData.brand, formData.type, '耗材']);
    if (res.success) {
      await fetchModels(formData.brand, formData.type);
      if (formData.model === modelName) setFormData(prev => ({ ...prev, model: '' }));
    }
  };

  const handleDeleteBrand = async (brandName) => {
    if (!confirm(`確定要刪除「${brandName}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteDeviceBrand', [brandName, '耗材']);
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

  const handleSave = async (continueAdd = false) => {
    if (!formData.type || !formData.brand || !formData.model || !formData.spec?.trim()) {
      return alert('請填寫必填欄位 (廠牌、類型、型號、規格為必填)');
    }

    const checkRes = await window.electronAPI.namedQuery('checkDuplicateConsumable', [
      formData.brand.trim(),
      formData.type.trim(),
      formData.model.trim(),
      formData.spec.trim()
    ]);

    if (checkRes.success && checkRes.rows && checkRes.rows.length > 0) {
      const existing = checkRes.rows[0];
      return alert(
        `⚠️ 無法建立：此耗材品項已經存在！\n\n` +
        `【已存在項目】\n` +
        `• 廠牌：${formData.brand}\n` +
        `• 類型：${formData.type}\n` +
        `• 型號：${formData.model}\n` +
        `• 規格：${existing.specification || '(無)'}\n` +
        `• 目前 Stock 庫存：${existing.stock_qty || 0} / LAB：${existing.lab_qty || 0}\n\n` +
        `系統不允許建立重複的「廠牌 + 類型 + 型號 + 規格」，如需補充庫存請至「進貨入庫」作業。`
      );
    }

    setIsSubmitting(true);
    try {
      const res = await window.electronAPI.namedQuery('insertConsumableMaster', [
        formData.spec.trim(),
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
  const manageItemStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', fontSize: '13px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)' };

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
          <button
            onClick={onClose}
            style={{ width: '36px', height: '36px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
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
              <label style={labelStyle}>規格 (Specification) * <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>(必填)</span></label>
              <textarea name="spec" value={formData.spec} onChange={handleChange} style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} placeholder="請輸入耗材核心規格與配置..." required />
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
    </div>
  );
};

export default ConsumableRegistrationModal;
