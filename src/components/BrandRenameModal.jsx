import React, { useEffect, useState } from 'react';
import { Tag, AlertCircle } from 'lucide-react';
import { logUpdate } from '../utils/auditLogger';
import './detail/DetailModal.css';
import {
  normalizeBrand, validateBrandRename, buildBrandRenameSteps, summarizeBrandUsage, auditModuleFor,
} from '../utils/brandRename';

/**
 * 廠牌更名視窗
 *
 * 列出所有用到這個廠牌的品項，確認後一次改名（見 utils/brandRename.js）。
 *
 * @param {object} props
 * @param {string} props.brand 目前（打錯）的廠牌名稱
 * @param {() => void} props.onClose
 * @param {(newBrand: string) => void} props.onRenamed 改名成功後呼叫
 */
const BrandRenameModal = ({ brand, onClose, onRenamed }) => {
  const [usage, setUsage] = useState(null); // null＝讀取中
  const [loadError, setLoadError] = useState(null);
  const [newBrand, setNewBrand] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await window.electronAPI.namedQuery('fetchBrandUsage', [brand]);
      if (!alive) return;
      if (res.success) setUsage(res.rows || []);
      else setLoadError(res.error || '無法讀取這個廠牌的品項');
    })();
    return () => { alive = false; };
  }, [brand]);

  const summary = summarizeBrandUsage(usage || []);

  const handleRename = async () => {
    const invalid = validateBrandRename(brand, newBrand);
    if (invalid) { alert(invalid); return; }
    const next = normalizeBrand(newBrand);

    setSaving(true);
    try {
      const conflictRes = await window.electronAPI.namedQuery('fetchBrandRenameConflicts', [brand, next]);
      if (!conflictRes.success) throw new Error(conflictRes.error || '無法檢查是否與既有品項重複');
      if ((conflictRes.rows || []).length > 0) {
        alert(
          `無法更名：改成「${next}」後，以下品項會和已經存在的「${next}」品項重複：\n\n`
          + conflictRes.rows.map((r) => `　· ${r.category_name} ${[r.type, r.model, r.specification].filter(Boolean).join(' ')}`).join('\n')
          + '\n\n這種情況要把兩張品項合併（資產、單據、庫存都要一起搬），請聯絡系統管理者處理。'
        );
        return;
      }

      const cats = Object.entries(summary.byCategory).map(([c, n]) => `${c} ${n} 個`).join('、');
      if (!window.confirm(
        `確定把廠牌「${brand}」更名為「${next}」嗎？\n\n`
        + `會一起改到 ${summary.masters} 個品項（${cats}）`
        + (summary.assets > 0 ? `，共 ${summary.assets} 筆資產` : '')
        + '。\n用到這些品項的所有單據、列表都會顯示新的名稱。'
      )) return;

      const res = await window.electronAPI.runTransaction(buildBrandRenameSteps(brand, next, summary.masters));
      if (!res.success) throw new Error(res.error || '更名失敗');

      // 每個品項各記一筆，打開品項履歷才看得到這次更名
      await Promise.all((usage || []).map((m) => logUpdate(
        auditModuleFor(m.category_name),
        m.id,
        `${next} ${m.model || ''}`.trim(),
        `廠牌更名 [${brand}] → [${next}]（${[m.type, m.model].filter(Boolean).join(' ')}）`,
        { itemMasterId: m.id, from: brand, to: next, brandRename: true }
      )));

      alert(`廠牌已更名為「${next}」，共 ${summary.masters} 個品項。`);
      onRenamed(next);
    } catch (err) {
      alert('廠牌更名失敗：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dm-overlay" style={{ zIndex: 1200 }}>
      <div className="dm-modal" role="dialog" aria-label="廠牌更名" style={{ width: '560px', padding: '24px' }}>
        <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
          <Tag size={20} color="#d97706" /> 廠牌更名
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
          廠牌打錯時用這裡一次改正。用到這個廠牌的品項會全部改名，資產、庫存與單據都不受影響，只是顯示的名稱改成正確的。
        </p>

        <div style={{ marginBottom: '12px', fontSize: '0.9rem' }}>
          目前廠牌：<strong data-testid="brand-rename-current">{brand}</strong>
        </div>

        {loadError ? (
          <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}><AlertCircle size={16} /> {loadError}</div>
        ) : usage === null ? (
          <div style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>讀取中…</div>
        ) : (
          <div className="dm-block" data-testid="brand-rename-usage">
            <div className="dm-block-title" style={{ marginBottom: '6px' }}>
              會一起改到 {summary.masters} 個品項
              {summary.assets > 0 && <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>（{summary.assets} 筆資產）</span>}
            </div>
            <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
              <table className="dm-items-table">
                <thead>
                  <tr><th>類別</th><th>類型</th><th>型號</th><th>規格</th><th style={{ textAlign: 'center' }}>資產</th></tr>
                </thead>
                <tbody>
                  {usage.map((m) => (
                    <tr key={m.id}>
                      <td className="dm-muted">{m.category_name || '未分類'}</td>
                      <td>{m.type || '-'}</td>
                      <td className="dm-strong">{m.model || '-'}</td>
                      <td>{m.specification || '-'}</td>
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

        <label htmlFor="brand-rename-new" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, margin: '12px 0 6px', color: 'var(--text-main)' }}>
          正確的廠牌名稱
        </label>
        <input
          id="brand-rename-new"
          type="text"
          value={newBrand}
          onChange={(e) => setNewBrand(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRename(); } }}
          autoFocus
          placeholder="例如：元景資訊"
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', boxSizing: 'border-box' }}
        />

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button type="button" className="dm-btn dm-btn-outline" onClick={onClose}>取消</button>
          <button
            type="button"
            className="dm-btn dm-btn-primary"
            onClick={handleRename}
            disabled={saving || usage === null || !!loadError || !newBrand.trim()}
          >
            {saving ? '處理中…' : '確定更名'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BrandRenameModal;
