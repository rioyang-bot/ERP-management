import React from 'react';
import { X, Columns3, RotateCcw } from 'lucide-react';

/**
 * 自訂顯示欄位的設定視窗。
 *
 * 打勾＝顯示、不打勾＝隱藏。設定會自動儲存於個人帳號下，下次登入沿用。
 * 標示為 always 的欄位（例如操作按鈕）不會出現在此清單，以免整列失去操作入口。
 */
const ColumnVisibilityModal = ({ isOpen, onClose, title, columns, isVisible, onToggle, onShowAll }) => {
  if (!isOpen) return null;

  const hideable = columns.filter((c) => !c.always);
  const visibleCount = hideable.filter((c) => isVisible(c.id)).length;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        className="card-surface"
        style={{
          backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)',
          color: 'var(--text-main)', width: '460px', maxHeight: '85vh',
          padding: '28px 32px', borderRadius: '16px', boxShadow: 'var(--modal-shadow)',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Columns3 size={20} color="var(--primary-color)" /> {title}
          </h2>
          <X size={20} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onClose} />
        </div>

        <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          打勾的欄位會顯示在列表中。取消不需要的欄位可以讓表格變窄、不必左右捲動。
          設定會自動儲存在您的帳號下，下次登入時沿用。
        </p>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '10px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700,
        }}>
          <span>目前顯示 {visibleCount} / {hideable.length} 欄</span>
          <button
            onClick={onShowAll}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              border: 'none', background: 'none', cursor: 'pointer',
              color: 'var(--primary-color)', fontWeight: 700, fontSize: '12px', padding: 0,
            }}
          >
            <RotateCcw size={13} /> 全部顯示
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1 }}>
          {hideable.map((col) => (
            <label
              key={col.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer',
                backgroundColor: isVisible(col.id) ? 'var(--bg-surface-subtle)' : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={isVisible(col.id)}
                onChange={() => onToggle(col.id)}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              <span style={{
                fontSize: '14px',
                color: isVisible(col.id) ? 'var(--text-main)' : 'var(--text-muted)',
                fontWeight: isVisible(col.id) ? 600 : 400,
              }}>
                {col.label}
              </span>
            </label>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '12px', marginTop: '20px',
            backgroundColor: 'var(--primary-color)', color: 'white',
            border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer',
          }}
        >
          完成
        </button>
      </div>
    </div>
  );
};

export default ColumnVisibilityModal;
