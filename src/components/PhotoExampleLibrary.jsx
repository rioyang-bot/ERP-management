import React, { useState } from 'react';
import { BookImage, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { logCreate, logDelete, logUpdate } from '../utils/auditLogger';

/**
 * 拍照項目範例
 *
 * 使用者自己維護的常用拍照項目（項目 + 說明）。新增拍照項目時可以直接
 * 選取範例加入，不必每個主項目都重打一次拍攝指示。
 *
 * 範例只是新增時的來源：從範例加進主項目之後就是獨立的一筆，
 * 之後在這裡修改或刪除範例，都不會回頭改動已經加進去的拍照項目。
 */
const PhotoExampleLibrary = ({ examples = [], onChanged, card, inputStyle, iconBtn }) => {
  const [draft, setDraft] = useState({ name: '', description: '' });
  const [editing, setEditing] = useState(null); // { id, name, description, _origName }

  const textareaStyle = { ...inputStyle, minHeight: '64px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 };

  const handleAdd = async (e) => {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) return alert('請輸入範例的拍照項目名稱');
    try {
      const res = await window.electronAPI.namedQuery('insertChecklistPhotoExample', [name, draft.description, examples.length]);
      if (!res.success) throw new Error(res.error || '新增失敗');
      logCreate('SETTING', res.rows?.[0]?.id, name, `新增拍照項目範例 [${name}]`, { name, description: draft.description.trim() || null });
      setDraft({ name: '', description: '' });
      if (onChanged) await onChanged();
    } catch (err) {
      alert(`新增範例失敗：${err.message}\n（範例名稱不可重複）`);
    }
  };

  const handleSave = async () => {
    const name = (editing.name || '').trim();
    if (!name) return alert('請輸入範例的拍照項目名稱');
    try {
      const res = await window.electronAPI.namedQuery('updateChecklistPhotoExample', [name, editing.description, editing.id]);
      if (!res.success || (res.rows || []).length === 0) throw new Error(res.error || '找不到這個範例');
      logUpdate('SETTING', editing.id, name, `修改拍照項目範例 [${editing._origName}]${editing._origName !== name ? ` → [${name}]` : ''}`,
        { name, description: (editing.description || '').trim() || null });
      setEditing(null);
      if (onChanged) await onChanged();
    } catch (err) {
      alert(`修改範例失敗：${err.message}`);
    }
  };

  const handleDelete = async (ex) => {
    if (!window.confirm(`確定要刪除範例 [${ex.name}] 嗎？\n\n已經從這個範例加進主項目的拍照項目不受影響。`)) return;
    try {
      const res = await window.electronAPI.namedQuery('deleteChecklistPhotoExample', [ex.id]);
      if (!res.success) throw new Error(res.error || '刪除失敗');
      logDelete('SETTING', ex.id, ex.name, `刪除拍照項目範例 [${ex.name}]`, { name: ex.name });
      if (onChanged) await onChanged();
    } catch (err) {
      alert(`刪除範例失敗：${err.message}`);
    }
  };

  return (
    <div style={{ ...card, padding: '16px', marginTop: '20px' }} data-testid="photo-example-library">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <BookImage size={18} color="#ea580c" />
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: 'var(--text-main)' }}>拍照項目範例</h3>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>({examples.length})</span>
      </div>
      <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        常用的拍照項目與拍攝說明存在這裡，新增拍照項目時可以從「從範例加入」直接選取。
        修改或刪除範例，不會影響已經加進主項目的拍照項目。
      </p>

      <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="範例項目，例如：正面"
            aria-label="範例項目名稱"
            style={inputStyle}
          />
          <button
            type="submit"
            aria-label="新增範例"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0 14px', borderRadius: '8px', border: 'none', backgroundColor: '#ea580c', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            <Plus size={15} /> 新增範例
          </button>
        </div>
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder={'拍攝說明，例如：\n1. 關機狀態，正面平視\n2. 前面板與序號貼紙都要清楚入鏡'}
          aria-label="範例說明"
          style={textareaStyle}
        />
      </form>

      {examples.length === 0 ? (
        <div style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          還沒有任何範例
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
          {examples.map((ex) => (
            <div key={ex.id} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)' }}>
              {editing?.id === ex.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    aria-label="修改範例項目名稱"
                    style={inputStyle}
                    autoFocus
                  />
                  <textarea
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    aria-label="修改範例說明"
                    style={textareaStyle}
                  />
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={handleSave} style={iconBtn('#10b981')} title="儲存" aria-label="儲存範例"><Check size={14} /></button>
                    <button type="button" onClick={() => setEditing(null)} style={iconBtn('var(--text-muted)')} title="取消" aria-label="取消修改範例"><X size={14} /></button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', wordBreak: 'break-word' }}>{ex.name}</div>
                    {ex.description && (
                      <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
                        {ex.description}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing({ id: ex.id, name: ex.name, description: ex.description || '', _origName: ex.name })}
                    style={iconBtn('#f59e0b')}
                    title="修改範例"
                    aria-label={`修改範例 ${ex.name}`}
                  >
                    <Pencil size={13} />
                  </button>
                  <button type="button" onClick={() => handleDelete(ex)} style={iconBtn('#ef4444')} title="刪除範例" aria-label={`刪除範例 ${ex.name}`}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PhotoExampleLibrary;
