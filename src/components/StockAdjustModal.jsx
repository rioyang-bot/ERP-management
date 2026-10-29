import React, { useState } from 'react';
import { X, ClipboardCheck } from 'lucide-react';

/**
 * 耗材盤點調整：把 Stock 改成實盤數量（只調整 Stock，LAB 不在這裡改）
 *
 * 耗材列表與庫存盤點表共用。權限、數量比對、寫事件紀錄都在伺服器
 * （server/stockAdjustRoutes.js）；這裡只負責輸入與顯示差額。
 * 送出時帶上畫面上看到的系統數量，伺服器發現已被別人異動會回 409，
 * 這時把畫面上的系統數量換成最新的，請使用者重新確認。
 */
export const ADJUST_REASONS = ['遺失', '損壞報廢', '領用未登帳', '前次盤點誤差', '找回先前短少', '其他'];

const labelStyle = { display: 'block', fontWeight: 800, fontSize: '13px', marginBottom: '6px', color: 'var(--text-muted)' };
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '13px', boxSizing: 'border-box' };

const StockAdjustModal = ({ item, onClose, onAdjusted }) => {
  const itemMasterId = Number(item.item_master_id || item.id);
  const [systemQty, setSystemQty] = useState(Number(item.stock_qty) || 0);
  const [actual, setActual] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const actualQty = /^\d+$/.test(actual.trim()) ? Number(actual.trim()) : null;
  const diff = actualQty === null ? null : actualQty - systemQty;
  const name = [item.brand, item.model].filter(Boolean).join(' ');
  const unit = item.unit || '';

  const validate = () => {
    if (actualQty === null) return '請輸入實盤數量（0 以上的整數）。';
    if (diff === 0) return '實盤數量與系統數量相同，不需要調整。';
    if (!reason) return '請選擇調整原因。';
    if (reason === '其他' && !note.trim()) return '原因選「其他」時請填寫說明。';
    return '';
  };

  const handleSubmit = async () => {
    const msg = validate();
    if (msg) { setError(msg); return; }
    setSaving(true);
    setError('');
    try {
      const res = await window.electronAPI.stockAdjust({
        itemMasterId, expectedStock: systemQty, actualStock: actualQty, reason, note: note.trim(),
      });
      if (res?.success) {
        onAdjusted({ ...res, itemMasterId });
        return;
      }
      if (res?.status === 409 && Number.isInteger(res.currentStock)) setSystemQty(res.currentStock);
      setError(res?.error || '盤點調整失敗。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)' }}>
      <div role="dialog" aria-label="盤點調整" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '520px', maxWidth: '95vw', padding: '28px', borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--modal-shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardCheck size={22} color="#be123c" /> 盤點調整
          </h2>
          <X size={24} aria-label="關閉" style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onClose} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '6px 12px', padding: '12px 14px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-subtle)', fontSize: '13px', marginBottom: '20px' }}>
          <span style={{ color: 'var(--text-muted)' }}>品項</span><span>{name}{item.type ? `（${item.type}）` : ''}</span>
          {item.specification && (<><span style={{ color: 'var(--text-muted)' }}>規格</span><span>{item.specification}</span></>)}
          <span style={{ color: 'var(--text-muted)' }}>系統 Stock</span>
          <span data-testid="adjust-system-qty" style={{ fontWeight: 800 }}>{systemQty} {unit}</span>
          <span style={{ color: 'var(--text-muted)' }}>LAB</span>
          <span>{Number(item.lab_qty) || 0} {unit}<span style={{ color: 'var(--text-muted)' }}>（不在這裡調整）</span></span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label htmlFor="adjust-actual" style={labelStyle}>實盤數量 (Stock)</label>
            <input id="adjust-actual" type="number" min="0" step="1" inputMode="numeric" value={actual}
              onChange={(e) => { setActual(e.target.value); setError(''); }} style={inputStyle} />
            {diff !== null && diff !== 0 && (
              <div data-testid="adjust-diff" style={{ marginTop: '6px', fontSize: '13px', fontWeight: 800, color: diff < 0 ? '#be123c' : '#047857' }}>
                Stock {systemQty} → {actualQty}（{diff < 0 ? `盤虧 −${-diff}` : `盤盈 +${diff}`}）
              </div>
            )}
          </div>
          <div>
            <label htmlFor="adjust-reason" style={labelStyle}>調整原因</label>
            <select id="adjust-reason" value={reason} onChange={(e) => { setReason(e.target.value); setError(''); }} style={inputStyle}>
              <option value="">請選擇</option>
              {ADJUST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="adjust-note" style={labelStyle}>說明{reason === '其他' ? '（必填）' : '（選填）'}</label>
            <textarea id="adjust-note" rows={3} maxLength={500} value={note}
              onChange={(e) => { setNote(e.target.value); setError(''); }} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          {error && <div role="alert" style={{ fontSize: '13px', color: '#be123c', fontWeight: 700 }}>{error}</div>}
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            調整後系統 Stock 直接改成實盤數量，並記在事件紀錄與品項履歷。LAB 有差異請先用「庫存異動 (Stock↔LAB)」移回 Stock 再調整。
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '10px 20px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
          <button onClick={handleSubmit} disabled={saving} style={{ padding: '10px 20px', backgroundColor: '#be123c', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}>
            {saving ? '調整中...' : '確認調整'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockAdjustModal;
