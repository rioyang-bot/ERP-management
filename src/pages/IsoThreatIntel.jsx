import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Radar, ArrowLeft, Upload, Download, Trash2, PenLine, Undo2, AlertCircle, AlertTriangle, CheckCircle2, FileText, Clock, List, Eye } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RoleContext } from '../context/RoleContext';
import SignaturePadModal from '../components/SignaturePadModal';
import IsoThreatIntelSheet from '../components/IsoThreatIntelSheet';
import {
  FORM_CODE, FORM_META, REMIND_FROM_DAY, MAX_FILE_BYTES, LEVEL_STYLE,
  currentPeriod, previousPeriod, rocMonthLabel, monthStatus, fileToBase64, formatSize, formatRocDate, formatRocDateTime,
} from '../utils/isoThreatIntel';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const btn = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontWeight: 800, fontSize: '13px', cursor: 'pointer' };
const smallBtn = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '7px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' };
const outline = { border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)' };
const RED = '#be123c';
const ORANGE = '#ea580c';

/** 適用／更新的標記 */
const Mark = ({ value, positive }) => {
  const on = value === positive;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap',
      backgroundColor: on ? 'rgba(234, 88, 12, 0.12)' : 'var(--bg-surface)', color: on ? ORANGE : 'var(--text-muted)', border: `1px solid ${on ? 'rgba(234, 88, 12, 0.4)' : 'var(--border-color)'}` }}>
      {value || '—'}
    </span>
  );
};

/** 檢核項目：太長的先收起來 */
const ItemText = ({ text }) => {
  const [open, setOpen] = useState(false);
  const lines = String(text || '').split('\n');
  const long = lines.length > 6 || text.length > 360;
  const shown = open || !long ? text : `${lines.slice(0, 5).join('\n').slice(0, 300)}…`;
  return (
    <div>
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-main)' }}>
        <strong>{lines[0]}</strong>{shown.slice(lines[0].length)}
      </div>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} style={{ ...smallBtn, ...outline, marginTop: '4px', padding: '2px 8px' }}>
          {open ? '收起' : '展開全部'}
        </button>
      )}
    </div>
  );
};

/** 本月狀態的文字 */
const statusText = (st, latest) => {
  const month = `本月（${rocMonthLabel(st.period)}）`;
  if (st.state === 'MISSING') return { main: `${month}的檢核表尚未上傳${latest ? `；最近一份是 ${rocMonthLabel(latest.period)}` : ''}`, alert: `每月 1 日要上傳，已經 ${REMIND_FROM_DAY} 日以後了，請盡快上傳` };
  if (st.state === 'WAITING') return { main: `${month}的檢核表今天要上傳` };
  if (st.state === 'UNSIGNED') return { main: `${month}的檢核表已上傳（${formatRocDateTime(latest.uploadedAt)}・${latest.uploadedByName}）`, alert: '尚未簽核，請檢核人簽名' };
  return { main: `${month}已結案：檢核人 ${latest.signedByName} 於 ${formatRocDateTime(latest.signedAt)} 簽核` };
};

/**
 * 報表中心：ISO 27001「S-413-02 威脅情資自我檢核表」（見 utils/isoThreatIntel.js、server/isoThreatIntelRoutes.js）
 *
 * 每月 1 日上傳檢核表（Word 檔，任何帳號都能上傳），檢核人線上簽一次就結案；
 * 下載的 Word 檔會把簽名與日期填進「檢核人（簽章）」那一行。
 */
const IsoThreatIntel = () => {
  const navigate = useNavigate();
  const { authUser } = useContext(RoleContext) || {};
  const [searchParams] = useSearchParams();
  const [period, setPeriod] = useState(() => {
    const m = searchParams.get('month');
    return PERIOD_RE.test(m || '') ? m : currentPeriod();
  });
  const [checklist, setChecklist] = useState(null);
  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [signing, setSigning] = useState(false);
  const [mySignature, setMySignature] = useState(null);
  const [managingMine, setManagingMine] = useState(false);
  const [view, setView] = useState('list'); // list 逐列內容；sheet 檢視表單
  const [sheet, setSheet] = useState({ layout: null, error: '' });
  const [sheetScale, setSheetScale] = useState(1);
  const fileRef = useRef(null);
  const sheetBoxRef = useRef(null);

  const validPeriod = PERIOD_RE.test(period);

  const load = useCallback(async () => {
    if (!validPeriod) return;
    const [res, last] = await Promise.all([
      window.electronAPI.isoThreatIntel('GET', period),
      window.electronAPI.isoThreatIntel('GET', 'latest'),
    ]);
    if (res?.success) { setChecklist(res.checklist || null); setError(''); }
    else { setChecklist(null); setError(res?.error || '讀取失敗'); }
    setLatest(last?.success ? last.latest : null);
    setLoading(false);
  }, [period, validPeriod]);

  useEffect(() => { load(); }, [load]);

  // 檢視表單：開啟時讀一次版面；換了檔案（替換）再讀
  const sheetId = checklist && view === 'sheet' ? checklist.id : null;
  const sheetVersion = checklist?.uploadedAt;
  useEffect(() => {
    if (!sheetId) return undefined;
    let cancelled = false;
    setSheet({ layout: null, error: '' });
    window.electronAPI.isoThreatIntel('GET', [sheetId, 'preview']).then((res) => {
      if (cancelled) return;
      setSheet(res?.success ? { layout: res.layout, error: '' } : { layout: null, error: res?.error || '讀取失敗' });
    });
    return () => { cancelled = true; };
  }, [sheetId, sheetVersion]);

  // 檢視表單縮放到放得進畫面寬度
  useEffect(() => {
    const el = sheetBoxRef.current;
    const pageWidth = sheet.layout ? sheet.layout.page.width / 15 : 0;
    if (!el || !pageWidth || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setSheetScale(Math.min(1, (w - 4) / pageWidth));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [sheet.layout, view]);

  useEffect(() => {
    window.electronAPI.isoSignature?.('GET', 'me', 'signature').then((res) => {
      if (res?.success) setMySignature(res.signaturePng || null);
    });
  }, []);

  const rows = checklist?.rows || [];
  const st = monthStatus(latest);
  const stText = statusText(st, latest);
  const stStyle = LEVEL_STYLE[st.level];
  const StIcon = st.level === 'red' || st.level === 'yellow' ? AlertTriangle : st.level === 'green' ? CheckCircle2 : Clock;
  const signerName = authUser?.full_name || authUser?.username || '';

  // ---- 上傳 ----
  const upload = async (file, replace = false) => {
    const fileBase64 = await fileToBase64(file);
    return window.electronAPI.isoThreatIntel('POST', null, { fileName: file.name, fileBase64, replace });
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) { alert('只能上傳 Word（.docx）檔。'); return; }
    if (file.size > MAX_FILE_BYTES) { alert(`檔案太大（上限 ${formatSize(MAX_FILE_BYTES)}）。`); return; }
    setBusy('upload');
    try {
      let res = await upload(file);
      if (!res?.success && res?.exists && res.fileName) {
        const msg = `${rocMonthLabel(res.period)}已經有檢核表（${res.fileName}）。\n\n要用「${file.name}」替換嗎？`
          + (res.signedByName ? `\n${res.signedByName} 的檢核人簽核會清除，替換後要重新簽核。` : '');
        if (!window.confirm(msg)) return;
        res = await upload(file, true);
      }
      if (!res?.success) { alert('上傳失敗：' + (res?.error || '未知錯誤')); return; }
      const p = res.checklist?.period;
      if (p && p !== period) { setLoading(true); setPeriod(p); } else { await load(); }
    } catch (err) {
      alert('上傳失敗：' + err.message);
    } finally {
      setBusy('');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`確定要刪除 ${rocMonthLabel(checklist.period)} 的威脅情資自我檢核表（${checklist.fileName}）嗎？${checklist.signedByName ? `\n${checklist.signedByName} 的檢核人簽核會一併刪除。` : ''}`)) return;
    const res = await window.electronAPI.isoThreatIntel('DELETE', checklist.id);
    if (!res?.success) { alert('刪除失敗：' + (res?.error || '未知錯誤')); return; }
    await load();
  };

  const handleDownload = async () => {
    setBusy('download');
    try {
      const res = await window.electronAPI.isoThreatIntelDownload(checklist.id);
      if (!res?.success) { alert('下載失敗：' + (res?.error || '未知錯誤')); return; }
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = checklist.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally {
      setBusy('');
    }
  };

  // ---- 簽核 ----
  const submitSign = async (body) => {
    const res = await window.electronAPI.isoThreatIntel('POST', [checklist.id, 'sign'], body);
    if (!res?.success) { alert('簽核失敗：' + (res?.error || '未知錯誤')); return; }
    setSigning(false);
    await load();
  };

  const saveMySignature = async (png) => {
    const res = await window.electronAPI.isoSignature('PUT', 'me', 'signature', undefined, { signature: png });
    if (!res?.success) throw new Error(res?.error || '儲存簽名檔失敗');
    setMySignature(png);
  };

  const handleSign = async (png, { saveAsMine } = {}) => {
    if (saveAsMine) {
      try { await saveMySignature(png); } catch (err) { alert(err.message); return; }
    }
    await submitSign({ signature: png });
  };

  const handleDeleteMine = async () => {
    if (!window.confirm('確定要刪除我的簽名檔嗎？已經簽過的不受影響。')) return;
    const res = await window.electronAPI.isoSignature('DELETE', 'me', 'signature');
    if (!res?.success) { alert('刪除失敗：' + (res?.error || '未知錯誤')); return; }
    setMySignature(null);
    setManagingMine(false);
  };

  const handleRevoke = async () => {
    if (!window.confirm(`確定要撤銷 ${rocMonthLabel(checklist.period)} 的檢核人簽核（${checklist.signedByName}）嗎？撤銷後這個月會變回未結案。`)) return;
    const res = await window.electronAPI.isoThreatIntel('DELETE', [checklist.id, 'sign']);
    if (!res?.success) { alert('撤銷失敗：' + (res?.error || '未知錯誤')); return; }
    await load();
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: 'var(--page-title-size, 1.35rem)', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
            <Radar size={24} color={RED} /> {FORM_META.docName} (ISO 27001 {FORM_CODE})
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '2px 0 0' }}>
            每月 1 日上傳威脅情資自我檢核表（Word 檔，內容是上個月的情資），任何帳號都能上傳；檢核人線上簽一次就算當月結案。下載的 Word 檔會把簽名與日期填進「檢核人（簽章）」那一行，其他內容照原檔。
          </p>
        </div>
        <button type="button" onClick={() => navigate('/reports')} style={{ ...btn, ...outline, fontWeight: 700 }}>
          <ArrowLeft size={15} /> 報表中心
        </button>
      </div>

      {/* 本月狀態：2 日起沒上傳紅色、上傳了沒簽黃色、簽了結案（營運總覽也有） */}
      {!loading && (
        <div role="status" data-testid="threat-intel-status" data-level={st.level}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '12px 16px', marginBottom: '14px', borderRadius: '12px', fontSize: '13px', fontWeight: 700,
            border: `1px solid ${stStyle.border}`, backgroundColor: stStyle.bg, color: stStyle.color,
          }}>
          <StIcon size={18} />
          <span>{stText.main}</span>
          {stText.alert && <span style={{ fontWeight: 900 }}>{stText.alert}</span>}
        </div>
      )}

      <div className="card-surface" style={{ padding: '16px', borderRadius: 'var(--card-radius, 14px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <label htmlFor="threat-intel-month" style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-muted)' }}>檢核月份</label>
          <input id="threat-intel-month" type="month" value={period} onChange={(e) => { setLoading(true); setPeriod(e.target.value); }}
            style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '14px' }} />
          {validPeriod && <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{rocMonthLabel(period)}檢核（{rocMonthLabel(previousPeriod(period))}份情資）</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFile}
              style={{ display: 'none' }} data-testid="threat-intel-file" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy}
              style={{ ...btn, border: 'none', backgroundColor: RED, color: '#fff' }}>
              <Upload size={15} /> {busy === 'upload' ? '上傳中...' : checklist ? '替換檢核表' : '上傳檢核表'}
            </button>
            {checklist && (
              <button type="button" onClick={handleDownload} disabled={!!busy}
                style={{ ...btn, border: 'none', backgroundColor: busy ? 'var(--border-color)' : '#2b579a', color: '#fff' }}>
                <Download size={15} /> {busy === 'download' ? '產生中...' : `下載 Word${checklist.signedByName ? '（含簽名）' : ''}`}
              </button>
            )}
            {checklist?.canDelete && (
              <button type="button" onClick={handleDelete} disabled={!!busy} style={{ ...btn, ...outline, color: RED }}>
                <Trash2 size={15} /> 刪除
              </button>
            )}
          </div>
        </div>

        {error && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', marginBottom: '12px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <AlertCircle size={16} /> 讀取失敗：{error}
          </div>
        )}

        {loading && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>讀取中...</div>}

        {!loading && validPeriod && !checklist && !error && (
          <div data-testid="threat-intel-empty" style={{ padding: '28px 16px', textAlign: 'center', borderRadius: '10px', border: '1px dashed var(--border-color)', color: 'var(--text-muted)', fontSize: '13px' }}>
            {rocMonthLabel(period)}的威脅情資自我檢核表還沒上傳，請按「上傳檢核表」選擇 Word 檔。
          </div>
        )}

        {!loading && checklist && (
          <>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: 'var(--text-main)' }}><FileText size={13} /> {checklist.fileName}</span>
              <span>檢核日期 {formatRocDate(checklist.checkDate)}</span>
              <span>上傳：{checklist.uploadedByName}・{formatRocDateTime(checklist.uploadedAt)}・{formatSize(checklist.fileSize)}</span>
              <span>共 {rows.length} 列</span>
            </div>

            {/* 檢核人：簽一次就結案 */}
            <div data-testid="threat-intel-signer"
              style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '12px 14px', marginBottom: '12px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-subtle)',
                border: `1px solid ${checklist.signedByName ? 'rgba(16, 185, 129, 0.45)' : 'rgba(217, 119, 6, 0.55)'}` }}>
              <span style={{ fontWeight: 900, fontSize: '13px', color: 'var(--text-main)' }}>檢核人（簽章）</span>
              {checklist.signedByName ? (
                <>
                  <img src={checklist.signaturePng} alt="檢核人簽名" style={{ height: '48px', width: '144px', objectFit: 'contain', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{checklist.signedByName}</div>
                    <div>{formatRocDateTime(checklist.signedAt)}</div>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#059669' }}>已簽核・當月結案</span>
                  {checklist.canRevoke && (
                    <button type="button" onClick={handleRevoke} style={{ ...smallBtn, ...outline }}>
                      <Undo2 size={13} /> 撤銷簽核
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#b45309' }}>尚未簽核</span>
                  <button type="button" onClick={() => setSigning(true)} style={{ ...btn, border: 'none', backgroundColor: ORANGE, color: '#fff' }}>
                    <PenLine size={15} /> 簽核（檢核人）
                  </button>
                </>
              )}
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>我的簽名檔：{mySignature ? '已設定' : '尚未設定'}</span>
              <button type="button" onClick={() => setManagingMine(true)} style={{ ...smallBtn, ...outline }}>
                <PenLine size={13} /> {mySignature ? '管理我的簽名檔' : '設定我的簽名檔'}
              </button>
            </div>

            {/* 逐列內容／檢視表單（照 Word 檔版面，簽了就帶簽名） */}
            <div role="tablist" aria-label="顯示方式" style={{ display: 'inline-flex', gap: '4px', padding: '3px', marginBottom: '10px', borderRadius: '9px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)' }}>
              {[{ key: 'list', label: '逐列內容', icon: <List size={13} /> }, { key: 'sheet', label: '檢視表單', icon: <Eye size={13} /> }].map(({ key, label, icon }) => (
                <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)}
                  style={{ ...smallBtn, border: 'none', backgroundColor: view === key ? '#2b579a' : 'transparent', color: view === key ? '#fff' : 'var(--text-main)' }}>
                  {icon} {label}
                </button>
              ))}
            </div>

            {view === 'sheet' && (
              <div ref={sheetBoxRef} aria-label="檢核表檢視" data-testid="threat-intel-sheet" style={{ overflow: 'hidden' }}>
                {sheet.error && <div role="alert" style={{ fontSize: '13px', color: '#ef4444' }}>檢視失敗：{sheet.error}</div>}
                {!sheet.layout && !sheet.error && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>讀取版面中...</div>}
                {sheet.layout && (
                  <div style={{ zoom: sheetScale }}>
                    <IsoThreatIntelSheet layout={sheet.layout}
                      signature={checklist.signedByName ? { png: checklist.signaturePng, signedAt: checklist.signedAt } : null} />
                  </div>
                )}
                <div style={{ fontSize: '11px', color: 'var(--text-subtle)', marginTop: '8px' }}>
                  照上傳的 Word 檔版面顯示；檢核項目很長時，換頁位置可能跟 Word 不同，正式文件請以下載的 Word 檔為準。
                </div>
              </div>
            )}

            <div aria-label="檢核項目" style={{ display: view === 'list' ? 'flex' : 'none', flexDirection: 'column', gap: '10px' }}>
              {rows.map((r) => (
                <div key={r.no} data-testid={`threat-row-${r.no}`}
                  style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 900, color: 'var(--text-main)' }}>第 {r.no} 列</span>
                    <span>{r.checkDate}</span>
                    <span>{r.source}</span>
                    <Mark value={r.applicable} positive="適用" />
                    <Mark value={r.update} positive="更新" />
                  </div>
                  <ItemText text={r.item} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {signing && checklist && (
        <SignaturePadModal
          title={`${rocMonthLabel(checklist.period)} ${FORM_META.docName} — 檢核人簽核`}
          signerName={signerName}
          savedSignature={mySignature}
          onUseSaved={() => submitSign({ useSaved: true })}
          onConfirm={handleSign}
          onClose={() => setSigning(false)}
        />
      )}
      {managingMine && (
        <SignaturePadModal
          mode="manage"
          title="我的簽名檔"
          signerName={signerName}
          savedSignature={mySignature}
          onConfirm={async (png) => { try { await saveMySignature(png); setManagingMine(false); } catch (err) { alert(err.message); } }}
          onDeleteSaved={handleDeleteMine}
          onClose={() => setManagingMine(false)}
        />
      )}
    </div>
  );
};

export default IsoThreatIntel;
