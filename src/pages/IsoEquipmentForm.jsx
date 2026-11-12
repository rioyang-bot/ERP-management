import React, { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Download, ShieldCheck, ArrowDownToLine, ArrowUpFromLine, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import IsoSignoffPanel from '../components/IsoSignoffPanel';
import IsoEquipmentSheet, { SHEET_WIDTH, SHEET_HEIGHT } from '../components/IsoEquipmentSheet';
import { toFormRows, monthRange, rocYear, paginate, formFileName, SIGN_ROLES } from '../utils/isoEquipmentForm';
import { buildImagePdf, dataUrlToBytes } from '../utils/imagePdf';

const FORM_CODE = 'S-408-02';

/** 預設本月 */
const defaultMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** 等圖片（LOGO、簽名）與字型都載好再拍照，否則 PDF 上會缺；一張最多等 5 秒，不會卡住 */
const waitForAssets = async (root) => {
  await Promise.all([...root.querySelectorAll('img')].map((img) => (img.complete ? null
    : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 5000); }))));
  await document.fonts?.ready;
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/**
 * 報表中心：ISO 27001「S-408-02 設備攜出入單」依月份預覽並下載 PDF（見 utils/isoEquipmentForm.js）
 *
 * 每個月由機房管理員、權責主管登入線上簽核（見 server/isoSignatureRoutes.js），
 * 預覽與 PDF 每頁頁尾都帶簽名；簽核後資料有異動的簽名不印，要重新簽。
 *
 * 預覽依畫面寬度縮小；下載時另外畫一份原尺寸的（畫面外），逐頁拍照組成 PDF。
 */
const IsoEquipmentForm = () => {
  const navigate = useNavigate();
  // 營運總覽的待簽提醒會帶 ?month=YYYY-MM 直接開那個月；沒帶或格式不對就開本月
  const [searchParams] = useSearchParams();
  const [month, setMonth] = useState(() => {
    const m = searchParams.get('month');
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '') ? m : defaultMonth();
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  // 有效的簽名（簽核區讀到後通知；簽核後資料有異動的不算）
  const [validSignatures, setValidSignatures] = useState({});
  const [renderForPdf, setRenderForPdf] = useState(false);
  const [scale, setScale] = useState(1);
  const previewRef = useRef(null);
  const pdfRef = useRef(null);

  const [y, m] = month.split('-').map(Number);

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

  const pages = paginate(rows);

  const renderSheets = () => pages.map((pageRows, i) => (
    <IsoEquipmentSheet key={i} year={y} month={m} rows={pageRows} page={i + 1} pageCount={pages.length} signatures={validSignatures} />
  ));

  const handleExport = async () => {
    setExporting(true);
    setRenderForPdf(true);
    try {
      await nextFrame();
      const root = pdfRef.current;
      if (!root) throw new Error('找不到表單頁面');
      await waitForAssets(root);
      const images = [];
      for (const sheet of root.querySelectorAll('.iso-equipment-sheet')) {
        const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true, width: SHEET_WIDTH, height: SHEET_HEIGHT });
        images.push({ jpeg: dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92)), width: canvas.width, height: canvas.height });
      }
      const blob = new Blob([buildImagePdf(images)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = formFileName(y, m);
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

  const outCount = rows.filter((r) => r.direction === 'OUT').length;
  const inCount = rows.filter((r) => r.direction === 'IN').length;

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: 'var(--page-title-size, 1.35rem)', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
            <ShieldCheck size={24} color="#ea580c" /> 設備攜出入單 (ISO 27001 S-408-02)
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '2px 0 0' }}>
            依月份把設備的進出（進貨、出貨、借出、歸還、換貨、維修取回／送修原廠／原廠返還／完工交回）照公司的設備攜出入單格式排版，一台設備一列並列出序號；只列設備，硬體與耗材不列入。機房管理員、權責主管線上簽核後，預覽與 PDF 每頁頁尾都會帶簽名。
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
            <Download size={15} /> {exporting ? '產生 PDF 中...' : '下載 PDF'}
          </button>
        </div>

        {error && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', marginBottom: '12px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <AlertCircle size={16} /> 讀取失敗：{error}
          </div>
        )}

        {/* 線上簽核：每個月機房管理員、權責主管各簽一次，用自己帳號的簽名檔 */}
        <IsoSignoffPanel formCode={FORM_CODE} formLabel="設備攜出入單" period={month} roles={SIGN_ROLES} disabled={loading} onSignaturesChange={setValidSignatures} />

        {/* 預覽：跟 PDF 一樣的 A4 橫式頁面，依畫面寬度縮小 */}
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          {loading ? '讀取中...' : `預覽：共 ${pages.length} 頁${rows.length === 0 ? '（這個月沒有設備進出，仍會產生空白表單）' : ''}`}
        </div>
        <div ref={previewRef} aria-label="設備攜出入單預覽" style={{ display: 'flex', flexDirection: 'column', gap: '16px', opacity: loading ? 0.4 : 1 }}>
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
    </div>
  );
};

export default IsoEquipmentForm;
