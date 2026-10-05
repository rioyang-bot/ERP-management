import React, { useEffect, useState } from 'react';
import { Tag, AlertCircle } from 'lucide-react';
import { logUpdate } from '../utils/auditLogger';
import './detail/DetailModal.css';
import { summarizeBrandUsage, auditModuleFor } from '../utils/brandRename';
import { ITEM_FIX_FIELDS, validateFieldFix } from '../utils/itemFieldFix';

/**
 * 品項欄位更正視窗：廠牌、型號、規格（見 utils/itemFieldFix.js）
 *
 * 一張進貨單不一定全是同一個廠牌／型號，因此有兩種用法：
 *   - mode="all"：表頭的按鈕。用到這個值的品項全部更正
 *     （這張單有好幾個值時先選要改哪一個）。
 *   - mode="item"：每一列的按鈕。只改這一個品項，同值的其他品項不動。
 *
 * @param {object} props
 * @param {'brand'|'model'|'specification'} props.field
 * @param {'all'|'item'} props.mode
 * @param {string[]} [props.values] mode="all"：這張單上這個欄位的值
 * @param {{ item_id: number, brand?: string, type?: string, model?: string, specification?: string, category_name?: string }} [props.item] mode="item"
 * @param {() => void} props.onClose
 * @param {(newValue: string) => void} props.onRenamed
 */
const ItemFieldFixModal = ({ field = 'brand', mode = 'all', values = [], item, onClose, onRenamed }) => {
  const f = ITEM_FIX_FIELDS[field];
  const single = mode === 'item';
  const [current, setCurrent] = useState(single ? (item?.[field] || '') : values[0]);
  const [usage, setUsage] = useState(null); // null＝讀取中
  const [loadError, setLoadError] = useState(null);
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setUsage(null);
    setLoadError(null);
    (async () => {
      const res = single
        ? await window.electronAPI.namedQuery('fetchItemMasterUsage', [item.item_id])
        : await window.electronAPI.namedQuery(f.usageQuery, [current]);
      if (!alive) return;
      if (res.success) setUsage(res.rows || []);
      else setLoadError(res.error || '無法讀取品項');
    })();
    return () => { alive = false; };
  }, [single, item?.item_id, current, f.usageQuery]);

  const summary = summarizeBrandUsage(usage || []);
  const itemLabel = (m) => [m.type, m.brand, m.model, m.specification].filter(Boolean).join(' ');
  const shown = (v) => (v ? v : '（空白）');

  const handleSave = async () => {
    const invalid = validateFieldFix(field, current, newValue, single);
    if (invalid) { alert(invalid); return; }
    const next = f.normalize(newValue);

    setSaving(true);
    try {
      const conflictRes = single
        ? await window.electronAPI.namedQuery(f.singleConflictQuery, [item.item_id, next])
        : await window.electronAPI.namedQuery(f.conflictsQuery, [current, next]);
      if (!conflictRes.success) throw new Error(conflictRes.error || '無法檢查是否與既有品項重複');
      if ((conflictRes.rows || []).length > 0) {
        alert(
          `無法更正：${f.label}改成「${shown(next)}」後，以下品項會和已經存在的品項重複：\n\n`
          + conflictRes.rows.map((r) => `　· ${r.category_name} ${itemLabel(r)}`).join('\n')
          + '\n\n這種情況要把兩張品項合併（資產、單據、庫存都要一起搬），請聯絡系統管理者處理。'
        );
        return;
      }

      const cats = Object.entries(summary.byCategory).map(([c, n]) => `${c} ${n} 個`).join('、');
      const assetsText = summary.assets > 0 ? `，共 ${summary.assets} 筆資產` : '';
      if (!window.confirm(single
        ? `確定把「${itemLabel(usage[0] || item)}」的${f.label}從「${shown(current)}」改成「${shown(next)}」嗎？\n\n`
          + `只改這一個品項${assetsText}；其他${f.label}是「${shown(current)}」的品項不動。`
        : `確定把${f.label}「${current}」更正為「${next}」嗎？\n\n`
          + `會一起改到 ${summary.masters} 個品項（${cats}）${assetsText}。\n`
          + '用到這些品項的所有單據、列表都會顯示新的內容。'
      )) return;

      const steps = single
        ? f.buildSingleSteps(item.item_id, current, next)
        : f.buildAllSteps(current, next, summary.masters);
      const res = await window.electronAPI.runTransaction(steps);
      if (!res.success) throw new Error(res.error || '更正失敗');

      // 每個品項各記一筆，打開品項履歷才看得到這次更正
      await Promise.all((usage || []).map((m) => logUpdate(
        auditModuleFor(m.category_name),
        m.id,
        [m.brand, m.model].filter(Boolean).join(' ') || f.label,
        `${f.label}更正 [${shown(current)}] → [${shown(next)}]（${[m.type, m.brand, m.model].filter(Boolean).join(' ')}）`,
        { itemMasterId: m.id, field, from: current || null, to: next || null, scope: single ? 'item' : 'all' }
      )));

      alert(single
        ? `已將這個品項的${f.label}改成「${shown(next)}」。`
        : `${f.label}已更正為「${next}」，共 ${summary.masters} 個品項。`);
      onRenamed(next);
    } catch (err) {
      alert(`${f.label}更正失敗：` + err.message);
    } finally {
      setSaving(false);
    }
  };

  const title = single ? `更正這個品項的${f.label}` : `一次更正${f.label}（全部品項）`;
  const saveDisabled = saving || usage === null || !!loadError || (!newValue.trim() && !(single && f.allowEmpty));

  return (
    <div className="dm-overlay" style={{ zIndex: 1200 }}>
      <div className="dm-modal" role="dialog" aria-label={title} style={{ width: '600px', padding: '24px' }}>
        <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
          <Tag size={20} color="#d97706" /> {title}
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
          {single
            ? `只改這一個品項的${f.label}，其他同${f.label}的品項不動。這個品項在每張單據、每筆資產上都會顯示新的內容。`
            : `用到這個${f.label}的品項會全部更正。資產、庫存與單據都不受影響，只是顯示的內容改成正確的。`}
        </p>

        <div style={{ marginBottom: '12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          目前{f.label}：
          {!single && values.length > 1 ? (
            <select
              value={current}
              onChange={(e) => { setCurrent(e.target.value); setNewValue(''); }}
              aria-label={`要更正的${f.label}`}
              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontWeight: 700 }}
            >
              {values.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : (
            <strong data-testid="field-fix-current">{shown(current)}</strong>
          )}
        </div>

        {loadError ? (
          <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}><AlertCircle size={16} /> {loadError}</div>
        ) : usage === null ? (
          <div style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>讀取中…</div>
        ) : (
          <div className="dm-block" data-testid="field-fix-usage">
            <div className="dm-block-title" style={{ marginBottom: '6px' }}>
              {single ? '要更正的品項' : `會一起改到 ${summary.masters} 個品項`}
              {summary.assets > 0 && <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>（{summary.assets} 筆資產）</span>}
            </div>
            <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
              <table className="dm-items-table">
                <thead>
                  <tr><th>類別</th><th>類型</th><th>廠牌</th><th>型號</th><th>規格</th><th style={{ textAlign: 'center' }}>資產</th></tr>
                </thead>
                <tbody>
                  {usage.map((m) => (
                    <tr key={m.id}>
                      <td className="dm-muted">{m.category_name || '未分類'}</td>
                      <td>{m.type || '-'}</td>
                      <td className={field === 'brand' ? 'dm-strong' : ''}>{m.brand || '-'}</td>
                      <td className={field === 'model' ? 'dm-strong' : ''}>{m.model || '-'}</td>
                      <td className={field === 'specification' ? 'dm-strong' : ''}>{m.specification || '-'}</td>
                      <td style={{ textAlign: 'center' }}>{m.asset_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {summary.orders.length > 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                用到的進貨單：{summary.orders.join('、')}
              </div>
            )}
          </div>
        )}

        <label htmlFor="field-fix-new" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, margin: '12px 0 6px', color: 'var(--text-main)' }}>
          {f.inputLabel}
          {single && f.allowEmpty && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>（留空＝清除）</span>}
        </label>
        <input
          id="field-fix-new"
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!saveDisabled) handleSave(); } }}
          autoFocus
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', boxSizing: 'border-box' }}
        />

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button type="button" className="dm-btn dm-btn-outline" onClick={onClose}>取消</button>
          <button type="button" className="dm-btn dm-btn-primary" onClick={handleSave} disabled={saveDisabled}>
            {saving ? '處理中…' : '確定更正'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ItemFieldFixModal;
