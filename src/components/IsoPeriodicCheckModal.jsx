import React, { useState } from 'react';
import { X, ClipboardCheck, UserRound } from 'lucide-react';
import { emptyResults, todayYmd, validateCheck, toPayload } from '../utils/isoPeriodicCheck';

const labelStyle = { display: 'block', fontWeight: 800, fontSize: '13px', marginBottom: '6px', color: 'var(--text-muted)' };
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '13px', boxSizing: 'border-box' };

const CHOICES = [
  { status: 'NORMAL', label: '正常', color: '#047857' },
  { status: 'ABNORMAL', label: '異常', color: '#be123c' },
];

/**
 * ISO 定期檢查（S-409-01 備份檢查、S-409-02 日誌審查）新增／修改一次
 *
 * 日期新增時帶今天，可以改；每個項目勾正常或異常（擇一），異常要寫說明，
 * 備份檢查勾正常要填最後備份日（文字）。
 * 檢查人員不能改：新增時是目前登入的帳號，修改時維持原本的人（伺服器決定，見 server/isoPeriodicCheckRoutes.js）。
 *
 * @param {{ def: object, record?: object|null, reviewerName: string, onClose: () => void, onSaved: (row: object) => void }} props
 */
const IsoPeriodicCheckModal = ({ def, record = null, reviewerName, onClose, onSaved }) => {
  const isEdit = !!record;
  const today = todayYmd();
  const title = `${isEdit ? '修改' : '新增'}${def.docName}`;
  const [checkDate, setCheckDate] = useState(record?.checkDate || today);
  const [results, setResults] = useState(() => emptyResults(def).map((r) => {
    const old = (record?.results || []).find((x) => x.key === r.key);
    return old ? { ...r, status: old.status || '', note: old.note || '', ...(def.lastBackup ? { lastBackup: old.lastBackup || '' } : {}) } : r;
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const setResult = (key, patch) => {
    setResults((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setError('');
  };

  /** 勾選：正常、異常擇一；再點一次已勾的就取消 */
  const toggle = (key, status) => {
    setResults((prev) => prev.map((r) => (r.key === key ? { ...r, status: r.status === status ? '' : status } : r)));
    setError('');
  };

  const handleSubmit = async () => {
    const payload = toPayload(def, checkDate, results);
    const msg = validateCheck(def, payload, today);
    if (msg) { setError(msg); return; }
    setSaving(true);
    setError('');
    try {
      const res = await window.electronAPI.isoCheck(isEdit ? 'PUT' : 'POST', def.code, isEdit ? record.id : null, payload);
      if (res?.success) { onSaved(res.row); return; }
      setError(res?.error || '儲存失敗。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)' }}>
      <div role="dialog" aria-label={title} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '580px', maxWidth: '95vw', padding: '28px', borderRadius: '16px', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', boxShadow: 'var(--modal-shadow)', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardCheck size={22} color="#0f766e" /> {title}
          </h2>
          <X size={24} aria-label="關閉" style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onClose} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label htmlFor="iso-check-date" style={labelStyle}>{def.verb}日期</label>
            <input id="iso-check-date" type="date" value={checkDate} max={today}
              onChange={(e) => { setCheckDate(e.target.value); setError(''); }} style={{ ...inputStyle, maxWidth: '220px' }} />
          </div>

          <div>
            <span style={labelStyle}>{def.verb}結果</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {def.items.map((item) => {
                const r = results.find((x) => x.key === item.key);
                return (
                  <div key={item.key} data-testid={`iso-check-item-${item.key}`}
                    style={{ padding: '12px 14px', borderRadius: '10px', border: `1px solid ${r?.status === 'ABNORMAL' ? 'rgba(190, 18, 60, 0.45)' : 'var(--border-color)'}`, backgroundColor: 'var(--bg-surface-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: '150px', flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: '14px' }}>{item.label}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.detail}</div>
                      </div>
                      {CHOICES.map((c) => (
                        <label key={c.status} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', color: r?.status === c.status ? c.color : 'var(--text-main)' }}>
                          <input type="checkbox" aria-label={`${item.label} ${c.label}`} checked={r?.status === c.status}
                            onChange={() => toggle(item.key, c.status)} style={{ width: '17px', height: '17px', accentColor: c.color, cursor: 'pointer' }} />
                          {c.label}
                        </label>
                      ))}
                    </div>
                    {def.lastBackup && r?.status === 'NORMAL' && (
                      <input type="text" aria-label={`${item.label} 最後備份日`} placeholder="最後備份日（必填，例如 115/11/10）" maxLength={100} value={r.lastBackup}
                        onChange={(e) => setResult(item.key, { lastBackup: e.target.value })} style={{ ...inputStyle, marginTop: '10px' }} />
                    )}
                    {r?.status === 'ABNORMAL' && (
                      <input type="text" aria-label={`${item.label} 異常說明`} placeholder="異常說明（必填）" maxLength={500} value={r.note}
                        onChange={(e) => setResult(item.key, { note: e.target.value })} style={{ ...inputStyle, marginTop: '10px' }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <UserRound size={15} color="var(--text-muted)" />
            <span style={{ color: 'var(--text-muted)', fontWeight: 800 }}>{def.verb}人員</span>
            <span data-testid="iso-check-reviewer" style={{ fontWeight: 800 }}>{reviewerName}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-subtle)' }}>{isEdit ? `（維持原${def.verb}人員）` : '（目前登入的帳號）'}</span>
          </div>

          {error && <div role="alert" style={{ fontSize: '13px', color: '#be123c', fontWeight: 700 }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ padding: '10px 20px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
          <button type="button" onClick={handleSubmit} disabled={saving} style={{ padding: '10px 20px', backgroundColor: '#0f766e', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}>
            {saving ? '儲存中...' : (isEdit ? '儲存修改' : '新增')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IsoPeriodicCheckModal;
