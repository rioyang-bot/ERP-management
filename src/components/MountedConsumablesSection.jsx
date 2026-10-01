import React, { useState, useEffect, useCallback } from 'react';
import { Package, Plus, Undo2 } from 'lucide-react';
import { logUpdate } from '../utils/auditLogger';
import { mountedLabel } from '../utils/mountedConsumables';

/**
 * 設備上掛載的耗材
 *
 * 掛載＝把耗材從庫存移到 LAB，並記在這台設備上；卸載＝移回庫存。
 * 出貨單／借用單加入這台設備時，掛載的耗材會一併帶入，而且「掛多少出多少」，
 * 單上不能改 —— 要調整數量就在這裡卸載。
 *
 * 掛載與卸載是實際的庫存移動，按下就生效（會先確認），不必等設備資料按儲存。
 */
const MountedConsumablesSection = ({ device, onChanged, labelStyle, inputStyle }) => {
  const [mounted, setMounted] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [pick, setPick] = useState({ itemId: '', qty: 1 });
  const [unmountQty, setUnmountQty] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const assetId = device?.id;
  const sn = (device?.sn || '').trim();
  const canMount = device?.status === 'ACTIVE';

  const load = useCallback(async () => {
    if (!assetId) return;
    try {
      const [mRes, cRes] = await Promise.all([
        window.electronAPI.namedQuery('fetchMountedConsumables', [assetId]),
        window.electronAPI.namedQuery('fetchConsumablesList'),
      ]);
      if (!mRes.success) throw new Error(mRes.error || '讀取掛載的耗材失敗');
      setMounted(mRes.rows || []);
      setConsumables(cRes.success ? (cRes.rows || []) : []);
      setError('');
    } catch (e) {
      // 資料庫變更還沒套用時只擋住這一區
      setError(e.message || '讀取掛載的耗材失敗');
    }
  }, [assetId]);

  useEffect(() => { load(); }, [load]);

  const picked = consumables.find((c) => String(c.id) === String(pick.itemId));

  const run = async (steps, logText, details) => {
    setBusy(true);
    try {
      const res = await window.electronAPI.runTransaction(steps);
      if (!res.success) throw new Error(res.error || '處理失敗');
      // 耗材的履歷靠 itemMasterId 接回品項，設備的履歷靠序號接回設備，兩邊各記一筆
      await logUpdate('CONSUMABLE', details.itemMasterId, details.label, logText, details);
      await logUpdate('DEVICE', sn || assetId, sn, logText, details);
      await load();
      if (onChanged) onChanged();
    } catch (e) {
      alert(`${e.message}\n\n所有變更已退回，數量維持原樣。`);
    } finally {
      setBusy(false);
    }
  };

  const handleMount = async () => {
    const qty = parseInt(pick.qty, 10);
    if (!picked) return alert('請先選擇要掛載的耗材');
    if (!(qty > 0)) return alert('請輸入大於 0 的數量');
    if (qty > Number(picked.stock_qty || 0)) return alert(`庫存不足：目前庫存 ${picked.stock_qty || 0}，要掛載 ${qty}`);
    const label = mountedLabel(picked);
    if (!window.confirm(`確定要把 ${label} × ${qty} 掛載到設備 [${sn}] 嗎？\n\n會從庫存移到 LAB。之後出貨／借出這台設備時，會一併帶入並從 LAB 扣除。`)) return;
    await run([
      { queryName: 'mountConsumableStock', params: [qty, picked.id], expectRows: 1, errorMessage: `${label} 庫存不足，無法掛載。` },
      { queryName: 'insertLabAssignment', params: [picked.id, assetId, qty, `掛載到設備 ${sn}`], expectRows: 1, errorMessage: '記錄掛載失敗。' },
    ], `設備 [${sn}] 掛載耗材 ${label} × ${qty}（Stock ➔ LAB）`,
    { itemMasterId: picked.id, label, quantity: qty, sn, direction: 'MOUNT' });
    setPick({ itemId: '', qty: 1 });
  };

  const handleUnmount = async (row) => {
    const qty = parseInt(unmountQty[row.item_master_id] ?? row.quantity, 10);
    if (!(qty > 0) || qty > row.quantity) return alert(`卸載數量要在 1 ～ ${row.quantity} 之間`);
    const label = mountedLabel(row);
    if (!window.confirm(`確定要從設備 [${sn}] 卸載 ${label} × ${qty} 嗎？\n\n會從 LAB 移回庫存。`)) return;
    await run([
      { queryName: 'unmountConsumableStock', params: [qty, row.item_master_id], expectRows: 1, errorMessage: `${label} 的 LAB 數量不足，無法卸載。` },
      { queryName: 'deductLabAssignment', params: [row.item_master_id, assetId, qty, `從設備 ${sn} 卸載`], expectRows: 1, errorMessage: `設備上掛載的 ${label} 不足 ${qty}。` },
    ], `設備 [${sn}] 卸載耗材 ${label} × ${qty}（LAB ➔ Stock）`,
    { itemMasterId: row.item_master_id, label, quantity: qty, sn, direction: 'UNMOUNT' });
    setUnmountQty((prev) => { const n = { ...prev }; delete n[row.item_master_id]; return n; });
  };

  const small = { ...(inputStyle || {}), padding: '6px 8px', fontSize: '13px' };

  return (
    <div data-testid="mounted-consumables-section">
      <label style={{ ...(labelStyle || {}), display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Package size={14} style={{ color: '#7c3aed' }} />
        <span>掛載耗材 (Mounted Consumables)</span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal' }}>
          (掛載會從庫存移到 LAB；出貨／借出這台設備時一併帶入，掛多少出多少，單上不能改)
        </span>
      </label>

      {error && <div style={{ fontSize: '12px', color: '#ef4444', fontWeight: 700, marginBottom: '6px' }}>{error}</div>}

      {mounted.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
          {mounted.map((row) => (
            <div key={row.item_master_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(124, 58, 237, 0.25)', backgroundColor: 'rgba(124, 58, 237, 0.06)' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>
                {mountedLabel(row)}
                {row.specification && <span style={{ marginLeft: '6px', fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)' }}>{row.specification}</span>}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#7c3aed', whiteSpace: 'nowrap' }}>× {row.quantity}{row.unit ? ` ${row.unit}` : ''}</span>
              <input
                type="number"
                min={1}
                max={row.quantity}
                value={unmountQty[row.item_master_id] ?? row.quantity}
                onChange={(e) => setUnmountQty((prev) => ({ ...prev, [row.item_master_id]: e.target.value }))}
                aria-label={`卸載 ${mountedLabel(row)} 的數量`}
                style={{ ...small, width: '70px' }}
              />
              <button
                type="button"
                onClick={() => handleUnmount(row)}
                disabled={busy}
                aria-label={`卸載 ${mountedLabel(row)}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', fontSize: '12px', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
              >
                <Undo2 size={13} /> 卸載
              </button>
            </div>
          ))}
        </div>
      ) : (
        !error && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>這台設備目前沒有掛載耗材。</div>
      )}

      {canMount ? (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <select
            value={pick.itemId}
            onChange={(e) => setPick({ ...pick, itemId: e.target.value })}
            aria-label="要掛載的耗材"
            style={{ ...small, flex: 1, minWidth: 0 }}
          >
            <option value="">選擇要掛載的耗材…</option>
            {consumables.map((c) => (
              <option key={c.id} value={c.id} disabled={!(Number(c.stock_qty) > 0)}>
                {mountedLabel(c)}{c.specification ? ` ${c.specification}` : ''}（庫存 {c.stock_qty || 0}）
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={pick.qty}
            onChange={(e) => setPick({ ...pick, qty: e.target.value })}
            aria-label="掛載數量"
            style={{ ...small, width: '80px' }}
          />
          <button
            type="button"
            onClick={handleMount}
            disabled={busy || !pick.itemId}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: busy || !pick.itemId ? 'var(--border-color)' : '#7c3aed', color: '#fff', fontSize: '12px', fontWeight: 800, cursor: busy || !pick.itemId ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
          >
            <Plus size={13} /> 掛載
          </button>
        </div>
      ) : (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>設備不在庫（目前狀態：{device?.status || '未知'}），不能再掛載耗材。</div>
      )}
    </div>
  );
};

export default MountedConsumablesSection;
