import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, ListChecks, Cpu, Server } from 'lucide-react';

/**
 * 出貨單：從清單勾選在庫的設備／硬體
 *
 * 搜尋框一次只能點一台加入，出很多台時很慢。這裡列出所有在庫的資產，
 * 可依關鍵字、廠牌、型號篩選，勾選多台後一次加入。
 *
 * - 已經在出貨單上的不能再勾（含隨設備一起出的搭載硬體）
 * - 掛在設備上的硬體不能單獨勾：它會隨那台設備一起出貨
 *
 * @param {'device'|'hw'} kind
 * @param {object[]} assets      在庫資產（searchActiveAssetSNs）
 * @param {Set<string>} excludedSns 已在出貨單上的序號（小寫）
 * @param {(sns: string[]) => void} onConfirm
 */
const AssetPickerModal = ({ isOpen, kind, assets = [], excludedSns = new Set(), onClose, onConfirm }) => {
  const [keyword, setKeyword] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [picked, setPicked] = useState(() => new Set());

  useEffect(() => {
    if (!isOpen) return;
    setKeyword('');
    setBrand('');
    setModel('');
    setPicked(new Set());
  }, [isOpen, kind]);

  const isDevice = kind === 'device';
  const label = isDevice ? '設備' : '硬體';

  const pool = useMemo(
    () => assets.filter((a) => (isDevice ? a.category_name === '設備' : a.category_name !== '設備' && a.category_name !== '耗材')),
    [assets, isDevice]
  );
  const brands = useMemo(() => [...new Set(pool.map((a) => a.brand).filter(Boolean))].sort(), [pool]);
  const models = useMemo(
    () => [...new Set(pool.filter((a) => !brand || a.brand === brand).map((a) => a.model).filter(Boolean))].sort(),
    [pool, brand]
  );

  const tokens = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = pool.filter((a) => {
    if (brand && a.brand !== brand) return false;
    if (model && a.model !== model) return false;
    if (tokens.length === 0) return true;
    const text = [a.sn, a.brand, a.model, a.type, a.specification, a.location].join(' ').toLowerCase();
    return tokens.every((t) => text.includes(t));
  });

  /** 不能勾的原因；可以勾回傳 null */
  const blockedReason = (a) => {
    if (excludedSns.has((a.sn || '').toLowerCase())) return '已在出貨單上';
    if (!isDevice && a.server_sn) return `掛在 ${a.server_sn} 上，隨設備出貨`;
    return null;
  };
  const selectable = rows.filter((a) => !blockedReason(a));
  const allChecked = selectable.length > 0 && selectable.every((a) => picked.has(a.sn));

  const toggle = (sn) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(sn)) next.delete(sn); else next.add(sn);
    return next;
  });
  const toggleAll = () => setPicked((prev) => {
    const next = new Set(prev);
    if (allChecked) selectable.forEach((a) => next.delete(a.sn));
    else selectable.forEach((a) => next.add(a.sn));
    return next;
  });

  if (!isOpen) return null;

  const selectStyle = { padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '13px', outline: 'none' };
  const th = { padding: '8px 10px', fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textAlign: 'left', position: 'sticky', top: 0, backgroundColor: 'var(--table-header-bg, var(--bg-surface-subtle))', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' };
  const td = { padding: '8px 10px', fontSize: '13px', borderBottom: '1px solid var(--table-border, var(--border-color))', color: 'var(--text-main)' };
  const Icon = isDevice ? Server : Cpu;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.55)', padding: '16px' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-label={`從清單選取${label}`}
        style={{ width: '100%', maxWidth: '1000px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-surface)', borderRadius: '14px', border: '1px solid var(--border-color)', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
              <Icon size={18} color="var(--primary-color)" /> 從清單選取{label}
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              列出所有在庫的{label}，可篩選後勾選多{isDevice ? '台' : '件'}一次加入出貨單。
              {isDevice ? '搭載的硬體與掛載的耗材會跟著設備一起帶入。' : '掛在設備上的硬體會隨設備出貨，不能單獨勾選。'}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="關閉" style={{ width: '34px', height: '34px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '12px 20px', display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="關鍵字：序號、型號、規格、位置…（空白分隔可多個條件）"
              aria-label="搜尋"
              autoFocus
              style={{ ...selectStyle, width: '100%', paddingLeft: '30px', boxSizing: 'border-box' }}
            />
          </div>
          <select value={brand} onChange={(e) => { setBrand(e.target.value); setModel(''); }} aria-label="廠牌" style={selectStyle}>
            <option value="">全部廠牌</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="型號" style={selectStyle}>
            <option value="">全部型號</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: '200px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: '40px' }}>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={selectable.length === 0} aria-label="全選目前列出的" />
                </th>
                <th style={th}>序號 (SN)</th>
                <th style={th}>類型</th>
                <th style={th}>廠牌 / 型號</th>
                <th style={th}>規格</th>
                <th style={th}>位置</th>
                <th style={th}>狀態</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '28px' }}>沒有符合條件的在庫{label}</td></tr>
              ) : rows.map((a) => {
                const reason = blockedReason(a);
                const checked = picked.has(a.sn);
                return (
                  <tr
                    key={a.sn}
                    onClick={() => { if (!reason) toggle(a.sn); }}
                    style={{ cursor: reason ? 'default' : 'pointer', opacity: reason ? 0.5 : 1, backgroundColor: checked ? 'rgba(37, 99, 235, 0.08)' : 'transparent' }}
                    data-testid={`picker-row-${a.sn}`}
                  >
                    <td style={td} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked} disabled={!!reason} onChange={() => toggle(a.sn)} aria-label={`選取 ${a.sn}`} />
                    </td>
                    <td style={{ ...td, fontWeight: 800, fontFamily: 'ui-monospace, Consolas, monospace' }}>{a.sn}</td>
                    <td style={td}>{a.type || '—'}</td>
                    <td style={td}>{[a.brand, a.model].filter(Boolean).join(' ') || '—'}</td>
                    <td style={{ ...td, color: 'var(--text-muted)' }}>{a.specification || '—'}</td>
                    <td style={{ ...td, color: 'var(--text-muted)' }}>{a.location || '—'}</td>
                    <td style={{ ...td, fontSize: '12px', color: reason ? '#d97706' : '#10b981', fontWeight: 700, whiteSpace: 'nowrap' }}>{reason || '在庫'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            列出 {rows.length} 筆，已勾選 <b style={{ color: 'var(--text-main)' }}>{picked.size}</b> {isDevice ? '台' : '件'}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              取消
            </button>
            <button
              type="button"
              onClick={() => onConfirm([...picked])}
              disabled={picked.size === 0}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: '8px', border: 'none', backgroundColor: picked.size === 0 ? 'var(--border-color)' : 'var(--primary-color)', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: picked.size === 0 ? 'not-allowed' : 'pointer' }}
            >
              <ListChecks size={15} /> 加入出貨單 ({picked.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetPickerModal;
