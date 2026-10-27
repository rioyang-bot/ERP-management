import React, { useEffect, useState } from 'react';
import { FileText, ShieldCheck, ArrowDownToLine, ArrowUpFromLine, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toFormRows, monthRange, rocYear, fillEquipmentForm, formFileName } from '../utils/isoEquipmentForm';
import templateUrl from '../assets/templates/S-408-02-equipment-in-out-v1.0.docx?url';

/** 預設本月 */
const defaultMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const th = { padding: '8px 10px', fontSize: '12px', fontWeight: 800, color: 'var(--table-header-text)', backgroundColor: 'var(--table-header-bg)', borderBottom: '2px solid var(--border-color)', textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '13px', borderBottom: '1px solid var(--table-border)', color: 'var(--text-main)' };

/**
 * 報表中心：ISO 27001「S-408-02 設備攜出入單」依月份匯出（見 utils/isoEquipmentForm.js）
 */
const IsoEquipmentForm = () => {
  const navigate = useNavigate();
  const [month, setMonth] = useState(defaultMonth());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const [y, m] = month.split('-').map(Number);

  useEffect(() => {
    if (!y || !m) return undefined;
    let cancelled = false;
    window.electronAPI.namedQuery('fetchEquipmentMovements', monthRange(y, m)).then((res) => {
      if (cancelled) return;
      if (res?.success) { setRows(toFormRows(res.rows || [])); setError(''); }
      else { setRows([]); setError(res?.error || '讀取失敗'); }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [y, m]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const template = await (await fetch(templateUrl)).arrayBuffer();
      const blob = await fillEquipmentForm(template, { year: y, month: m, rows });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = formFileName(y, m);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      alert('匯出失敗：' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const outCount = rows.filter((r) => r.direction === 'OUT').reduce((s, r) => s + r.qty, 0);
  const inCount = rows.filter((r) => r.direction === 'IN').reduce((s, r) => s + r.qty, 0);

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: 'var(--page-title-size, 1.35rem)', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
            <ShieldCheck size={24} color="#ea580c" /> 設備攜出入單 (ISO 27001 S-408-02)
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '2px 0 0' }}>
            依月份把設備的進出（進貨、出貨、借出、歸還、換貨、維修取回／送修原廠／原廠返還／完工交回）填進公司的設備攜出入單範本，頁首頁尾照範本。只列設備，硬體與耗材不列入；相同廠牌／型號／規格加總數量。
          </p>
        </div>
        <button type="button" onClick={() => navigate('/reports')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer' }}>
          <ArrowLeft size={15} /> 報表中心
        </button>
      </div>

      <div className="card-surface" style={{ padding: '16px', borderRadius: 'var(--card-radius, 14px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <label htmlFor="iso-month" style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-muted)' }}>月份</label>
          <input id="iso-month" type="month" value={month} onChange={(e) => { setLoading(true); setMonth(e.target.value); }}
            style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '14px' }} />
          {y && m && <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{rocYear(y)}年{String(m).padStart(2, '0')}月份</span>}
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'inline-flex', gap: '12px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#3b82f6' }}><ArrowUpFromLine size={13} /> 攜出 {outCount}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#10b981' }}><ArrowDownToLine size={13} /> 攜入 {inCount}</span>
          </span>
          <button type="button" onClick={handleExport} disabled={exporting || loading || !y}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: exporting || loading ? 'var(--border-color)' : '#2b579a', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: exporting ? 'wait' : 'pointer' }}>
            <FileText size={15} /> {exporting ? '匯出中...' : '匯出 Word'}
          </button>
        </div>

        {error && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', marginBottom: '12px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <AlertCircle size={16} /> 讀取失敗：{error}
          </div>
        )}

        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="設備攜出入預覽">
            <thead>
              <tr>
                <th style={th}>日期</th><th style={th}>設備名稱</th><th style={{ ...th, textAlign: 'right' }}>數量</th>
                <th style={th}>用途</th><th style={th}>原因</th><th style={th}>廠商</th>
                <th style={th}>機房管理員</th><th style={th}>權責主管</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>讀取中...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>這個月沒有設備進出（匯出時仍會產生空白表單）</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={td}>{r.name}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{r.qty}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700, color: r.direction === 'OUT' ? '#3b82f6' : '#10b981' }}>{r.direction === 'OUT' ? '攜出' : '攜入'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.reason}</td>
                  <td style={td}>{r.vendor}</td>
                  <td style={{ ...td, color: 'var(--text-subtle)' }}>（簽名）</td>
                  <td style={{ ...td, color: 'var(--text-subtle)' }}>（簽名）</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default IsoEquipmentForm;
