import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Repeat, ClipboardList, User, Calendar, MapPin, Cpu, Package, Search, Plus, Trash2, AlertCircle,
  ArrowDownToLine, ArrowUpFromLine, MessageSquare,
} from 'lucide-react';
import { getCurrentUser } from '../utils/auditLogger';
import { validateExchange, buildExchangeSteps, logExchange, lineLabel } from '../utils/customerExchange';
import '../pages/Outbound.css';

const today = () => new Date().toISOString().split('T')[0];
const DIRS = {
  in: { title: '換回', hint: '自客戶收回，直接回到在庫', color: '#10b981', icon: ArrowDownToLine },
  out: { title: '換出', hint: '從在庫出貨給客戶', color: '#3b82f6', icon: ArrowUpFromLine },
};
const filterSelect = { padding: '7px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none' };
const catClass = (cat) => (cat === '設備' ? 'device' : cat === '硬體' ? 'hw' : 'csm');
const matchAll = (term, values) => !term || values.some((v) => String(v || '').toLowerCase().includes(term));

/**
 * 新增客戶換貨單（見 utils/customerExchange.js）
 *
 * 版面比照「新增出貨單」：左邊是單據資訊、序號與耗材的挑選，右邊是已排定的品項與送出。
 * 換貨同時有「換回」與「換出」兩邊，左上切換目前要加到哪一邊，右邊分成兩區列出。
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
  const [dir, setDir] = useState('in');
  const [exNo, setExNo] = useState('');
  const [snInput, setSnInput] = useState('');
  const [showSnDropdown, setShowSnDropdown] = useState(false);
  const blurTimer = useRef(null);
  const [csmBrand, setCsmBrand] = useState('');
  const [csmType, setCsmType] = useState('');
  const [csmModel, setCsmModel] = useState('');
  const [csmTerm, setCsmTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const customer = useMemo(() => customers.find((c) => String(c.id) === customerId) || null, [customers, customerId]);

  useEffect(() => {
    if (!isOpen) return;
    setCustomerId(''); setLocation(''); setDate(today()); setReason(''); setRemarks('');
    setInLines([]); setOutLines([]); setCustomerAssets([]); setError(''); setDir('in');
    setSnInput(''); setCsmBrand(''); setCsmType(''); setCsmModel(''); setCsmTerm('');
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

  // 換貨單號預覽（依換貨日期）；送出時再取一次，避免同時有人建單撞號
  useEffect(() => {
    if (!isOpen || !date) return;
    let cancelled = false;
    const ymd = date.replace(/-/g, '');
    window.electronAPI.namedQuery('countExchangeOrders', [`EX-${ymd}-`]).then((res) => {
      if (cancelled) return;
      setExNo(`EX-${ymd}-${(parseInt(res?.rows?.[0]?.count, 10) || 1).toString().padStart(2, '0')}`);
    });
    return () => { cancelled = true; };
  }, [isOpen, date]);

  if (!isOpen) return null;

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

  const setLines = dir === 'in' ? setInLines : setOutLines;
  const isOut = dir === 'out';

  // --- 序號品項：換回挑客戶手上的，換出挑在庫的 ---
  const assetPool = isOut ? stockAssets : customerAssets;
  const usedAssetIds = new Set([...inLines, ...outLines].filter((l) => l.kind === 'ASSET').map((l) => l.assetId));
  const snTerm = snInput.trim().toLowerCase();
  const snSuggestions = assetPool
    .filter((a) => !usedAssetIds.has(a.id) && matchAll(snTerm, [a.sn, a.brand, a.type, a.model, a.specification]))
    .slice(0, 10);

  const addAsset = (a) => {
    if (!a) return;
    // 掛了耗材的設備要走一般出貨單：掛載耗材得一起出、從 LAB 扣
    if (isOut && a.mounted_consumables > 0) {
      setError(`[${a.sn}] 掛有耗材，請改用一般出貨單（掛載的耗材要一起出貨、從 LAB 扣）。`);
      return;
    }
    setError('');
    setLines((prev) => [...prev, {
      kind: 'ASSET', assetId: a.id, sn: a.sn, itemId: a.item_master_id, categoryName: a.category_name,
      brand: a.brand, type: a.type, model: a.model, specification: a.specification, mountedCount: a.mounted_count,
    }]);
    setSnInput('');
    setShowSnDropdown(false);
  };

  const handleSnSubmit = (e) => {
    e.preventDefault();
    const exact = assetPool.find((a) => !usedAssetIds.has(a.id) && String(a.sn).trim().toLowerCase() === snTerm);
    addAsset(exact || (snSuggestions.length === 1 ? snSuggestions[0] : null));
  };

  // --- 耗材：篩選與點選加入，數量在右邊調 ---
  const csmBrands = [...new Set(consumables.map((c) => c.brand).filter(Boolean))];
  const csmTypes = [...new Set(consumables.filter((c) => !csmBrand || c.brand === csmBrand).map((c) => c.type).filter(Boolean))];
  const csmModels = [...new Set(consumables.filter((c) => (!csmBrand || c.brand === csmBrand) && (!csmType || c.type === csmType)).map((c) => c.model).filter(Boolean))];
  const hasCsmFilter = Boolean(csmBrand || csmType || csmModel || csmTerm.trim());
  const shownCsm = hasCsmFilter ? consumables.filter((c) => (!csmBrand || c.brand === csmBrand)
    && (!csmType || c.type === csmType) && (!csmModel || c.model === csmModel)
    && matchAll(csmTerm.trim().toLowerCase(), [c.brand, c.model, c.type, c.specification])) : [];

  const addConsumable = (c) => {
    // 換出時在庫為 0 的不能選
    if (isOut && !(Number(c.stock_qty) > 0)) return;
    setError('');
    setLines((prev) => {
      const hit = prev.find((l) => l.kind === 'CONSUMABLE' && l.itemId === c.id);
      if (hit) return prev.map((l) => (l === hit ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { kind: 'CONSUMABLE', itemId: c.id, qty: 1, stock: c.stock_qty, categoryName: '耗材', brand: c.brand, type: c.type, model: c.model, specification: c.specification }];
    });
  };

  const updateQty = (side, idx, qty) => {
    const set = side === 'in' ? setInLines : setOutLines;
    set((prev) => prev.map((l, i) => (i === idx ? { ...l, qty: Math.max(1, Number.isFinite(qty) ? qty : 1) } : l)));
  };
  const removeLine = (side, idx) => (side === 'in' ? setInLines : setOutLines)((prev) => prev.filter((_, i) => i !== idx));

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
      const finalExNo = `EX-${ymd}-${seq(exCount)}`;
      const contact = [customer.contact, customer.phone].filter(Boolean).join(' ');
      const userId = getCurrentUser()?.id;

      const { steps, hwIn } = buildExchangeSteps({
        exNo: finalExNo, dnNo, customer: customer.name, location: location.trim(), contact, date, reason, remarks, userId, inLines, outLines,
      });
      const res = await window.electronAPI.runTransaction(steps);
      if (!res.success) throw new Error(res.error || '換貨失敗');

      await logExchange({ exNo: finalExNo, dnNo, customer: customer.name, date, reason, inLines, outLines, results: res.results, hwIn });
      window.dispatchEvent(new CustomEvent('db-update'));
      alert(`✅ 換貨完成！\n\n換貨單 [${finalExNo}] 已建立，換回的品項已回到在庫。\n`
        + `出貨單 [${dnNo}] 已建立（已出貨），可到「已出貨」頁籤列印交貨簽收單。`);
      onSuccess?.({ exNo: finalExNo, dnNo });
      onClose();
    } catch (e) {
      setError(`換貨失敗：${e.message}\n所有變更已退回。`);
    } finally {
      setSaving(false);
    }
  };

  /** 右邊的一區（換回或換出） */
  const renderLines = (side) => {
    const d = DIRS[side];
    const Icon = d.icon;
    const list = side === 'in' ? inLines : outLines;
    return (
      <div data-testid={`exchange-${side}-list`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 800, color: d.color, margin: '2px 0 8px' }}>
          <Icon size={16} /> {d.title} ({list.length})
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{d.hint}</span>
        </div>
        {list.length === 0 ? (
          <div style={{ padding: '14px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
            尚未加入{d.title}的品項
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {list.map((l, idx) => (
              <div key={l.kind === 'ASSET' ? `a-${l.assetId}` : `c-${l.itemId}`} className="outbound-item-row" style={{ borderLeft: `3px solid ${d.color}` }}>
                <div className="item-row-left">
                  <span className={`cat-pill cat-${catClass(l.categoryName)}`}>{l.categoryName || '耗材'}</span>
                  <div className="item-main-info">
                    <div className="item-title">{l.brand} {l.model}</div>
                    <div className="item-subtitle">{l.specification}</div>
                    {l.sn && <div className="item-sn">S/N: <strong>{l.sn}</strong></div>}
                    {l.mountedCount > 0 && (
                      <div className="item-subtitle">搭載的 {l.mountedCount} 件硬體一起{side === 'in' ? '換回' : '出貨'}</div>
                    )}
                  </div>
                </div>
                <div className="item-row-right">
                  {l.kind === 'ASSET' ? (
                    <span className="qty-tag">1 台/件</span>
                  ) : (
                    <div className="qty-control">
                      <button type="button" onClick={() => updateQty(side, idx, l.qty - 1)} aria-label={`減少 ${lineLabel(l)}`}>-</button>
                      <input type="number" value={l.qty} aria-label={`${d.title}數量 ${l.brand} ${l.model}`}
                        onChange={(e) => updateQty(side, idx, parseInt(e.target.value, 10))} />
                      <button type="button" onClick={() => updateQty(side, idx, l.qty + 1)} aria-label={`增加 ${lineLabel(l)}`}>+</button>
                    </div>
                  )}
                  <button type="button" className="btn-del-item" onClick={() => removeLine(side, idx)} aria-label={`移除 ${lineLabel(l)}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const DirIcon = DIRS[dir].icon;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(5px)', padding: '20px' }}>
      <div role="dialog" aria-label="新增換貨單" style={{ backgroundColor: 'var(--bg-surface)', width: '100%', maxWidth: '1200px', maxHeight: '92vh', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 標題列（比照新增出貨單） */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
                <Repeat size={22} color="#6366f1" /> 新增換貨單 (Customer Exchange)
              </h2>
              {exNo && (
                <span style={{ padding: '4px 10px', borderRadius: '6px', backgroundColor: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', fontWeight: 800, fontSize: '13px', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                  單號: {exNo}
                </span>
              )}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
              客戶拿東西來換別的（例如 10G-LR 換成 10G-SR）：換回的直接回到在庫（不開進貨單），換出的自動產生一張已出貨的出貨單。
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="關閉"
            style={{ width: '36px', height: '36px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <div className="dn-content-layout">
            {/* 左側：單據資訊與挑選 */}
            <div className="dn-left-panel">
              <div className="dn-card">
                <div className="dn-card-header"><User size={18} /> <span>單據基本資訊</span></div>
                <div className="dn-form-grid">
                  <div className="dn-field">
                    <label>換貨單號 (EX No.) <span style={{ fontSize: '11px', color: 'var(--primary-color)', fontWeight: 600 }}>[系統自動編號 · 鎖定]</span></label>
                    <div className="input-with-icon">
                      <ClipboardList size={16} />
                      <input type="text" readOnly value={exNo || '計算中...'}
                        style={{ backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', fontWeight: 700, cursor: 'not-allowed' }} />
                    </div>
                  </div>
                  <div className="dn-field">
                    <label htmlFor="ex-customer">換貨對象 (客戶) *</label>
                    <div className="select-wrapper">
                      <select id="ex-customer" value={customerId} onChange={(e) => pickCustomer(e.target.value)} disabled={loading}>
                        <option value="">{loading ? '讀取中…' : '請選擇客戶...'}</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} {c.contact ? `(${c.contact})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="dn-field">
                    <label htmlFor="ex-date">換貨日期 *</label>
                    <div className="input-with-icon">
                      <Calendar size={16} />
                      <input id="ex-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="dn-field">
                    <label>聯絡資訊 (自動帶出)</label>
                    <div className="input-with-icon">
                      <User size={16} />
                      <input type="text" readOnly placeholder="系統自動帶出..."
                        value={customer ? [customer.contact, customer.phone].filter(Boolean).join(' ') : ''}
                        style={{ backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', cursor: 'not-allowed' }} />
                    </div>
                  </div>
                  <div className="dn-field">
                    <label htmlFor="ex-location">出貨地點</label>
                    <div className="input-with-icon">
                      <MapPin size={16} />
                      <input id="ex-location" type="text" placeholder="出貨地點" value={location} onChange={(e) => setLocation(e.target.value)} />
                    </div>
                  </div>
                  <div className="dn-field">
                    <label htmlFor="ex-remarks">備註</label>
                    <div className="input-with-icon">
                      <MessageSquare size={16} />
                      <input id="ex-remarks" type="text" placeholder="備註" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                    </div>
                  </div>
                  <div className="dn-field full-width">
                    <label htmlFor="ex-reason">換貨原因 *</label>
                    <div className="input-with-icon">
                      <MessageSquare size={16} />
                      <input id="ex-reason" type="text" placeholder="例如：客戶下錯單，10G-LR 換成 10G-SR" value={reason} onChange={(e) => setReason(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* 目前要加到哪一邊 */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }} role="group" aria-label="加入到">
                {Object.entries(DIRS).map(([key, d]) => {
                  const Icon = d.icon;
                  const active = dir === key;
                  return (
                    <button key={key} type="button" aria-pressed={active}
                      onClick={() => { setDir(key); setSnInput(''); setError(''); }}
                      style={{
                        flex: 1, padding: '10px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 800, fontSize: '0.9rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        border: `1px solid ${active ? d.color : 'var(--border-color)'}`,
                        backgroundColor: active ? d.color : 'var(--bg-surface)',
                        color: active ? '#fff' : 'var(--text-muted)',
                      }}>
                      <Icon size={16} /> 加入{d.title}
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.85 }}>（{d.hint}）</span>
                    </button>
                  );
                })}
              </div>

              {/* 序號品項 */}
              <div className="dn-card sn-card">
                <div className="dn-card-header">
                  <Cpu size={18} /> <span>資產序號匯入 (S/N Scan)</span>
                  <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 800, color: DIRS[dir].color, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <DirIcon size={14} /> 加入{DIRS[dir].title}
                  </span>
                </div>
                <form className="sn-search-box device-box" style={{ position: 'relative' }} onSubmit={handleSnSubmit}>
                  <input
                    type="text"
                    aria-label="搜尋序號品項"
                    placeholder={isOut ? '輸入在庫設備／硬體序號、廠牌、型號搜尋 (可點選直接加入)...' : '輸入客戶手上的設備／硬體序號、廠牌、型號搜尋 (可點選直接加入)...'}
                    value={snInput}
                    onChange={(e) => { setSnInput(e.target.value); setShowSnDropdown(true); }}
                    onFocus={() => { clearTimeout(blurTimer.current); setShowSnDropdown(true); }}
                    // 延遲關閉，點選建議時才來得及加入；馬上又點回來就取消這次關閉
                    onBlur={() => { blurTimer.current = setTimeout(() => setShowSnDropdown(false), 250); }}
                  />
                  <button type="submit"><Search size={14} /> 加入{DIRS[dir].title}</button>
                  {showSnDropdown && (
                    <div className="autocomplete-dropdown">
                      <div className="ac-dropdown-header">
                        <span>
                          {isOut ? '在庫設備／硬體' : customer ? `${customer.name} 手上已出貨的設備／硬體` : '客戶手上的設備／硬體'}
                          {` (${snSuggestions.length}) · 點擊直接加入`}
                        </span>
                      </div>
                      {!isOut && !customer ? (
                        <div className="empty-hint" style={{ padding: '16px', fontSize: '13px', textAlign: 'center' }}>先選客戶，才列得出客戶手上的序號品項</div>
                      ) : snSuggestions.length === 0 ? (
                        <div className="empty-hint" style={{ padding: '16px', fontSize: '13px', textAlign: 'center' }}>
                          {snTerm ? `無符合「${snInput}」的品項` : isOut ? '沒有在庫的序號品項' : '這位客戶沒有已出貨的序號品項'}
                        </div>
                      ) : snSuggestions.map((a) => (
                        <div key={a.id} className="autocomplete-item" role="option" aria-selected="false" aria-label={`加入 ${a.sn}`}
                          onMouseDown={(e) => { e.preventDefault(); addAsset(a); }}>
                          <div className="ac-header">
                            <span className={`ac-badge ac-badge-${a.category_name === '設備' ? 'device' : 'hw'}`}>{a.type || a.category_name}</span>
                            <span className="ac-title">{a.brand} {a.model}</span>
                            <span className="ac-add-hint"><Plus size={12} /> 加入</span>
                          </div>
                          {a.specification && <div className="ac-spec">{a.specification}</div>}
                          <div className="ac-meta">
                            <span className="ac-sn">S/N: <strong>{a.sn}</strong></span>
                            {a.mounted_count > 0 && <span className="ac-loc">搭載 {a.mounted_count} 件硬體</span>}
                            {isOut && a.mounted_consumables > 0 && <span className="ac-loc" style={{ color: '#ef4444' }}>掛有耗材，請用一般出貨單</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </form>
              </div>

              {/* 耗材 */}
              <div className="dn-card">
                <div className="dn-card-header">
                  <Package size={18} /> <span>耗材庫存快選 (Consumables)</span>
                  <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 800, color: DIRS[dir].color, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <DirIcon size={14} /> 加入{DIRS[dir].title}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', padding: '12px 18px' }}>
                  <select value={csmBrand} onChange={(e) => { setCsmBrand(e.target.value); setCsmType(''); setCsmModel(''); }} style={filterSelect} aria-label="耗材廠牌">
                    <option value="">廠牌 (未選擇)</option>
                    {csmBrands.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <select value={csmType} onChange={(e) => { setCsmType(e.target.value); setCsmModel(''); }} style={filterSelect} aria-label="耗材類型">
                    <option value="">類型 (未選擇)</option>
                    {csmTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={csmModel} onChange={(e) => setCsmModel(e.target.value)} style={filterSelect} aria-label="耗材型號">
                    <option value="">型號 (未選擇)</option>
                    {csmModels.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <input type="text" placeholder="搜尋耗材..." value={csmTerm} onChange={(e) => setCsmTerm(e.target.value)} style={filterSelect} aria-label="搜尋耗材" />
                </div>
                <div className="consumables-scroll-box">
                  {!hasCsmFilter ? (
                    <div className="empty-hint" style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <Package size={28} style={{ opacity: 0.35, color: 'var(--text-muted)' }} />
                      <div style={{ fontWeight: 600 }}>請先選擇廠牌 / 類型 / 型號，或輸入關鍵字搜尋耗材</div>
                      <div style={{ fontSize: '12px', opacity: 0.7 }}>點選耗材卡片加入{DIRS[dir].title}，數量在右邊調整</div>
                    </div>
                  ) : shownCsm.length === 0 ? (
                    <div className="empty-hint">無符合篩選條件之耗材</div>
                  ) : (
                    <div className="consumables-grid">
                      {shownCsm.map((c) => {
                        const blocked = isOut && !(Number(c.stock_qty) > 0);
                        return (
                          <div key={c.id} className="csm-btn" role="button" tabIndex={0}
                            aria-label={`加入${DIRS[dir].title} ${c.brand} ${c.model}`} aria-disabled={blocked}
                            onClick={() => addConsumable(c)}
                            onKeyDown={(e) => { if (e.key === 'Enter') addConsumable(c); }}
                            style={blocked ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                            title={blocked ? '在庫為 0，不能換出' : undefined}>
                            <div className="csm-btn-header">
                              <span className="csm-brand">{c.brand}</span>
                              <span className="csm-stock">存: {c.stock_qty ?? 0}</span>
                            </div>
                            <div className="csm-model">{c.model}</div>
                            <div className="csm-spec">{c.specification}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 右側：換貨品項與送出 */}
            <div className="dn-right-panel">
              <div className="dn-card dn-items-card">
                <div className="dn-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ClipboardList size={18} /> <span>換貨品項 ({inLines.length + outLines.length})</span>
                  </div>
                  {inLines.length + outLines.length > 0 && (
                    <button type="button" onClick={() => { setInLines([]); setOutLines([]); }}
                      style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                      清空品項
                    </button>
                  )}
                </div>
                <div className="dn-items-container" style={{ gap: '18px' }}>
                  {renderLines('in')}
                  {renderLines('out')}
                </div>
                {error && (
                  <div role="alert" style={{ margin: '0 18px 12px', display: 'flex', gap: '6px', color: '#ef4444', fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'pre-wrap' }}>
                    <AlertCircle size={16} style={{ flexShrink: 0 }} /> {error}
                  </div>
                )}
                <div className="dn-card-footer">
                  <button type="button" className="btn-submit-dn" onClick={handleSubmit}
                    disabled={saving || loading || inLines.length === 0 || outLines.length === 0}
                    style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)' }}>
                    <Repeat size={18} /> {saving ? '處理中…' : '確認換貨並建立出貨單'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerExchangeModal;
