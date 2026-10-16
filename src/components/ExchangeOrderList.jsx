import React, { useCallback, useEffect, useState } from 'react';
import { Search, Repeat, AlertCircle, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import CustomerExchangeModal from './CustomerExchangeModal';

const cell = { padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontSize: '0.85rem', verticalAlign: 'top' };
const head = { ...cell, fontSize: '0.88rem', color: 'var(--table-header-text)', fontWeight: 800, position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)', textAlign: 'left' };
const fmtDate = (d) => (d ? String(d).slice(0, 10) : '-');

const itemText = (x) => {
  const name = [x.brand, x.model].filter(Boolean).join(' ') || '品項';
  return x.sn ? `${name} [${x.sn}]` : `${name} ×${x.quantity}`;
};

/** 換回／換出的品項，一項一行 */
const Items = ({ items, color, icon }) => (
  items.length === 0 ? <span style={{ color: 'var(--text-subtle)' }}>-</span> : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {items.map((x, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
          <span style={{ color, display: 'inline-flex' }}>{icon}</span>{itemText(x)}
        </span>
      ))}
    </div>
  )
);

/**
 * 出貨單列表的「換貨」頁籤：客戶換貨單列表與新增（見 utils/customerExchange.js）
 */
const ExchangeOrderList = ({ onCreated }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);

  // 新增完換貨單後加一，重新讀取
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.namedQuery('fetchExchangeOrders').then((res) => {
      if (cancelled) return;
      if (res?.success) {
        setRows(res.rows || []);
        setError('');
      } else {
        setError(`讀取換貨單失敗：${res?.error || '未知錯誤'}（若剛更新系統，請先執行 npm run migrate）`);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const term = searchTerm.trim().toLowerCase();
  const shown = rows.filter((r) => !term || [
    r.exchange_no, r.customer, r.dn_no, r.reason,
    ...(r.items || []).flatMap((x) => [x.sn, x.brand, x.model]),
  ].some((v) => String(v || '').toLowerCase().includes(term)));

  return (
    <>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '12px', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: '320px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
          <input
            type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜尋換貨單號、客戶、出貨單號、品項、序號..." aria-label="搜尋換貨單"
            style={{ width: '100%', padding: '8px 10px 8px 36px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '0.88rem', boxSizing: 'border-box' }}
          />
        </div>
        <button
          type="button" onClick={() => setShowModal(true)}
          style={{ marginLeft: 'auto', padding: '8px 16px', backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Repeat size={16} /> 新增換貨單
        </button>
      </div>

      <div style={{ padding: '16px' }}>
        {error && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', marginBottom: '14px' }}>
            <AlertCircle size={18} /> <span>{error}</span>
          </div>
        )}
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', minHeight: '300px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={head}>換貨單號</th>
                <th style={head}>換貨日期</th>
                <th style={head}>客戶</th>
                <th style={head}>換回（回在庫）</th>
                <th style={head}>換出</th>
                <th style={head}>出貨單</th>
                <th style={head}>原因</th>
                <th style={head}>建立者</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>讀取中...</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  {term ? '沒有符合的換貨單' : '目前尚無換貨單'}
                </td></tr>
              ) : shown.map((r) => {
                const items = r.items || [];
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                    <td style={{ ...cell, fontWeight: 800, color: '#6366f1', whiteSpace: 'nowrap' }}>{r.exchange_no}</td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>{fmtDate(r.exchange_date)}</td>
                    <td style={cell}>{r.customer}</td>
                    <td style={cell}><Items items={items.filter((x) => x.direction === 'IN')} color="#10b981" icon={<ArrowDownToLine size={13} />} /></td>
                    <td style={cell}><Items items={items.filter((x) => x.direction === 'OUT')} color="#3b82f6" icon={<ArrowUpFromLine size={13} />} /></td>
                    <td style={{ ...cell, whiteSpace: 'nowrap', fontWeight: 700 }}>{r.dn_no || '-'}</td>
                    <td style={{ ...cell, color: 'var(--text-muted)', maxWidth: '260px' }}>
                      {r.reason || '-'}
                      {r.remarks && <div style={{ fontSize: '0.78rem' }}>備註：{r.remarks}</div>}
                    </td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>{r.creator_name || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CustomerExchangeModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => { reload(); onCreated?.(); }}
      />
    </>
  );
};

export default ExchangeOrderList;
