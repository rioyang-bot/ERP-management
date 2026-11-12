import React, { useState } from 'react';
import { X, ClipboardCheck, AlertTriangle } from 'lucide-react';
import {
  ITEMS, TEMP_RANGE, HUMIDITY_RANGE, MAX_TEXT, WEEK_LABEL, emptyCheck, todayYmd, toPayload, validateCheck,
  isAbnormal, tempOutOfRange, humidityOutOfRange, weekOf, rocMonthLabel, periodOf,
} from '../utils/isoRoomCheck';

const labelStyle = { display: 'block', fontWeight: 800, fontSize: '13px', marginBottom: '6px', color: 'var(--text-muted)' };
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '13px', boxSizing: 'border-box' };
const warnStyle = { fontSize: '12px', color: '#be123c', fontWeight: 700, marginTop: '4px' };

const CHOICES = [
  { status: 'NORMAL', label: '正常', color: '#047857' },
  { status: 'ABNORMAL', label: '異常', color: '#be123c' },
];

/**
 * 機房檢查表（S-408-03）新增／修改一週的檢查
 *
 * 日期、時間新增時帶現在，可以改；溫度、溼度填數字（超出管制範圍會標紅，算異常）；
 * 四個項目勾正常或異常（擇一）。有異常就要填說明與處理方式（印在表單的異常狀況說明欄）。
 * 填寫人由伺服器取自登入帳號，不印在表單上（見 server/isoRoomCheckRoutes.js）。
 *
 * @param {{ record?: object|null, onClose: () => void, onSaved: (row: object) => void }} props
 */
const IsoRoomCheckModal = ({ record = null, onClose, onSaved }) => {
  const isEdit = !!record;
  const today = todayYmd();
  const title = `${isEdit ? '修改' : '新增'}機房檢查紀錄`;
  const [form, setForm] = useState(() => (record ? {
    checkDate: record.checkDate,
    checkTime: record.checkTime,
    temperature: String(record.temperature ?? ''),
    humidity: String(record.humidity ?? ''),
    results: { ...record.results },
    abnormalNote: record.abnormalNote || '',
    abnormalAction: record.abnormalAction || '',
  } : emptyCheck()));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setError(''); };

  /** 勾選：正常、異常擇一；再點一次已勾的就取消 */
  const toggle = (key, status) => {
    setForm((f) => ({ ...f, results: { ...f.results, [key]: f.results[key] === status ? '' : status } }));
    setError('');
  };

  const abnormal = isAbnormal(form);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(form.checkDate);
  const week = validDate ? weekOf(form.checkDate) : null;

  const handleSubmit = async () => {
    const payload = toPayload(form);
    const msg = validateCheck(payload, today);
    if (msg) { setError(msg); return; }
    setSaving(true);
    setError('');
    try {
      const res = await window.electronAPI.isoRoomCheck(isEdit ? 'PUT' : 'POST', isEdit ? record.id : null, payload);
      if (res?.success) { onSaved(res.row); return; }
      setError(res?.error || '儲存失敗。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)' }}>
      <div role="dialog" aria-label={title} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '620px', maxWidth: '95vw', padding: '28px', borderRadius: '16px', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', boxShadow: 'var(--modal-shadow)', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardCheck size={22} color="#7c3aed" /> {title}
          </h2>
          <X size={24} aria-label="關閉" style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onClose} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label htmlFor="room-check-date" style={labelStyle}>檢查日期</label>
              <input id="room-check-date" type="date" value={form.checkDate} max={today}
                onChange={(e) => set({ checkDate: e.target.value })} style={{ ...inputStyle, width: '170px' }} />
            </div>
            <div>
              <label htmlFor="room-check-time" style={labelStyle}>時間</label>
              <input id="room-check-time" type="time" value={form.checkTime}
                onChange={(e) => set({ checkTime: e.target.value })} style={{ ...inputStyle, width: '130px' }} />
            </div>
            {week && (
              <span data-testid="room-check-week" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', paddingBottom: '9px' }}>
                記在 {rocMonthLabel(periodOf(form.checkDate))} {WEEK_LABEL[week]}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <div>
              <label htmlFor="room-check-temp" style={labelStyle}>機房溫度（℃，{TEMP_RANGE.min}～{TEMP_RANGE.max}）</label>
              <input id="room-check-temp" type="number" step="0.1" inputMode="decimal" value={form.temperature}
                onChange={(e) => set({ temperature: e.target.value })} style={{ ...inputStyle, width: '170px', ...(tempOutOfRange(form.temperature) ? { borderColor: '#be123c' } : {}) }} />
              {tempOutOfRange(form.temperature) && <div style={warnStyle}>超出管制範圍</div>}
            </div>
            <div>
              <label htmlFor="room-check-humidity" style={labelStyle}>相對溼度（%，{HUMIDITY_RANGE.min}～{HUMIDITY_RANGE.max}）</label>
              <input id="room-check-humidity" type="number" step="0.1" min="0" max="100" inputMode="decimal" value={form.humidity}
                onChange={(e) => set({ humidity: e.target.value })} style={{ ...inputStyle, width: '170px', ...(humidityOutOfRange(form.humidity) ? { borderColor: '#be123c' } : {}) }} />
              {humidityOutOfRange(form.humidity) && <div style={warnStyle}>超出管制範圍</div>}
            </div>
          </div>

          <div>
            <span style={labelStyle}>檢查結果</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {ITEMS.map((item) => {
                const status = form.results[item.key] || '';
                return (
                  <div key={item.key} data-testid={`room-check-item-${item.key}`}
                    style={{ padding: '10px 14px', borderRadius: '10px', border: `1px solid ${status === 'ABNORMAL' ? 'rgba(190, 18, 60, 0.45)' : 'var(--border-color)'}`, backgroundColor: 'var(--bg-surface-subtle)', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: '180px', flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '14px' }}>{item.label}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>{item.detail}</div>
                    </div>
                    {CHOICES.map((c) => (
                      <label key={c.status} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', color: status === c.status ? c.color : 'var(--text-main)' }}>
                        <input type="checkbox" aria-label={`${item.label} ${c.label}`} checked={status === c.status}
                          onChange={() => toggle(item.key, c.status)} style={{ width: '17px', height: '17px', accentColor: c.color, cursor: 'pointer' }} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {abnormal && (
            <div data-testid="room-check-abnormal" style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(190, 18, 60, 0.45)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, color: '#be123c' }}>
                <AlertTriangle size={15} /> 有異常，請說明異常狀況及處理方式（會印在表單的異常狀況說明欄）
              </div>
              <div>
                <label htmlFor="room-check-note" style={labelStyle}>說明</label>
                <textarea id="room-check-note" rows={2} maxLength={MAX_TEXT} value={form.abnormalNote}
                  onChange={(e) => set({ abnormalNote: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div>
                <label htmlFor="room-check-action" style={labelStyle}>處理方式</label>
                <textarea id="room-check-action" rows={2} maxLength={MAX_TEXT} value={form.abnormalAction}
                  onChange={(e) => set({ abnormalAction: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>
          )}

          {error && <div role="alert" style={{ fontSize: '13px', color: '#be123c', fontWeight: 700 }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ padding: '10px 20px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
          <button type="button" onClick={handleSubmit} disabled={saving} style={{ padding: '10px 20px', backgroundColor: '#7c3aed', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}>
            {saving ? '儲存中...' : (isEdit ? '儲存修改' : '新增')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IsoRoomCheckModal;
