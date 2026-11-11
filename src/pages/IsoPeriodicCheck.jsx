import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Download, ScrollText, DatabaseBackup, ArrowLeft, Plus, Pencil, Trash2, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RoleContext } from '../context/RoleContext';
import IsoPeriodicCheckModal from '../components/IsoPeriodicCheckModal';
import IsoPeriodicCheckSheet, { SHEET_WIDTH, SHEET_HEIGHT } from '../components/IsoPeriodicCheckSheet';
import {
  ISO_CHECK_FORMS, REVIEW_INTERVAL_DAYS, rocYear, formatRocDate, reviewStatus, daysAgoText,
  resultOf, recordsOfYear, paginateRecords, formFileName,
} from '../utils/isoPeriodicCheck';
import { buildImagePdf, dataUrlToBytes } from '../utils/imagePdf';

/** 等圖片（LOGO）與字型都載好再拍照，否則 PDF 上會缺；一張最多等 5 秒，不會卡住 */
const waitForAssets = async (root) => {
  await Promise.all([...root.querySelectorAll('img')].map((img) => (img.complete ? null
    : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 5000); }))));
  await document.fonts?.ready;
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const FORM_ICONS = { 'S-409-01': DatabaseBackup, 'S-409-02': ScrollText };

const th = { padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' };
const td = { padding: '10px 12px', fontSize: '13px', borderBottom: '1px solid var(--border-color)', verticalAlign: 'top' };
const iconBtn = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' };

/** 列表上的結果：正常（綠，備份檢查帶最後備份日）／異常（紅，帶說明） */
const ResultBadge = ({ result }) => {
  if (!result) return <span style={{ color: 'var(--text-subtle)' }}>—</span>;
  const abnormal = result.status === 'ABNORMAL';
  const extra = abnormal ? result.note : (result.lastBackup ? `最後備份日：${result.lastBackup}` : '');
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 800, color: abnormal ? '#be123c' : '#059669' }}>
        {abnormal ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}{abnormal ? '異常' : '正常'}
      </span>
      {extra && <span style={{ fontSize: '12px', color: 'var(--text-muted)', wordBreak: 'break-word' }}>{extra}</span>}
    </span>
  );
};

/**
 * 報表中心：ISO 27001 定期檢查紀錄（S-409-01 備份檢查紀錄表、S-409-02 日誌審查紀錄表，見 utils/isoPeriodicCheck.js）
 *
 * 每兩週檢查一次，在這裡新增一筆；檢查人員是新增時登入的帳號（伺服器決定，不能代填）。
 * 依年度照公司範本格式預覽、下載 PDF。
 */
const IsoPeriodicCheck = ({ formCode }) => {
  const def = ISO_CHECK_FORMS[formCode];
  const Icon = FORM_ICONS[formCode] || ScrollText;
  const navigate = useNavigate();
  const { authUser } = useContext(RoleContext) || {};
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [editing, setEditing] = useState(null); // null 關閉；{ record: null } 新增；{ record } 修改
  const [exporting, setExporting] = useState(false);
  const [renderForPdf, setRenderForPdf] = useState(false);
  const [scale, setScale] = useState(1);
  const previewRef = useRef(null);
  const pdfRef = useRef(null);

  const load = useCallback(async () => {
    const res = await window.electronAPI.isoCheck('GET', formCode);
    if (res?.success) { setRecords(res.rows || []); setError(''); }
    else { setRecords([]); setError(res?.error || '讀取失敗'); }
    setLoading(false);
  }, [formCode]);

  useEffect(() => { load(); }, [load]);

  // 預覽縮放到放得進畫面寬度
  useEffect(() => {
    const el = previewRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setScale(Math.min(1, w / SHEET_WIDTH));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const years = useMemo(() => {
    const set = new Set([new Date().getFullYear(), year]);
    records.forEach((r) => { const y = Number(String(r.checkDate).slice(0, 4)); if (y) set.add(y); });
    return [...set].sort((a, b) => b - a);
  }, [records, year]);

  const yearRecords = useMemo(() => recordsOfYear(records, year), [records, year]);
  const pages = paginateRecords(yearRecords, def.perPage);
  // 列表新的在上面；狀態看所有年度最新的一筆（伺服器已依日期新到舊排好）
  const listRows = [...yearRecords].reverse();
  const status = reviewStatus(records[0]?.checkDate || null);
  const myName = authUser?.full_name || authUser?.username || '';

  const renderSheets = () => pages.map((pageRecords, i) => (
    <IsoPeriodicCheckSheet key={i} def={def} records={pageRecords} page={i + 1} pageCount={pages.length} />
  ));

  const handleSaved = async (row) => {
    setEditing(null);
    const y = Number(String(row?.checkDate || '').slice(0, 4));
    if (y) setYear(y);
    await load();
  };

  const handleDelete = async (record) => {
    if (!window.confirm(`確定要刪除 ${formatRocDate(record.checkDate)} 的${def.docName}（${def.verb}人員 ${record.reviewerName}）嗎？`)) return;
    const res = await window.electronAPI.isoCheck('DELETE', formCode, record.id);
    if (!res?.success) { alert('刪除失敗：' + (res?.error || '未知錯誤')); return; }
    await load();
  };

  const handleExport = async () => {
    setExporting(true);
    setRenderForPdf(true);
    try {
      await nextFrame();
      const root = pdfRef.current;
      if (!root) throw new Error('找不到表單頁面');
      await waitForAssets(root);
      const images = [];
      for (const sheet of root.querySelectorAll('.iso-periodic-check-sheet')) {
        const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true, width: SHEET_WIDTH, height: SHEET_HEIGHT });
        images.push({ jpeg: dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92)), width: canvas.width, height: canvas.height });
      }
      const blob = new Blob([buildImagePdf(images)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = formFileName(def, year);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      alert('下載 PDF 失敗：' + err.message);
    } finally {
      setRenderForPdf(false);
      setExporting(false);
    }
  };

  const colCount = def.items.length + 3;

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: 'var(--page-title-size, 1.35rem)', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
            <Icon size={24} color="#0f766e" /> {def.docName} (ISO 27001 {def.code})
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '2px 0 0' }}>
            每兩週{def.verb}一次{def.summary}，每次新增一筆：{def.verb}日期預設當天、可以修改，{def.verb}結果勾選正常或異常（異常要寫說明{def.lastBackup ? '，正常要填最後備份日' : ''}），{def.verb}人員為新增時登入的帳號。依年度照公司範本格式預覽並下載 PDF。
          </p>
        </div>
        <button type="button" onClick={() => navigate('/reports')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer' }}>
          <ArrowLeft size={15} /> 報表中心
        </button>
      </div>

      {/* 狀態：超過兩週沒做就醒目提醒（營運總覽也有） */}
      {!loading && !error && (
        <div role="status" data-testid="iso-check-status" data-overdue={status.overdue ? 'true' : 'false'}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '12px 16px', marginBottom: '14px', borderRadius: '12px', fontSize: '13px', fontWeight: 700,
            border: `1px solid ${status.overdue ? 'rgba(220, 38, 38, 0.55)' : 'rgba(16, 185, 129, 0.4)'}`,
            backgroundColor: status.overdue ? 'rgba(220, 38, 38, 0.1)' : 'rgba(16, 185, 129, 0.08)',
            color: status.overdue ? '#dc2626' : '#059669',
          }}>
          {status.overdue ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          {status.lastDate
            ? <span>最後{def.verb}日期：{formatRocDate(status.lastDate)}（{daysAgoText(status.days)}）</span>
            : <span>還沒有任何{def.verb}紀錄</span>}
          {status.overdue && (
            <span style={{ fontWeight: 900 }}>
              {status.lastDate ? `已超過 ${REVIEW_INTERVAL_DAYS} 天（雙周）未${def.verb}，請盡快${def.verb}並新增紀錄` : `請進行第一次${def.verb}並新增紀錄`}
            </span>
          )}
        </div>
      )}

      <div className="card-surface" style={{ padding: '16px', borderRadius: 'var(--card-radius, 14px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <label htmlFor="iso-check-year" style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-muted)' }}>年度</label>
          <select id="iso-check-year" value={year} onChange={(e) => setYear(Number(e.target.value))}
            style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '14px' }}>
            {years.map((y) => <option key={y} value={y}>{rocYear(y)}年（{y}）</option>)}
          </select>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>共 {yearRecords.length} 次{def.verb}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setEditing({ record: null })} disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#0f766e', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}>
              <Plus size={15} /> 新增{def.verb}紀錄
            </button>
            <button type="button" onClick={handleExport} disabled={exporting || loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: exporting || loading ? 'var(--border-color)' : '#2b579a', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: exporting ? 'wait' : 'pointer' }}>
              <Download size={15} /> {exporting ? '產生 PDF 中...' : '下載 PDF'}
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', marginBottom: '12px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <AlertCircle size={16} /> 讀取失敗：{error}
          </div>
        )}

        <div style={{ overflowX: 'auto', marginBottom: '18px' }}>
          <table aria-label={`${def.docName}紀錄`} style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
            <thead>
              <tr>
                <th style={th}>{def.verb}日期</th>
                {def.items.map((item) => <th key={item.key} style={th}>{item.label}</th>)}
                <th style={th}>{def.verb}人員</th>
                <th style={{ ...th, textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {!loading && listRows.length === 0 && (
                <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>{rocYear(year)}年還沒有{def.verb}紀錄</td></tr>
              )}
              {listRows.map((r) => (
                <tr key={r.id} data-testid={`iso-check-row-${r.id}`}>
                  <td style={{ ...td, fontWeight: 800, whiteSpace: 'nowrap' }}>{formatRocDate(r.checkDate)}</td>
                  {def.items.map((item) => <td key={item.key} style={td}><ResultBadge result={resultOf(r, item.key)} /></td>)}
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.reviewerName}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.canManage ? (
                      <span style={{ display: 'inline-flex', gap: '6px' }}>
                        <button type="button" onClick={() => setEditing({ record: r })} style={iconBtn}><Pencil size={12} /> 修改</button>
                        <button type="button" onClick={() => handleDelete(r)} style={{ ...iconBtn, color: '#be123c' }}><Trash2 size={12} /> 刪除</button>
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>{def.verb}人員本人或管理員可修改</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 預覽：跟 PDF 一樣的 A4 橫式頁面，依畫面寬度縮小 */}
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          {loading ? '讀取中...' : `表單預覽（${rocYear(year)}年）：共 ${pages.length} 頁，一頁 ${def.perPage} 次${def.verb}${yearRecords.length === 0 ? '（還沒有紀錄，仍會產生空白表單）' : ''}`}
        </div>
        <div ref={previewRef} aria-label={`${def.docName}預覽`} style={{ display: 'flex', flexDirection: 'column', gap: '16px', opacity: loading ? 0.4 : 1 }}>
          {!loading && renderSheets().map((sheet, i) => (
            <div key={i} style={{ width: `${SHEET_WIDTH * scale}px`, height: `${SHEET_HEIGHT * scale}px`, boxShadow: '0 2px 10px rgba(0,0,0,0.18)', border: '1px solid var(--border-color)', overflow: 'hidden', margin: '0 auto' }}>
              <div style={{ width: `${SHEET_WIDTH}px`, height: `${SHEET_HEIGHT}px`, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{sheet}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 下載 PDF 用：原尺寸、畫在畫面外 */}
      {renderForPdf && (
        <div ref={pdfRef} aria-hidden="true" style={{ position: 'fixed', left: '-20000px', top: 0, width: `${SHEET_WIDTH}px`, pointerEvents: 'none' }}>
          {renderSheets()}
        </div>
      )}

      {editing && (
        <IsoPeriodicCheckModal
          def={def}
          record={editing.record}
          reviewerName={editing.record ? editing.record.reviewerName : myName}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default IsoPeriodicCheck;
