import React, { useState, useEffect, useRef } from 'react';
import { Building, Plus, Edit3, Trash2, X, Check, Image as ImageIcon, Shield, Save, RotateCcw } from 'lucide-react';
import { getCompanyPresets, loadCompanyPresets, saveCompanyPresetWithPrevious, deleteCompanyPreset, presetLogoName, MAX_LOGO_BYTES } from '../utils/companyPresets';
import { logCreate, logUpdate, logDelete, diffFields, fileChange, describeChanges } from '../utils/auditLogger';
import logoImg from '../assets/logo.png';
import './CompanyPresetModal.css';

const emptyForm = {
  id: '',
  label: '',
  logo: logoImg,
  // 上傳 LOGO 的原始檔名（事件紀錄記「舊檔名 → 新檔名」用）
  logoName: '',
  headerRight: '',
  companySignName: ''
};

/** 範本的文字欄位（事件紀錄逐項記變更前 → 變更後，標籤與表單一致） */
const PRESET_FIELDS = [
  { key: 'label', label: '範本名稱' },
  { key: 'headerRight', label: '頁首公司資訊' },
  { key: 'companySignName', label: '單據簽名/受款公司全稱' },
];

/** LOGO 的變更：記檔名；檔名相同但換了一張圖也要記下來 */
const logoChange = (before, after) => {
  const from = presetLogoName(before);
  const to = presetLogoName(after);
  const change = fileChange('LOGO', from, to, 'logo');
  if (change) return change;
  if ((before?.logo || '') !== (after?.logo || '')) return { field: 'logo', label: 'LOGO', from, to: `${to}（重新上傳）`, kind: 'file' };
  return null;
};

/** 範本內容的快照（事件紀錄的變更前／刪除前；不放圖片本身） */
const presetSnapshot = (p) => ({
  label: p?.label || '', headerRight: p?.headerRight || '', companySignName: p?.companySignName || '', logoName: presetLogoName(p),
});

const CompanyPresetModal = ({ isOpen, onClose, onPresetsUpdated }) => {
  const [presets, setPresets] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const [saving, setSaving] = useState(false);

  // 範本存在伺服器上，所有人共用；先顯示手上的，再換成伺服器上最新的
  const loadPresets = async () => {
    setPresets(getCompanyPresets());
    setPresets(await loadCompanyPresets());
  };

  useEffect(() => {
    if (isOpen) {
      loadPresets();
      setIsEditing(false);
      setFormData(emptyForm);
      setErrorMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setFormData(emptyForm);
    setIsEditing(true);
    setErrorMsg('');
  };

  const handleStartEdit = (preset) => {
    setFormData({
      id: preset.id || '',
      label: preset.label || '',
      logo: preset.logo || logoImg,
      logoName: preset.logoName || '',
      headerRight: preset.headerRight || '',
      companySignName: preset.companySignName || ''
    });
    setIsEditing(true);
    setErrorMsg('');
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file && file.size > MAX_LOGO_BYTES) {
      setErrorMsg(`LOGO 圖片不可超過 1 MB（目前 ${(file.size / 1024 / 1024).toFixed(1)} MB）`);
      e.target.value = '';
      return;
    }
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormData(prev => ({ ...prev, logo: event.target.result, logoName: file.name }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.label.trim()) {
      setErrorMsg('請填寫範本名稱');
      return;
    }

    setSaving(true);
    try {
      const isNew = !formData.id;
      const { saved, previous } = await saveCompanyPresetWithPrevious(formData);
      // 範本是所有人共用的，改了什麼要留得下來：逐欄記變更前 → 變更後，LOGO 記檔名
      const details = { id: saved.id, label: saved.label, headerRight: saved.headerRight, companySignName: saved.companySignName, logoName: presetLogoName(saved) };
      if (isNew) {
        logCreate('SETTING', saved.id, saved.label, `新增公司範本 [${saved.label}]`, details);
      } else {
        // 變更前：存之前伺服器上的那一份；讀不到才用畫面上的清單
        const before = previous || presets[formData.id] || {};
        const changes = [...diffFields(before, saved, PRESET_FIELDS), logoChange(before, saved)].filter(Boolean);
        logUpdate('SETTING', saved.id, saved.label,
          `修改公司範本 [${saved.label}]${changes.length ? `：${describeChanges(changes)}` : ''}`,
          { ...details, before: presetSnapshot(before), changes });
      }
      await loadPresets();
      setIsEditing(false);
      setFormData(emptyForm);
      setErrorMsg('');
      if (onPresetsUpdated) {
        onPresetsUpdated(saved.id);
      }
    } catch (err) {
      setErrorMsg(err.message || '儲存範本失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (presetId) => {
    if (window.confirm('確定要刪除此自訂公司範本嗎？\n\n範本是所有人共用的，刪除後其他人也看不到。')) {
      try {
        const removed = (await deleteCompanyPreset(presetId)) || presets[presetId] || null;
        const label = removed?.label || presetId;
        // 刪除前的內容留在事件紀錄裡（含 LOGO 檔名）
        logDelete('SETTING', presetId, label, `刪除公司範本 [${label}]`,
          { id: presetId, label, before: removed ? presetSnapshot(removed) : null });
        await loadPresets();
        if (onPresetsUpdated) {
          onPresetsUpdated('PRESET_B');
        }
      } catch (err) {
        alert(err.message || '刪除失敗');
      }
    }
  };

  return (
    <div className="company-preset-overlay">
      <div className="company-preset-container">
        
        {/* Modal 標題列 */}
        <div className="company-preset-header">
          <h2>
            <Building size={18} color="#3b82f6" />
            公司資訊範本管理
          </h2>
          <button onClick={onClose} className="preset-btn preset-btn-secondary" style={{ padding: '6px' }}>
            <X size={16} />
          </button>
        </div>

        {/* Modal 內容區 */}
        <div className="company-preset-body">
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
            範本存在伺服器上，所有人共用同一份；在這裡修改，其他人列印時也會看到。
          </div>
          
          {/* 現有範本清單 */}
          <div className="preset-list-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-muted)' }}>現有公司範本清單</span>
              {!isEditing && (
                <button onClick={handleStartAdd} className="preset-btn preset-btn-primary">
                  <Plus size={14} /> 新增公司範本
                </button>
              )}
            </div>

            {Object.values(presets).map(preset => (
              <div key={preset.id} className="preset-card">
                <div className="preset-card-left">
                  <img src={preset.logo || logoImg} alt="Logo" className="preset-logo-thumb" />
                  <div className="preset-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="preset-title">{preset.label}</span>
                      {preset.isBuiltin && (
                        <span className="preset-badge-builtin">
                          <Shield size={10} style={{ display: 'inline', marginRight: '3px' }} />
                          系統內建
                        </span>
                      )}
                      {preset.isBuiltin && preset.isModified && (
                        <span 
                          className="preset-badge-builtin" 
                          style={{ 
                            backgroundColor: 'rgba(234, 179, 8, 0.15)', 
                            color: '#facc15', 
                            border: '1px solid rgba(234, 179, 8, 0.3)' 
                          }}
                        >
                          已自訂
                        </span>
                      )}
                    </div>
                    <div className="preset-sub">{preset.headerRight}</div>
                  </div>
                </div>

                <div className="preset-card-actions">
                  <button
                    onClick={() => handleStartEdit(preset)}
                    className="preset-btn preset-btn-secondary"
                    title="編輯此公司範本資訊"
                  >
                    <Edit3 size={13} /> 編輯
                  </button>

                  {/* 內建範本不可刪除，也不提供還原原廠預設：原廠值當初就建錯了，以改過的為準 */}
                  {!preset.isBuiltin && (
                    <button
                      onClick={() => handleDelete(preset.id)}
                      className="preset-btn preset-btn-danger"
                      title="刪除此範本"
                    >
                      <Trash2 size={13} /> 刪除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 新增 / 編輯表單 (無顯示欄位範例文字) */}
          {isEditing && (
            <form onSubmit={handleSave} className="preset-form-section">
              <div className="preset-form-title">
                <span>{formData.id ? '✏️ 編輯公司範本' : '➕ 新增公司範本'}</span>
                <button
                  type="button"
                  onClick={() => { setIsEditing(false); setErrorMsg(''); }}
                  className="preset-btn preset-btn-secondary"
                >
                  取消
                </button>
              </div>

              {errorMsg && (
                <div style={{ color: '#f87171', fontSize: '12px', fontWeight: 700 }}>
                  {errorMsg}
                </div>
              )}

              <div className="preset-form-grid">
                
                {/* 範本名稱 (必填) */}
                <div className="preset-form-group full-width">
                  <label className="preset-form-label">範本名稱 *</label>
                  <input
                    type="text"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    className="preset-form-input"
                    required
                  />
                </div>

                {/* 專屬 LOGO */}
                <div className="preset-form-group full-width">
                  <label className="preset-form-label">專屬 LOGO 圖檔</label>
                  <div className="preset-logo-upload-box">
                    <img src={formData.logo || logoImg} alt="Logo Preview" className="preset-logo-preview" />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="preset-btn preset-btn-secondary"
                    >
                      <ImageIcon size={14} /> 選擇圖檔更換
                    </button>
                    {formData.logo !== logoImg && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, logo: logoImg, logoName: '' })}
                        className="preset-btn preset-btn-secondary"
                      >
                        還原預設 LOGO
                      </button>
                    )}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleLogoUpload}
                      accept="image/*"
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>

                {/* 頁首公司文字 (多行) */}
                <div className="preset-form-group full-width">
                  <label className="preset-form-label">頁首公司資訊 (支援換行)</label>
                  <textarea
                    rows={3}
                    value={formData.headerRight}
                    onChange={(e) => setFormData({ ...formData, headerRight: e.target.value })}
                    className="preset-form-textarea"
                  />
                </div>

                {/* 單據簽名公司名稱 */}
                <div className="preset-form-group full-width">
                  <label className="preset-form-label">單據簽名/受款公司全稱</label>
                  <input
                    type="text"
                    value={formData.companySignName}
                    onChange={(e) => setFormData({ ...formData, companySignName: e.target.value })}
                    className="preset-form-input"
                  />
                </div>

              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => { setIsEditing(false); setErrorMsg(''); }}
                  className="preset-btn preset-btn-secondary"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="preset-btn preset-btn-success"
                  disabled={saving}
                >
                  <Save size={14} /> {saving ? '儲存中…' : '儲存範本'}
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Modal 底部 */}
        <div className="company-preset-footer">
          <button onClick={onClose} className="preset-btn preset-btn-primary">
            關閉
          </button>
        </div>

      </div>
    </div>
  );
};

export default CompanyPresetModal;
