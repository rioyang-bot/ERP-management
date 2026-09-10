import React, { useState } from 'react';
import { X, Plus, Trash2, Tag, AlertCircle, CheckCircle2 } from 'lucide-react';

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'var(--bg-modal-overlay, rgba(0, 0, 0, 0.5))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1100,
  backdropFilter: 'blur(4px)',
  padding: '20px'
};

const modalContentStyle = {
  backgroundColor: 'var(--bg-surface, #ffffff)',
  border: '1px solid var(--border-color, #e2e8f0)',
  color: 'var(--text-main, #1e293b)',
  width: '480px',
  maxWidth: '95vw',
  padding: '24px',
  borderRadius: '16px',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
};

const MAX_TAGS = 10;

const ConsumableCustomTagsModal = ({
  isOpen,
  onClose,
  username = 'default',
  tags = [],
  onUpdateTags
}) => {
  const [newTagInput, setNewTagInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage('');
    }, 2000);
  };

  const handleAddTag = (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    const trimmed = newTagInput.trim();
    if (!trimmed) {
      setErrorMessage('請輸入標籤名稱');
      return;
    }

    if (tags.length >= MAX_TAGS) {
      setErrorMessage(`標籤數量已達上限（最多 ${MAX_TAGS} 筆）`);
      return;
    }

    // 檢查是否重複（不分大小寫比對）
    const isDuplicate = tags.some((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (isDuplicate) {
      setErrorMessage(`標籤「${trimmed}」已存在`);
      return;
    }

    const updatedTags = [...tags, trimmed];
    onUpdateTags(updatedTags);
    setNewTagInput('');
    showSuccess(`已新增標籤「${trimmed}」，已自動儲存`);
  };

  const handleDeleteTag = (indexToDelete) => {
    const deletedTagName = tags[indexToDelete];
    const updatedTags = tags.filter((_, idx) => idx !== indexToDelete);
    onUpdateTags(updatedTags);
    setErrorMessage('');
    showSuccess(`已移除標籤「${deletedTagName}」，已自動儲存`);
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div
        style={modalContentStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tag size={20} color="var(--primary-color, #2563eb)" />
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>自訂查詢標籤</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted, #64748b)',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center'
            }}
            aria-label="關閉視窗"
          >
            <X size={20} />
          </button>
        </div>

        {/* 帳號與容量狀態提示 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface-subtle, #f8fafc)',
          padding: '10px 14px',
          borderRadius: '10px',
          marginBottom: '16px',
          fontSize: '13px',
          border: '1px solid var(--border-color, #e2e8f0)'
        }}>
          <div>
            <span style={{ color: 'var(--text-muted, #64748b)' }}>所屬帳號：</span>
            <strong style={{ color: 'var(--text-main, #1e293b)' }}>{username}</strong>
            <span style={{ color: 'var(--text-muted, #64748b)', fontSize: '12px', marginLeft: '6px' }}>(獨立儲存)</span>
          </div>
          <div>
            <span style={{ color: tags.length >= MAX_TAGS ? '#ef4444' : 'var(--primary-color, #2563eb)', fontWeight: 700 }}>
              {tags.length} / {MAX_TAGS}
            </span>
          </div>
        </div>

        {/* 新增標籤輸入區 */}
        <form onSubmit={handleAddTag} style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="輸入自訂標籤文字（例如：METECH）"
              value={newTagInput}
              onChange={(e) => {
                setNewTagInput(e.target.value);
                if (errorMessage) setErrorMessage('');
              }}
              disabled={tags.length >= MAX_TAGS}
              maxLength={20}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1.5px solid var(--input-border, #cbd5e1)',
                backgroundColor: tags.length >= MAX_TAGS ? 'var(--bg-surface-subtle, #f1f5f9)' : 'var(--input-bg, #ffffff)',
                color: 'var(--input-text, #1e293b)',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              disabled={tags.length >= MAX_TAGS || !newTagInput.trim()}
              style={{
                padding: '10px 18px',
                backgroundColor: (tags.length >= MAX_TAGS || !newTagInput.trim()) ? 'var(--text-subtle, #94a3b8)' : 'var(--primary-color, #2563eb)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: (tags.length >= MAX_TAGS || !newTagInput.trim()) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <Plus size={16} /> 新增
            </button>
          </div>
        </form>

        {/* 提示訊息 */}
        {errorMessage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>
            <AlertCircle size={15} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '13px', marginBottom: '12px' }}>
            <CheckCircle2 size={15} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* 標籤列表清單 */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted, #64748b)', marginBottom: '8px' }}>
            已設定標籤列表（點選刪除自動儲存）：
          </div>
          {tags.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '28px 16px',
              backgroundColor: 'var(--bg-surface-subtle, #f8fafc)',
              borderRadius: '10px',
              color: 'var(--text-muted, #64748b)',
              fontSize: '13px',
              border: '1px dashed var(--border-color, #e2e8f0)'
            }}>
              尚未新增任何自訂標籤。<br />
              可於上方輸入常用關鍵字（如：METECH、光學、鏡頭...），方便在列表快速篩選！
            </div>
          ) : (
            <div style={{
              maxHeight: '260px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '4px'
            }}>
              {tags.map((tag, idx) => (
                <div
                  key={`${tag}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-surface-subtle, #f8fafc)',
                    border: '1px solid var(--border-color, #e2e8f0)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      color: 'var(--primary-color, #2563eb)',
                      backgroundColor: 'rgba(37, 99, 235, 0.1)',
                      padding: '2px 6px',
                      borderRadius: '4px'
                    }}>
                      #{idx + 1}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main, #1e293b)' }}>
                      {tag}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteTag(idx)}
                    title={`刪除 ${tag}`}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      padding: '4px 6px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px'
                    }}
                  >
                    <Trash2 size={16} />
                    <span>刪除</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: '16px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              backgroundColor: 'var(--primary-color, #2563eb)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConsumableCustomTagsModal;
