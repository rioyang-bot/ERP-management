import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Save, Trash2, Cpu, Settings2, X, Server, FileSpreadsheet, Check } from 'lucide-react';
import { logCreate } from '../utils/auditLogger';
import HwBatchImportModal from './HwBatchImportModal';

const HwRegistrationModal = ({ isOpen, onClose, onSuccess }) => {
  const [brands, setBrands] = useState([]);
  const [types, setTypes] = useState([]);
  const [models, setModels] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showBatchImport, setShowBatchImport] = useState(false);

  const [activeMgmt, setActiveMgmt] = useState(null);
  const [activeAdd, setActiveAdd] = useState(null);

  const [newBrandName, setNewBrandName] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [newModelName, setNewModelName] = useState('');

  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkSns, setBulkSns] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (isOpen) {
      fetchBrands();
      fetchProjects();
    }
  }, [isOpen, fetchBrands, fetchProjects]);

  if (!isOpen) return null;

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

  const handleSave = async (continueAdd = false) => {
    const safeBrand = validateAndSanitize(formData.brand, '廠牌');
    const safeType = validateAndSanitize(formData.type, '類型');
    const safeModel = validateAndSanitize(formData.model, '型號');
    const safeSpec = validateAndSanitize(formData.specification, '規格');
    const safeServerSn = validateAndSanitize(formData.server_sn, 'Server SN');

    if (!safeBrand || !safeType || !safeModel || !safeSpec?.trim()) {
      return alert('請填寫必填欄位 (廠牌、類型、型號、規格為必填) 並確保符合安全規範');
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
      snList = [formData.sn.trim()];
    }

    setIsSubmitting(true);
    try {
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
        logCreate(
          'HARDWARE',
          isBulkMode ? `批次 ${snList.length} 件` : (formData.sn || '無序號'),
          `${safeBrand} ${safeModel}`,
          `登錄硬體零組件 [${safeBrand} ${safeModel}] ${isBulkMode ? `批次建立 ${successCount} 筆` : `序號: ${formData.sn || '未指定'}`}`,
          { isBulkMode, count: successCount, brand: safeBrand, type: safeType, model: safeModel, snList: isBulkMode ? snList : [formData.sn], server_sn: safeServerSn, project_name: formData.project_name }
        );

        if (onSuccess) onSuccess();

        if (continueAdd) {
          alert(`成功建檔 ${successCount} 筆資料${failCount > 0 ? `，失敗 ${failCount} 筆` : ''}。請繼續輸入下一筆。`);
          setFormData(prev => ({ ...prev, sn: '', server_sn: '', project_name: '' }));
          setBulkSns('');
        } else {
          alert(`成功建檔 ${successCount} 筆資料${failCount > 0 ? `，失敗 ${failCount} 筆` : ''}。`);
          onClose();
        }
      } else {
        alert('建檔失敗。');
      }
    } catch (err) {
      alert('作業錯誤：' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelStyle = { display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' };
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' };
  const iconBtnStyle = { padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center' };

  const modeBtnStyle = (active) => ({
    flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
    backgroundColor: active ? 'var(--primary-color)' : 'var(--bg-surface-subtle)',
    color: active ? '#fff' : 'var(--text-muted)',
    fontWeight: '700', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(5px)', padding: '20px' }}>
      <div style={{ backgroundColor: 'var(--bg-surface)', width: '100%', maxWidth: '900px', maxHeight: '92vh', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Modal Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
              <Cpu size={22} color="var(--primary-color)" /> 新增硬體建檔 (Hardware Registration)
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>管理並登錄伺服器零件、網卡與相關擴充硬體。</p>
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
                    <option value="">請選擇廠牌</option>
                    {brands.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setActiveAdd(activeAdd === 'brand' ? null : 'brand')} style={iconBtnStyle} title="新增廠牌"><Plus size={16} /></button>
                  <button type="button" onClick={() => setActiveMgmt(activeMgmt === 'brand' ? null : 'brand')} style={iconBtnStyle} title="管理廠牌"><Settings2 size={16} /></button>
                </div>
                {activeAdd === 'brand' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input value={newBrandName} onChange={e => setNewBrandName(e.target.value)} placeholder="廠牌名稱" style={inputStyle} />
                    <button type="button" onClick={handleAddBrand} style={{ ...iconBtnStyle, backgroundColor: 'var(--primary-color)', color: '#fff' }}>儲存</button>
                  </div>
                )}
                {activeMgmt === 'brand' && (
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', marginTop: '8px', padding: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                    {brands.map(b => (
                      <div key={b.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
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
                  <select name="type" value={formData.type} onChange={handleChange} style={inputStyle} disabled={!formData.brand} required>
                    <option value="">請選擇類型</option>
                    {types.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button type="button" onClick={() => setActiveAdd(activeAdd === 'type' ? null : 'type')} disabled={!formData.brand} style={iconBtnStyle} title="新增類型"><Plus size={16} /></button>
                  <button type="button" onClick={() => setActiveMgmt(activeMgmt === 'type' ? null : 'type')} disabled={!formData.brand} style={iconBtnStyle} title="管理類型"><Settings2 size={16} /></button>
                </div>
                {activeAdd === 'type' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="類型名稱" style={inputStyle} />
                    <button type="button" onClick={handleAddType} style={{ ...iconBtnStyle, backgroundColor: 'var(--primary-color)', color: '#fff' }}>儲存</button>
                  </div>
                )}
                {activeMgmt === 'type' && (
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', marginTop: '8px', padding: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                    {types.map(t => (
                      <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
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
                  <select name="model" value={formData.model} onChange={handleChange} style={inputStyle} disabled={!formData.type} required>
                    <option value="">請選擇型號</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button type="button" onClick={() => setActiveAdd(activeAdd === 'model' ? null : 'model')} disabled={!formData.type} style={iconBtnStyle} title="新增型號"><Plus size={16} /></button>
                  <button type="button" onClick={() => setActiveMgmt(activeMgmt === 'model' ? null : 'model')} disabled={!formData.type} style={iconBtnStyle} title="管理型號"><Settings2 size={16} /></button>
                </div>
                {activeAdd === 'model' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input value={newModelName} onChange={e => setNewModelName(e.target.value)} placeholder="型號名稱" style={inputStyle} />
                    <button type="button" onClick={handleAddModel} style={{ ...iconBtnStyle, backgroundColor: 'var(--primary-color)', color: '#fff' }}>儲存</button>
                  </div>
                )}
                {activeMgmt === 'model' && (
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', marginTop: '8px', padding: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                    {models.map(m => (
                      <div key={m} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
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
              <textarea name="specification" value={formData.specification} onChange={handleChange} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} placeholder="請輸入硬體核心規格與配置..." required />
            </div>

            {/* 序號輸入區 */}
            {!isBulkMode ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>硬體序號 (S/N)</label>
                  <input name="sn" value={formData.sn} onChange={handleChange} style={inputStyle} placeholder="請輸入或掃描序號" />
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
                <label style={labelStyle}>下單日期 (Order Date)</label>
                <input type="date" name="order_date" value={formData.order_date} onChange={handleChange} style={inputStyle} />
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
    </div>
  );
};

export default HwRegistrationModal;
