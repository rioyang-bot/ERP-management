import React, { useEffect, useMemo, useState } from 'react';
import { Repeat, AlertCircle, Info, Plus, X, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { getCurrentUser } from '../utils/auditLogger';
import { validateExchange, buildExchangeSteps, logExchange, lineLabel } from '../utils/customerExchange';
import './detail/DetailModal.css';

const today = () => new Date().toISOString().split('T')[0];

const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', boxSizing: 'border-box', fontSize: '0.85rem' };
const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', margin: '12px 0 6px' };
const matches = (term, values) => !term || values.some((v) => String(v || '').toUpperCase().includes(term));
const itemName = (x) => [x.type ? `[${x.type}]` : '', x.brand, x.model, x.specification].filter(Boolean).join(' ');

/**
 * 一邊的明細（換回或換出）：加入耗材（選品項＋數量）或有序號的品項，列在下面可移除。
 */
const LineSection = ({ dir, title, hint, color, icon, consumables, assets, assetEmptyText, lines, setLines, showStock }) => {
  const [csmTerm, setCsmTerm] = useState('');
  const [csmId, setCsmId] = useState('');
  const [qty, setQty] = useState('1');
  const [assetTerm, setAssetTerm] = useState('');
  const [assetId, setAssetId] = useState('');

  const csmTermU = csmTerm.trim().toUpperCase();
  const shownCsm = consumables.filter((c) => matches(csmTermU, [c.brand, c.type, c.model, c.specification]));
  const usedAssetIds = new Set(lines.filter((l) => l.kind === 'ASSET').map((l) => l.assetId));
  const assetTermU = assetTerm.trim().toUpperCase();
  const shownAssets = assets.filter((a) => !usedAssetIds.has(a.id) && matches(assetTermU, [a.sn, a.brand, a.type, a.model, a.specification]));

  const addConsumable = () => {
    const c = consumables.find((x) => String(x.id) === csmId);
    const n = Number(qty);
    if (!c || !Number.isInteger(n) || n <= 0) return;
    setLines((prev) => {
      // 同一個品項再加一次就併成一行
      const hit = prev.find((l) => l.kind === 'CONSUMABLE' && l.itemId === c.id);
      if (hit) return prev.map((l) => (l === hit ? { ...l, qty: l.qty + n } : l));
      return [...prev, { kind: 'CONSUMABLE', itemId: c.id, qty: n, stock: c.stock_qty, brand: c.brand, type: c.type, model: c.model, specification: c.specification }];
    });
    setCsmId('');
    setQty('1');
  };

  const addAsset = () => {
    const a = assets.find((x) => String(x.id) === assetId);
    if (!a) return;
    setLines((prev) => [...prev, {
      kind: 'ASSET', assetId: a.id, sn: a.sn, itemId: a.item_master_id, categoryName: a.category_name,
      brand: a.brand, type: a.type, model: a.model, specification: a.specification, mountedCount: a.mounted_count,
    }]);
    setAssetId('');
  };

  return (
    <div className="dm-block" style={{ backgroundColor: 'var(--bg-surface)' }} data-testid={`exchange-${dir}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 800, color }}>
        {icon} {title}
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{hint}</span>
      </div>

      {/* 耗材：數量 */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
        <input type="text" value={csmTerm} onChange={(e) => setCsmTerm(e.target.value)} placeholder="搜尋耗材"
          aria-label={`搜尋${title}耗材`} style={{ ...inputStyle, width: '130px', flexShrink: 0 }} />
        <select value={csmId} onChange={(e) => setCsmId(e.target.value)} aria-label={`${title}耗材`} style={inputStyle}>
          <option value="">{shownCsm.length === 0 ? '沒有符合的耗材' : `選擇耗材（${shownCsm.length} 項）`}</option>
          {shownCsm.map((c) => (
            // 換出時在庫為 0 的不能選
            <option key={c.id} value={c.id} disabled={showStock && !(Number(c.stock_qty) > 0)}>
              {itemName(c)}{showStock ? `（在庫 ${c.stock_qty ?? 0}）` : ''}
            </option>
          ))}
        </select>
        <input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)}
          aria-label={`${title}數量`} style={{ ...inputStyle, width: '70px', flexShrink: 0 }} />
        <button type="button" className="dm-btn dm-btn-outline" onClick={addConsumable} disabled={!csmId}
          aria-label={`加入${title}耗材`} style={{ flexShrink: 0 }}>
          <Plus size={14} /> 加入
        </button>
      </div>

      {/* 有序號的：一支一行 */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
        <input type="text" value={assetTerm} onChange={(e) => setAssetTerm(e.target.value)} placeholder="搜尋序號、型號"
          aria-label={`搜尋${title}序號品項`} style={{ ...inputStyle, width: '130px', flexShrink: 0 }} />
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)} aria-label={`${title}序號品項`} style={inputStyle}>
          <option value="">{shownAssets.length === 0 ? assetEmptyText : `選擇有序號的設備／硬體（${shownAssets.length} 件）`}</option>
          {shownAssets.map((a) => {
            // 掛了耗材的設備要走一般出貨單：掛載耗材得一起出、從 LAB 扣
            const blocked = a.mounted_consumables > 0;
            return (
              <option key={a.id} value={a.id} disabled={blocked}>
                {a.sn} — {itemName(a)}{a.mounted_count > 0 ? `（搭載 ${a.mounted_count} 件硬體）` : ''}{blocked ? '（掛有耗材，請用一般出貨單）' : ''}
              </option>
            );
          })}
        </select>
        <button type="button" className="dm-btn dm-btn-outline" onClick={addAsset} disabled={!assetId}
          aria-label={`加入${title}序號品項`} style={{ flexShrink: 0 }}>
          <Plus size={14} /> 加入
        </button>
      </div>

      {lines.length > 0 && (
        <table className="dm-items-table" style={{ marginTop: '10px' }} aria-label={`${title}明細`}>
          <thead>
            <tr><th>品項</th><th>序號</th><th style={{ textAlign: 'right' }}>數量</th><th style={{ width: '40px' }} /></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.kind === 'ASSET' ? `a-${l.assetId}` : `c-${l.itemId}`}>
                <td>
                  {itemName(l)}
                  {l.mountedCount > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      搭載的 {l.mountedCount} 件硬體一起{dir === 'in' ? '換回' : '出貨'}
                    </div>
                  )}
                </td>
                <td>{l.sn ? <code className="dm-sn">{l.sn}</code> : '-'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{l.kind === 'ASSET' ? 1 : l.qty}</td>
                <td>
                  <button type="button" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`移除 ${lineLabel(l)}`} title="移除"
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: 0, display: 'flex' }}>
                    <X size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

/**
 * 新增客戶換貨單（見 utils/customerExchange.js）
 */
const CustomerExchangeModal = ({ isOpen, onClose, onSuccess }) => {
  const [customers, setCustomers] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [stockAssets, setStockAssets] = useState([]);
  const [customerAssets, setCustomerAssets] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [inLines, setInLines] = useState([]);
  const [outLines, setOutLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const customer = useMemo(() => customers.find((c) => String(c.id) === customerId) || null, [customers, customerId]);

  useEffect(() => {
    if (!isOpen) return;
    setCustomerId(''); setLocation(''); setDate(today()); setReason(''); setRemarks('');
    setInLines([]); setOutLines([]); setCustomerAssets([]); setError('');
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [cust, csm, assets] = await Promise.all([
        window.electronAPI.namedQuery('fetchCustomers'),
        window.electronAPI.namedQuery('fetchConsumablesList'),
        window.electronAPI.namedQuery('fetchExchangeStockAssets'),
      ]);
      if (cancelled) return;
      setCustomers(cust?.success ? cust.rows || [] : []);
      setConsumables(csm?.success ? csm.rows || [] : []);
      setStockAssets(assets?.success ? assets.rows || [] : []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  // 換了客戶：換回的序號品項只能從這位客戶手上挑，已選的清掉
  const pickCustomer = async (id) => {
    setCustomerId(id);
    setInLines((prev) => prev.filter((l) => l.kind !== 'ASSET'));
    const c = customers.find((x) => String(x.id) === id);
    setLocation(c?.address || '');
    if (!c) { setCustomerAssets([]); return; }
    const res = await window.electronAPI.namedQuery('fetchCustomerShippedAssets', [c.name]);
    setCustomerAssets(res?.success ? res.rows || [] : []);
  };

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError('');
    const invalid = validateExchange({ customer: customer?.name, date, reason, inLines, outLines });
    if (invalid) { setError(invalid); return; }
    if (!window.confirm(
      `確定建立換貨單嗎？\n\n客戶：${customer.name}\n`
      + `換回（回到在庫）：${inLines.map(lineLabel).join('、')}\n`
      + `換出（產生已出貨的出貨單）：${outLines.map(lineLabel).join('、')}`
    )) return;

    setSaving(true);
    try {
      const ymd = date.replace(/-/g, '');
      const [dnCount, exCount] = await Promise.all([
        window.electronAPI.namedQuery('countOutboundRequests', [`DN-${ymd}-`]),
        window.electronAPI.namedQuery('countExchangeOrders', [`EX-${ymd}-`]),
      ]);
      const seq = (res) => (parseInt(res?.rows?.[0]?.count, 10) || 1).toString().padStart(2, '0');
      const dnNo = `DN-${ymd}-${seq(dnCount)}`;
      const exNo = `EX-${ymd}-${seq(exCount)}`;
      const contact = [customer.contact, customer.phone].filter(Boolean).join(' ');
      const userId = getCurrentUser()?.id;

      const { steps, hwIn } = buildExchangeSteps({
        exNo, dnNo, customer: customer.name, location: location.trim(), contact, date, reason, remarks, userId, inLines, outLines,
      });
      const res = await window.electronAPI.runTransaction(steps);
      if (!res.success) throw new Error(res.error || '換貨失敗');

      await logExchange({ exNo, dnNo, customer: customer.name, date, reason, inLines, outLines, results: res.results, hwIn });
      window.dispatchEvent(new CustomEvent('db-update'));
      alert(`✅ 換貨完成！\n\n換貨單 [${exNo}] 已建立，換回的品項已回到在庫。\n`
        + `出貨單 [${dnNo}] 已建立（已出貨），可到「已出貨」頁籤列印交貨簽收單。`);
      onSuccess?.({ exNo, dnNo });
      onClose();
    } catch (e) {
      setError(`換貨失敗：${e.message}\n所有變更已退回。`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dm-overlay">
      <div className="dm-modal" role="dialog" aria-label="新增換貨單" style={{ width: '860px' }}>
        <div className="dm-header" style={{ padding: '18px 24px' }}>
          <div>
            <h2 className="dm-title" style={{ fontSize: '1.25rem' }}>
              <Repeat size={22} color="#6366f1" /> 新增換貨單 (Customer Exchange)
            </h2>
            <div className="dm-meta"><span>客戶拿東西來換別的，例如 10G-LR 換成 10G-SR</span></div>
          </div>
          <button type="button" className="dm-close" onClick={onClose}>✕ 關閉</button>
        </div>

        <div className="dm-body" style={{ padding: '14px 24px' }}>
          <div className="dm-block" style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
            <Info size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#6366f1' }} />
            <div>
              確認後一次完成：換回的品項<b style={{ color: 'var(--text-main)' }}>直接回到在庫</b>（一律視為良品，不開進貨單）、
              換出的品項<b style={{ color: 'var(--text-main)' }}>產生一張已出貨的出貨單</b>，可列印交貨簽收單。
              有序號的設備，搭載的硬體會跟著一起換回或出貨。
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: '0 16px' }}>
            <div>
              <label style={labelStyle} htmlFor="ex-customer">客戶 *</label>
              <select id="ex-customer" value={customerId} onChange={(e) => pickCustomer(e.target.value)} style={inputStyle} disabled={loading}>
                <option value="">{loading ? '讀取中…' : '選擇客戶'}</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.contact ? `（${c.contact}）` : ''}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor="ex-date">換貨日期 *</label>
              <input id="ex-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <label style={labelStyle} htmlFor="ex-location">出貨地點</label>
          <input id="ex-location" type="text" value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />

          <LineSection
            dir="in" title="換回" hint="自客戶收回，直接回到在庫" color="#10b981" icon={<ArrowDownToLine size={16} />}
            consumables={consumables} assets={customerAssets}
            assetEmptyText={customer ? '這位客戶沒有已出貨的序號品項' : '先選客戶，才列得出客戶手上的序號品項'}
            lines={inLines} setLines={setInLines}
          />
          <LineSection
            dir="out" title="換出" hint="從在庫出貨給客戶" color="#3b82f6" icon={<ArrowUpFromLine size={16} />}
            consumables={consumables} assets={stockAssets} assetEmptyText="沒有在庫的序號品項"
            lines={outLines} setLines={setOutLines} showStock
          />

          <label style={labelStyle} htmlFor="ex-reason">換貨原因 *</label>
          <textarea id="ex-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="例如：客戶下錯單，10G-LR 換成 10G-SR" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          <label style={labelStyle} htmlFor="ex-remarks">備註</label>
          <input id="ex-remarks" type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} style={inputStyle} />

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

export default CustomerExchangeModal;
