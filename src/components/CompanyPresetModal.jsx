import React, { useState, useEffect, useRef } from 'react';
import { Building, Plus, Edit3, Trash2, X, Check, Image as ImageIcon, Shield, Save, RotateCcw } from 'lucide-react';
import { getCompanyPresets, saveCompanyPreset, deleteCompanyPreset, resetBuiltinCompanyPreset, DEFAULT_BUILTIN_PRESETS } from '../utils/companyPresets';
import logoImg from '../assets/logo.png';
import './CompanyPresetModal.css';

const emptyForm = {
  id: '',
  label: '',
  logo: logoImg,
  headerRight: '',
  companySignName: '',
  dealerName: '',
  dealerSales: '',
  dealerPhone: '',
  dealerAddress: ''
};

const CompanyPresetModal = ({ isOpen, onClose, onPresetsUpdated }) => {
  const [presets, setPresets] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const loadPresets = () => {
    const list = getCompanyPresets();
    setPresets(list);
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
      headerRight: preset.headerRight || '',
      companySignName: preset.companySignName || '',
      dealerName: preset.dealerName || '',
      dealerSales: preset.dealerSales || '',
      dealerPhone: preset.dealerPhone || '',
      dealerAddress: preset.dealerAddress || ''
    });
    setIsEditing(true);
    setErrorMsg('');
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormData(prev => ({ ...prev, logo: event.target.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!formData.label.trim()) {
      setErrorMsg('請填寫範本名稱');
      return;
    }

    try {
      const saved = saveCompanyPreset(formData);
      loadPresets();
      setIsEditing(false);
      setFormData(emptyForm);
      setErrorMsg('');
      if (onPresetsUpdated) {
        onPresetsUpdated(saved.id);
      }
    } catch (err) {
      setErrorMsg(err.message || '儲存範本失敗');
    }
  };

  const handleResetBuiltin = (presetId) => {
    if (window.confirm('確定要將此內建範本還原為原廠預設值嗎？')) {
      try {
        resetBuiltinCompanyPreset(presetId);
        loadPresets();
        if (onPresetsUpdated) {
          onPresetsUpdated(presetId);
        }
      } catch (err) {
        alert(err.message || '還原失敗');
      }
    }
  };

  const handleDelete = (presetId) => {
    if (window.confirm('確定要刪除此自訂公司範本嗎？')) {
      try {
        deleteCompanyPreset(presetId);
        loadPresets();
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

                  {preset.isBuiltin ? (
                    preset.isModified && (
                      <button
                        onClick={() => handleResetBuiltin(preset.id)}
                        className="preset-btn preset-btn-secondary"
                        title="還原為原廠預設資訊"
                      >
                        <RotateCcw size={13} /> 還原
                      </button>
                    )
                  ) : (
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
                        onClick={() => setFormData({ ...formData, logo: logoImg })}
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

                {/* 經銷商名稱 */}
                <div className="preset-form-group">
                  <label className="preset-form-label">經銷商/公司名稱</label>
                  <input
                    type="text"
                    value={formData.dealerName}
                    onChange={(e) => setFormData({ ...formData, dealerName: e.target.value })}
                    className="preset-form-input"
                  />
                </div>

                {/* 經銷商聯絡電話 */}
                <div className="preset-form-group">
                  <label className="preset-form-label">聯絡電話</label>
                  <input
                    type="text"
                    value={formData.dealerPhone}
                    onChange={(e) => setFormData({ ...formData, dealerPhone: e.target.value })}
                    className="preset-form-input"
                  />
                </div>

                {/* 經銷商地址 */}
                <div className="preset-form-group full-width">
                  <label className="preset-form-label">公司地址</label>
                  <input
                    type="text"
                    value={formData.dealerAddress}
                    onChange={(e) => setFormData({ ...formData, dealerAddress: e.target.value })}
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
                >
                  <Save size={14} /> 儲存範本
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
