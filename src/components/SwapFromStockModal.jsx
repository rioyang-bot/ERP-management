import React, { useEffect, useMemo, useState } from 'react';
import { Repeat, AlertCircle, Info, ArrowRight } from 'lucide-react';
import { logStatusChange, logCreate, logUpdate, logMountedHwStatusSync, getCurrentUser } from '../utils/auditLogger';
import { rankSwapCandidates, MATCH_LABEL, validateSwap, swapResultsText, buildSwapSteps, swapHwSyncLogs } from '../utils/repairSwap';
import './detail/DetailModal.css';

/**
 * 維修單：以庫存設備換貨（見 utils/repairSwap.js）
 *
 * 每一台故障設備選一台在庫的設備換給客戶。按下確認後同一個交易完成：
 * 新設備出貨給客戶、換回來的設備回到在庫、維修單結案、產生已出貨的出貨單。
 *
 * 舊機的搭載硬體逐件選擇「跟舊機取回／留在客戶端、移到新設備」（例如 NIC 不帶回，其餘帶回）。
 * 新設備出貨時就已經配好，它身上的硬體一律一起出貨，不在這裡選。
 */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const SwapFromStockModal = ({ isOpen, onClose, repairOrder, onSuccess }) => {
  const [candidates, setCandidates] = useState([]);
  const [brokenAssets, setBrokenAssets] = useState({}); // 明細 id → 故障設備的資產資料
  const [picks, setPicks] = useState({}); // 明細 id → 選到的庫存設備
  const [filters, setFilters] = useState({}); // 明細 id → 搜尋字
  // 舊機的搭載硬體與使用者的選擇
  const [oldHw, setOldHw] = useState({}); // 明細 id → 舊機的搭載硬體
  const [moveSel, setMoveSel] = useState({}); // 明細 id → Set(舊機上要移到新設備的硬體 id)
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const items = useMemo(() => (repairOrder?.items || []).filter((it) => String(it.sn || '').trim()), [repairOrder]);

  useEffect(() => {
    if (!isOpen || !repairOrder) return;
    let alive = true;
    setPicks({});
    setFilters({});
    setOldHw({});
    setMoveSel({});
    setDate(today());
    setReason(repairOrder.on_site_status || '');
    setRemarks('');
    setError('');
    setLoading(true);
    (async () => {
      try {
        const [candRes, ...rest] = await Promise.all([
          window.electronAPI.namedQuery('fetchSwapCandidates'),
          ...items.map((it) => window.electronAPI.namedQuery('fetchAssetBySn', [it.sn.trim()])),
          ...items.map((it) => window.electronAPI.namedQuery('fetchMountedHardwareBySn', [it.sn.trim()])),
        ]);
        const assetRes = rest.slice(0, items.length);
        const hwRes = rest.slice(items.length);
        if (!alive) return;
        if (!candRes.success) throw new Error(candRes.error || '讀取在庫設備失敗');
        setCandidates(candRes.rows || []);
        const map = {};
        items.forEach((it, i) => { map[it.id] = assetRes[i]?.success ? assetRes[i].rows?.[0] || null : null; });
        setBrokenAssets(map);
        const hwMap = {};
        items.forEach((it, i) => { hwMap[it.id] = hwRes[i]?.success ? hwRes[i].rows || [] : []; });
        setOldHw(hwMap);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [isOpen, repairOrder, items]);

  if (!isOpen || !repairOrder) return null;

  const pickedSns = new Set(Object.values(picks).map((c) => c.sn));

  const pickReplacement = (itemId, cand) => setPicks((prev) => {
    const next = { ...prev };
    if (cand) next[itemId] = cand; else delete next[itemId];
    return next;
  });

  const toggleIn = (setter, itemId, hwId, on) => setter((prev) => {
    const next = new Set(prev[itemId] || []);
    if (on) next.add(hwId); else next.delete(hwId);
    return { ...prev, [itemId]: next };
  });

  /** 某一類型的舊機硬體一次全部移到新設備（已經全移就全部改回取回） */
  const toggleTypeMove = (itemId, type) => {
    const ofType = (oldHw[itemId] || []).filter((h) => (h.type || '') === type).map((h) => h.id);
    setMoveSel((prev) => {
      const cur = new Set(prev[itemId] || []);
      const allMoved = ofType.every((id) => cur.has(id));
      ofType.forEach((id) => (allMoved ? cur.delete(id) : cur.add(id)));
      return { ...prev, [itemId]: cur };
    });
  };
  const attrs = (a) => (a?.custom_attributes && typeof a.custom_attributes === 'object' ? a.custom_attributes : {});

  const handleSubmit = async () => {
    setError('');
    const invalid = validateSwap({ items, picks, date, reason });
    if (invalid) { setError(invalid); return; }
    const notFound = items.find((it) => !brokenAssets[it.id]);
    if (notFound) { setError(`資產資料裡找不到故障設備 [${notFound.sn}]，無法換貨。`); return; }

    const first = brokenAssets[items[0].id];
    const dn = {
      customer: repairOrder.customer_name || first.client || '',
      location: first.location || '',
      contact: [repairOrder.contact_person, repairOrder.contact_phone].filter(Boolean).join(' '),
      project: attrs(first).project_name || null,
    };
    const pairs = items.map((it) => ({
      repairItemId: it.id,
      oldAssetId: brokenAssets[it.id].id,
      oldSn: it.sn.trim(),
      oldStatus: brokenAssets[it.id].status,
      newAssetId: picks[it.id].id,
      newSn: picks[it.id].sn,
      newItemMasterId: picks[it.id].item_master_id,
      moveHw: (oldHw[it.id] || []).filter((h) => moveSel[it.id]?.has(h.id)),
    }));
    const hwLines = pairs.flatMap((p) => p.moveHw.map(
      (h) => `　· ${h.type || '硬體'} ${h.sn}：留在客戶端，由 ${p.oldSn} 移到 ${p.newSn}`
    ));

    if (!window.confirm(
      `確定以庫存設備換貨嗎？\n\n`
      + pairs.map((p) => `　· 故障 ${p.oldSn} → 換給客戶 ${p.newSn}`).join('\n')
      + `\n\n新設備出貨給「${dn.customer}」（${dn.location || '地點未填'}），換回來的設備回到「在庫」，`
      + '維修單結案，並產生一張已出貨的出貨單。'
      + (hwLines.length > 0 ? `\n\n搭載硬體：\n${hwLines.join('\n')}` : '')
    )) return;

    setSaving(true);
    try {
      // 出貨單號與一般出貨單相同的規則：DN-日期-流水號
      const prefix = `DN-${date.replace(/-/g, '')}-`;
      const countRes = await window.electronAPI.namedQuery('countOutboundRequests', [prefix]);
      const dnNo = `${prefix}${(parseInt(countRes?.rows?.[0]?.count, 10) || 1).toString().padStart(2, '0')}`;
      const results = swapResultsText(reason, pairs, dnNo);

      const res = await window.electronAPI.runTransaction(buildSwapSteps({
        order: repairOrder, pairs, date, results, remarks, dnNo, userId: getCurrentUser()?.id, dn,
      }));
      if (!res.success) throw new Error(res.error || '換貨失敗');

      for (const p of pairs) {
        await logStatusChange('DEVICE', p.newSn, p.newSn, 'ACTIVE', 'SHIPPED',
          `維修單 [${repairOrder.repair_no}] 以庫存設備換貨，出貨給 [${dn.customer}]，取代故障的 [${p.oldSn}]（出貨單 ${dnNo}）`,
          { repairNo: repairOrder.repair_no, oldSn: p.oldSn, newSn: p.newSn, dnNo, swap: true });
        await logStatusChange('DEVICE', p.oldSn, p.oldSn, p.oldStatus || 'SHIPPED', 'ACTIVE',
          `維修單 [${repairOrder.repair_no}] 以庫存設備換貨，自 [${dn.customer}] 換回（由 [${p.newSn}] 替換），回到在庫`,
          { repairNo: repairOrder.repair_no, oldSn: p.oldSn, newSn: p.newSn, dnNo, swap: true });
      }
      // 搭載硬體的移動各記一筆，硬體自己的履歷才看得到
      for (const p of pairs) {
        for (const h of p.moveHw) {
          await logUpdate('HARDWARE', h.sn, h.sn,
            `搭載硬體 [${h.sn}] 由 [${p.oldSn}] 移到 [${p.newSn}]（維修單 [${repairOrder.repair_no}] 換貨，留在客戶端）`,
            { repairNo: repairOrder.repair_no, sn: h.sn, from: p.oldSn, to: p.newSn, itemMasterId: h.item_master_id, swap: true });
        }
      }
      // 搭載硬體的狀態跟著設備改了（新設備上的變已出貨、舊機上剩下的回到在庫），每張各記一筆
      for (const { deviceSn, rows } of swapHwSyncLogs(pairs, res.results)) {
        await logMountedHwStatusSync(deviceSn, rows, `維修單 [${repairOrder.repair_no}] 以庫存設備換貨`,
          { repairNo: repairOrder.repair_no, dnNo, swap: true });
      }
      await logCreate('OUTBOUND', dnNo, dn.customer,
        `維修單 [${repairOrder.repair_no}] 以庫存設備換貨，自動建立出貨單 [${dnNo}]（已出貨）`,
        { repairNo: repairOrder.repair_no, dnNo, sns: pairs.map((p) => p.newSn) });
      await logUpdate('REPAIR', repairOrder.repair_no, repairOrder.customer_name,
        `維修單 [${repairOrder.repair_no}] 以庫存設備換貨結案：${pairs.map((p) => `${p.oldSn} → ${p.newSn}`).join('、')}`,
        { repairNo: repairOrder.repair_no, dnNo, pairs: pairs.map(({ oldSn, newSn }) => ({ oldSn, newSn })) });

      alert(`✅ 換貨完成！\n\n維修單 [${repairOrder.repair_no}] 已結案，出貨單 [${dnNo}] 已建立（已出貨），`
        + '可到出貨單列表列印交貨簽收單。\n換回來的設備已回到「在庫」，要送原廠請另開一張內部維修單。');
      if (onSuccess) onSuccess(dnNo);
      onClose();
    } catch (e) {
      setError(`換貨失敗：${e.message}\n所有變更已退回。`);
    } finally {
      setSaving(false);
    }
  };

  /** 舊機的搭載硬體，逐件選擇跟舊機取回或留在客戶端（移到新設備） */
  const renderHwChoices = (it, pick) => {
    const olds = oldHw[it.id] || [];
    if (olds.length === 0) return null;
    const types = [...new Set(olds.map((h) => h.type || ''))];
    const rowStyle = { display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0', fontSize: '0.8rem', flexWrap: 'wrap' };
    const radio = (name, checked, onChange, label) => (
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <input type="radio" name={name} checked={checked} onChange={onChange} /> {label}
      </label>
    );
    const hwLabel = (h) => (
      <span style={{ flex: '1 1 260px', minWidth: 0 }}>
        <b style={{ display: 'inline-block', minWidth: '120px', marginRight: '8px' }}>{h.type || '硬體'}</b>
        {[h.brand, h.model].filter(Boolean).join(' ')} <code className="dm-sn">{h.sn}</code>
      </span>
    );
    return (
      <div style={{ marginTop: '10px', borderTop: '1px dashed var(--border-color)', paddingTop: '8px' }} data-testid={`swap-hw-${it.id}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)' }}>
              {it.sn} 的搭載硬體
              {pick && types.filter(Boolean).map((t) => (
                <button key={t} type="button" onClick={() => toggleTypeMove(it.id, t)}
                  style={{ padding: '1px 8px', borderRadius: '10px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                  {t} 全部移到新設備
                </button>
              ))}
            </div>
            {olds.map((h) => {
              const moving = !!moveSel[it.id]?.has(h.id);
              return (
                <div key={h.id} style={rowStyle} data-testid={`swap-old-hw-${h.sn}`}>
                  {hwLabel(h)}
                  {radio(`old-${it.id}-${h.id}`, !moving, () => toggleIn(setMoveSel, it.id, h.id, false), '跟舊機取回')}
                  {pick
                    ? radio(`old-${it.id}-${h.id}`, moving, () => toggleIn(setMoveSel, it.id, h.id, true), '移到新設備（留在客戶端）')
                    : <span style={{ color: 'var(--text-subtle)' }}>（先選新設備才能移過去）</span>}
                </div>
              );
            })}
      </div>
    );
  };

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', boxSizing: 'border-box', fontSize: '0.85rem' };
  const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', margin: '12px 0 6px' };

  return (
    <div className="dm-overlay">
      <div className="dm-modal" role="dialog" aria-label="以庫存設備換貨" style={{ width: '760px' }}>
        <div className="dm-header" style={{ padding: '18px 24px' }}>
          <div>
            <h2 className="dm-title" style={{ fontSize: '1.25rem' }}>
              <Repeat size={22} color="#0891b2" /> 以庫存設備換貨：{repairOrder.repair_no}
            </h2>
            <div className="dm-meta"><span>客戶：{repairOrder.customer_name || '-'}</span></div>
          </div>
          <button type="button" className="dm-close" onClick={onClose}>✕ 關閉</button>
        </div>

        <div className="dm-body" style={{ padding: '14px 24px' }}>
          <div className="dm-block" style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
            <Info size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#0891b2' }} />
            <div>
              從庫存拿一台換給客戶，故障的那台取回。確認後會一次完成：
              新設備<b style={{ color: 'var(--text-main)' }}>出貨給客戶</b>（客戶、地點、專案、客戶保固沿用故障的那台，搭載硬體一起出貨）、
              換回來的設備<b style={{ color: 'var(--text-main)' }}>回到在庫</b>（客戶、地點清空，搭載硬體跟著取回）、
              維修單結案，並<b style={{ color: 'var(--text-main)' }}>產生一張已出貨的出貨單</b>可列印簽收單。
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>讀取中…</div>
          ) : items.map((it) => {
            const broken = brokenAssets[it.id];
            const ranked = rankSwapCandidates(candidates, { ...it, ...(broken || {}) });
            const term = (filters[it.id] || '').trim().toUpperCase();
            const shown = ranked.filter((c) => !term || [c.sn, c.brand, c.model, c.type, c.specification].some((v) => String(v || '').toUpperCase().includes(term)));
            const pick = picks[it.id];
            return (
              <div key={it.id} className="dm-block" style={{ backgroundColor: 'var(--bg-surface)' }} data-testid={`swap-item-${it.id}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                  <span className="dm-block-title">故障設備</span>
                  <code className="dm-sn">{it.sn}</code>
                  <span>{[it.brand, it.type, it.model].filter(Boolean).join(' ')}</span>
                  {broken && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      客戶：{broken.client || '-'}　地點：{broken.location || '-'}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                  <ArrowRight size={16} color="#0891b2" style={{ flexShrink: 0 }} />
                  <input
                    type="text"
                    value={filters[it.id] || ''}
                    onChange={(e) => setFilters({ ...filters, [it.id]: e.target.value })}
                    placeholder="搜尋序號、廠牌、型號"
                    aria-label={`搜尋庫存設備 ${it.sn}`}
                    style={{ ...inputStyle, width: '180px', flexShrink: 0 }}
                  />
                  <select
                    value={pick ? String(pick.id) : ''}
                    onChange={(e) => pickReplacement(it.id, candidates.find((x) => String(x.id) === e.target.value) || null)}
                    aria-label={`換給客戶的設備 ${it.sn}`}
                    style={inputStyle}
                  >
                    <option value="">{shown.length === 0 ? '沒有符合的在庫設備' : `選擇在庫設備（${shown.length} 台）`}</option>
                    {shown.map((c) => {
                      const takenByOther = pickedSns.has(c.sn) && pick?.sn !== c.sn;
                      return (
                        <option key={c.id} value={c.id} disabled={takenByOther}>
                          {c.match ? `【${MATCH_LABEL[c.match]}】` : ''}{c.sn} — {[c.brand, c.model, c.specification].filter(Boolean).join(' ')}
                          {c.mounted_count > 0 ? `（搭載 ${c.mounted_count} 件）` : ''}{takenByOther ? '（已選給另一台）' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
                {renderHwChoices(it, pick)}
              </div>
            );
          })}

          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '0 16px' }}>
            <div>
              <label style={labelStyle} htmlFor="swap-date">換貨日期 *</label>
              <input id="swap-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="swap-remarks">出貨備註</label>
              <input id="swap-remarks" type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <label style={labelStyle} htmlFor="swap-reason">換貨原因 / 故障說明 *</label>
          <textarea id="swap-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />

          {error && (
            <div role="alert" style={{ marginTop: '12px', display: 'flex', gap: '6px', color: '#ef4444', fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'pre-wrap' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} /> {error}
            </div>
          )}
        </div>

        <div className="dm-footer">
          <button type="button" className="dm-btn dm-btn-outline" onClick={onClose}>取消</button>
          <button type="button" className="dm-btn dm-btn-primary" onClick={handleSubmit} disabled={saving || loading}>
            <Repeat size={16} /> {saving ? '處理中…' : '確認換貨'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SwapFromStockModal;
