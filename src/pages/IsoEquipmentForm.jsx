import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Download, ShieldCheck, ArrowDownToLine, ArrowUpFromLine, AlertCircle, ArrowLeft, PenLine, Undo2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RoleContext } from '../context/RoleContext';
import SignaturePadModal from '../components/SignaturePadModal';
import IsoEquipmentSheet, { SHEET_WIDTH, SHEET_HEIGHT } from '../components/IsoEquipmentSheet';
import { toFormRows, monthRange, rocYear, paginate, formFileName, SIGN_ROLES } from '../utils/isoEquipmentForm';
import { buildImagePdf, dataUrlToBytes } from '../utils/imagePdf';

const FORM_CODE = 'S-408-02';

/** 預設本月 */
const defaultMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const formatSignedAt = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${rocYear(d.getFullYear())}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 等圖片（LOGO、簽名）與字型都載好再拍照，否則 PDF 上會缺；一張最多等 5 秒，不會卡住 */
const waitForAssets = async (root) => {
  await Promise.all([...root.querySelectorAll('img')].map((img) => (img.complete ? null
    : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 5000); }))));
  await document.fonts?.ready;
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const smallBtn = { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' };

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
  const { authUser } = useContext(RoleContext) || {};
  const [month, setMonth] = useState(defaultMonth());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [sign, setSign] = useState({ signatures: {}, permissions: {} });
  const [signError, setSignError] = useState('');
  const [signingRole, setSigningRole] = useState(null);
  const [mySignature, setMySignature] = useState(null);
  const [managingMine, setManagingMine] = useState(false);
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

  const loadSignatures = useCallback(async () => {
    if (!y || !m || !window.electronAPI.isoSignature) return;
    const res = await window.electronAPI.isoSignature('GET', FORM_CODE, month);
    if (res?.success) {
      setSign({ signatures: res.signatures || {}, permissions: res.permissions || {} });
      setSignError('');
    } else {
      setSign({ signatures: {}, permissions: {} });
      setSignError(res?.error || '讀取簽核狀態失敗');
    }
  }, [y, m, month]);

  useEffect(() => { loadSignatures(); }, [loadSignatures]);

  // 自己帳號的簽名檔（簽核時可以直接用）
  useEffect(() => {
    if (!window.electronAPI.isoSignature) return;
    window.electronAPI.isoSignature('GET', 'me', 'signature').then((res) => {
      if (res?.success) setMySignature(res.signaturePng || null);
    });
  }, []);

  /** 表單上只印有效的簽名（簽核後資料有異動的不印） */
  const validSignatures = Object.fromEntries(Object.entries(sign.signatures)
    .filter(([, s]) => s && !s.stale)
    .map(([role, s]) => [role, { png: s.signaturePng, signedAt: s.signedAt }]));
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

  const saveMySignature = async (png) => {
    const res = await window.electronAPI.isoSignature('PUT', 'me', 'signature', undefined, { signature: png });
    if (!res?.success) throw new Error(res?.error || '儲存簽名檔失敗');
    setMySignature(png);
  };

  /** 簽核：body 是 { useSaved: true }（用自己帳號的簽名檔）或 { signature }（這次手寫／上傳的） */
  const submitSign = async (body) => {
    const res = await window.electronAPI.isoSignature('POST', FORM_CODE, month, signingRole, body);
    if (!res?.success) {
      alert('簽核失敗：' + (res?.error || '未知錯誤'));
      return;
    }
    setSigningRole(null);
    await loadSignatures();
  };

  const handleSign = async (png, { saveAsMine } = {}) => {
    if (saveAsMine) {
      try { await saveMySignature(png); } catch (err) { alert(err.message); return; }
    }
    await submitSign({ signature: png });
  };

  const handleSaveMine = async (png) => {
    try {
      await saveMySignature(png);
      setManagingMine(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteMine = async () => {
    if (!window.confirm('確定要刪除我的簽名檔嗎？已經簽核過的月份不受影響。')) return;
    const res = await window.electronAPI.isoSignature('DELETE', 'me', 'signature');
    if (!res?.success) { alert('刪除失敗：' + (res?.error || '未知錯誤')); return; }
    setMySignature(null);
    setManagingMine(false);
  };

  const handleRevoke = async (def) => {
    const s = sign.signatures[def.role];
    if (!window.confirm(`確定要撤銷 ${rocYear(y)}年${String(m).padStart(2, '0')}月 的${def.label}簽核（${s?.userName}）嗎？`)) return;
    const res = await window.electronAPI.isoSignature('DELETE', FORM_CODE, month, def.role);
    if (!res?.success) {
      alert('撤銷失敗：' + (res?.error || '未知錯誤'));
      return;
    }
    await loadSignatures();
  };

  const outCount = rows.filter((r) => r.direction === 'OUT').length;
  const inCount = rows.filter((r) => r.direction === 'IN').length;
  const signingDef = SIGN_ROLES.find((d) => d.role === signingRole);
  const canSignAny = SIGN_ROLES.some((d) => sign.permissions[d.role]?.canSign);
  const signerName = authUser?.full_name || authUser?.username || '';

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
        {canSignAny && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span>我的簽名檔：{mySignature ? '已設定' : '尚未設定'}</span>
            <button type="button" onClick={() => setManagingMine(true)}
              style={{ ...smallBtn, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)' }}>
              <PenLine size={13} /> {mySignature ? '管理我的簽名檔' : '設定我的簽名檔'}
            </button>
          </div>
        )}
        <div aria-label="線上簽核" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '14px' }}>
          {SIGN_ROLES.map((def) => {
            const s = sign.signatures[def.role];
            const perm = sign.permissions[def.role] || {};
            return (
              <div key={def.role} data-testid={`iso-sign-${def.role}`}
                style={{ padding: '12px 14px', borderRadius: '10px', border: `1px solid ${s?.stale ? '#f59e0b' : 'var(--border-color)'}`, backgroundColor: 'var(--bg-surface-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-main)' }}>{def.label}</span>
                  {s && !s.stale && <span style={{ fontSize: '11px', fontWeight: 800, color: '#10b981' }}>已簽核</span>}
                  {!s && <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-subtle)' }}>尚未簽核</span>}
                </div>
                {s && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src={s.signaturePng} alt={`${def.label}簽名`} style={{ height: '54px', width: '162px', objectFit: 'contain', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{s.userName}</div>
                      <div>{formatSignedAt(s.signedAt)}</div>
                    </div>
                  </div>
                )}
                {s?.stale && (
                  <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#d97706' }}>
                    <AlertTriangle size={14} /> 簽核後資料有異動，請重新簽核（表單上不會印這個簽名）
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {perm.canSign && (!s || s.stale) && (
                    <button type="button" onClick={() => setSigningRole(def.role)} disabled={loading}
                      style={{ ...smallBtn, border: 'none', backgroundColor: '#ea580c', color: '#fff' }}>
                      <PenLine size={13} /> {s ? `重新簽核（${def.label}）` : `簽核（${def.label}）`}
                    </button>
                  )}
                  {perm.canRevoke && s && (
                    <button type="button" onClick={() => handleRevoke(def)}
                      style={{ ...smallBtn, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)' }}>
                      <Undo2 size={13} /> 撤銷{def.label}簽核
                    </button>
                  )}
                  {!perm.canSign && !s && (
                    <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>由指定的帳號登入簽核（系統管理 → 權限設定）</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {signError && <div role="alert" style={{ fontSize: '12px', color: '#ef4444', marginBottom: '10px' }}>簽核狀態：{signError}</div>}

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

      {signingDef && (
        <SignaturePadModal
          title={`${rocYear(y)}年${String(m).padStart(2, '0')}月 設備攜出入單 — ${signingDef.label}簽核`}
          signerName={signerName}
          savedSignature={mySignature}
          onUseSaved={() => submitSign({ useSaved: true })}
          onConfirm={handleSign}
          onClose={() => setSigningRole(null)}
        />
      )}
      {managingMine && (
        <SignaturePadModal
          mode="manage"
          title="我的簽名檔"
          signerName={signerName}
          savedSignature={mySignature}
          onConfirm={handleSaveMine}
          onDeleteSaved={handleDeleteMine}
          onClose={() => setManagingMine(false)}
        />
      )}
    </div>
  );
};

export default IsoEquipmentForm;
