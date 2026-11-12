import React, { useCallback, useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Download, Server, ArrowLeft, Plus, Pencil, Trash2, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import IsoRoomCheckModal from '../components/IsoRoomCheckModal';
import IsoRoomCheckSheet, { SHEET_WIDTH, SHEET_HEIGHT } from '../components/IsoRoomCheckSheet';
import IsoSignoffPanel from '../components/IsoSignoffPanel';
import {
  FORM_CODE, FORM_META, ITEMS, WEEKS, WEEK_LABEL, SIGN_ROLES, CHECK_INTERVAL_DAYS,
  currentPeriod, rocMonthLabel, weekRangeText, byWeek, formatNumber, formatRocDate, isAbnormal,
  tempOutOfRange, humidityOutOfRange, roomCheckStatus, formFileName, periodOf,
} from '../utils/isoRoomCheck';
import { daysAgoText } from '../utils/isoPeriodicCheck';
import { buildImagePdf, dataUrlToBytes } from '../utils/imagePdf';

/** 等圖片（LOGO、簽名）與字型都載好再拍照，否則 PDF 上會缺；一張最多等 5 秒，不會卡住 */
const waitForAssets = async (root) => {
  await Promise.all([...root.querySelectorAll('img')].map((img) => (img.complete ? null
    : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 5000); }))));
  await document.fonts?.ready;
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const iconBtn = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' };
const RED = '#be123c';

/** 一週的摘要：日期時間、溫溼度（超出範圍標紅）、四項結果（異常標紅） */
const WeekSummary = ({ r }) => {
  const abnormalItems = ITEMS.filter((i) => r.results?.[i.key] === 'ABNORMAL');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontWeight: 800 }}>{formatRocDate(r.checkDate)} {r.checkTime}</span>
        <span style={{ color: tempOutOfRange(r.temperature) ? RED : 'var(--text-main)', fontWeight: tempOutOfRange(r.temperature) ? 800 : 600 }}>溫度 {formatNumber(r.temperature)}℃</span>
        <span style={{ color: humidityOutOfRange(r.humidity) ? RED : 'var(--text-main)', fontWeight: humidityOutOfRange(r.humidity) ? 800 : 600 }}>溼度 {formatNumber(r.humidity)}%</span>
        {abnormalItems.length === 0
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#059669', fontWeight: 800 }}><CheckCircle2 size={13} /> 四項檢查正常</span>
          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: RED, fontWeight: 800 }}><AlertTriangle size={13} /> {abnormalItems.map((i) => i.label).join('、')} 異常</span>}
      </div>
      {r.abnormalNote && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', wordBreak: 'break-word' }}>說明：{r.abnormalNote}；處理方式：{r.abnormalAction}</div>
      )}
      <div style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>填寫：{r.createdByName}</div>
    </div>
  );
};

/**
 * 報表中心：ISO 27001「S-408-03 機房檢查表」（見 utils/isoRoomCheck.js）
 *
 * 每週檢查一次，在這裡新增一筆（依日期排到這個月的第幾周，一周一筆）；
 * 每個月由檢查人、單位主管線上簽核一次，簽名印在表單最下面。
 * 一個月一張表，照公司範本格式預覽、下載 PDF。
 */
const IsoRoomCheck = () => {
  const navigate = useNavigate();
  // 營運總覽的待簽提醒會帶 ?month=YYYY-MM 直接開那個月；沒帶或格式不對就開本月
  const [searchParams] = useSearchParams();
  const [period, setPeriod] = useState(() => {
    const m = searchParams.get('month');
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '') ? m : currentPeriod();
  });
  const [records, setRecords] = useState([]);
  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null 關閉；{ record: null } 新增；{ record } 修改
  const [validSignatures, setValidSignatures] = useState({});
  const [version, setVersion] = useState(0); // 紀錄有異動就加一，簽核區重新讀（簽名可能失效）
  const [exporting, setExporting] = useState(false);
  const [renderForPdf, setRenderForPdf] = useState(false);
  const [scale, setScale] = useState(1);
  const previewRef = useRef(null);
  const pdfRef = useRef(null);

  const validPeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(period);

  const load = useCallback(async () => {
    if (!validPeriod) return;
    const [res, last] = await Promise.all([
      window.electronAPI.isoRoomCheck('GET', period),
      window.electronAPI.isoRoomCheck('GET', 'latest'),
    ]);
    if (res?.success) { setRecords(res.rows || []); setError(''); }
    else { setRecords([]); setError(res?.error || '讀取失敗'); }
    setLatest(last?.success ? last : null);
    setLoading(false);
  }, [period, validPeriod]);

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

  const weeks = byWeek(records);
  const status = roomCheckStatus(latest?.lastDate || null);

  const handleSaved = async (row) => {
    setEditing(null);
    const p = periodOf(row?.checkDate || '');
    if (p && p !== period) { setLoading(true); setPeriod(p); } else { await load(); }
    setVersion((v) => v + 1);
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`確定要刪除 ${formatRocDate(r.checkDate)} ${r.checkTime} 的機房檢查紀錄（${WEEK_LABEL[r.weekNo]}）嗎？`)) return;
    const res = await window.electronAPI.isoRoomCheck('DELETE', r.id);
    if (!res?.success) { alert('刪除失敗：' + (res?.error || '未知錯誤')); return; }
    await load();
    setVersion((v) => v + 1);
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
      for (const sheet of root.querySelectorAll('.iso-room-check-sheet')) {
        const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true, width: SHEET_WIDTH, height: SHEET_HEIGHT });
        images.push({ jpeg: dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92)), width: canvas.width, height: canvas.height });
      }
      const blob = new Blob([buildImagePdf(images)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = formFileName(period);
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

  const sheet = <IsoRoomCheckSheet period={validPeriod ? period : currentPeriod()} records={records} signatures={validSignatures} />;

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: 'var(--page-title-size, 1.35rem)', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
            <Server size={24} color="#7c3aed" /> {FORM_META.docName} (ISO 27001 {FORM_CODE})
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '2px 0 0' }}>
            每週檢查一次機房，新增一筆：日期時間、溫度、溼度，監視設備／門禁管理／設備管理／機房環境勾選正常或異常；有異常要寫說明與處理方式。每個月由檢查人、單位主管線上簽核一次，依月份照公司範本格式預覽並下載 PDF。
          </p>
        </div>
        <button type="button" onClick={() => navigate('/reports')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer' }}>
          <ArrowLeft size={15} /> 報表中心
        </button>
      </div>

      {/* 狀態：超過 7 天沒檢查就醒目提醒（營運總覽也有） */}
      {!loading && latest && (
        <div role="status" data-testid="room-check-status" data-overdue={status.overdue ? 'true' : 'false'}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '12px 16px', marginBottom: '14px', borderRadius: '12px', fontSize: '13px', fontWeight: 700,
            border: `1px solid ${status.overdue ? 'rgba(220, 38, 38, 0.55)' : 'rgba(16, 185, 129, 0.4)'}`,
            backgroundColor: status.overdue ? 'rgba(220, 38, 38, 0.1)' : 'rgba(16, 185, 129, 0.08)',
            color: status.overdue ? '#dc2626' : '#059669',
          }}>
          {status.overdue ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          {status.lastDate
            ? <span>最後檢查：{formatRocDate(status.lastDate)} {latest.lastTime}（{daysAgoText(status.days)}）</span>
            : <span>還沒有任何檢查紀錄</span>}
          {status.overdue && (
            <span style={{ fontWeight: 900 }}>
              {status.lastDate ? `已超過 ${CHECK_INTERVAL_DAYS} 天未檢查，請盡快檢查並新增紀錄` : '請進行第一次檢查並新增紀錄'}
            </span>
          )}
        </div>
      )}

      <div className="card-surface" style={{ padding: '16px', borderRadius: 'var(--card-radius, 14px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <label htmlFor="room-check-month" style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-muted)' }}>月份</label>
          <input id="room-check-month" type="month" value={period} onChange={(e) => { setLoading(true); setPeriod(e.target.value); }}
            style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '14px' }} />
          {validPeriod && <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>{rocMonthLabel(period)}份</span>}
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>已檢查 {records.length} 週</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setEditing({ record: null })} disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#7c3aed', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}>
              <Plus size={15} /> 新增檢查紀錄
            </button>
            <button type="button" onClick={handleExport} disabled={exporting || loading || !validPeriod}
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

        {/* 這個月的五週 */}
        <div aria-label="每週檢查紀錄" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
          {validPeriod && WEEKS.map((w) => {
            const r = weeks[w - 1];
            const abnormal = r && isAbnormal(r);
            return (
              <div key={w} data-testid={`room-week-${w}`}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', padding: '10px 14px', borderRadius: '10px', border: `1px solid ${abnormal ? 'rgba(190, 18, 60, 0.45)' : 'var(--border-color)'}`, backgroundColor: 'var(--bg-surface-subtle)' }}>
                <div style={{ minWidth: '110px' }}>
                  <div style={{ fontWeight: 900, fontSize: '14px', color: 'var(--text-main)' }}>{WEEK_LABEL[w]}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{weekRangeText(period, w)}</div>
                </div>
                <div style={{ flex: 1, minWidth: '240px' }}>
                  {r ? <WeekSummary r={r} /> : <span style={{ fontSize: '13px', color: 'var(--text-subtle)' }}>{loading ? '讀取中...' : '尚未檢查'}</span>}
                </div>
                {r && (r.canManage ? (
                  <span style={{ display: 'inline-flex', gap: '6px' }}>
                    <button type="button" onClick={() => setEditing({ record: r })} style={iconBtn} aria-label={`修改${WEEK_LABEL[w]}`}><Pencil size={12} /> 修改</button>
                    <button type="button" onClick={() => handleDelete(r)} style={{ ...iconBtn, color: RED }} aria-label={`刪除${WEEK_LABEL[w]}`}><Trash2 size={12} /> 刪除</button>
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>填寫人本人或管理員可修改</span>
                ))}
              </div>
            );
          })}
        </div>

        {/* 線上簽核：每個月檢查人、單位主管各簽一次 */}
        {validPeriod && (
          <IsoSignoffPanel formCode={FORM_CODE} formLabel={FORM_META.docName} period={period} roles={SIGN_ROLES}
            disabled={loading} refreshKey={version} onSignaturesChange={setValidSignatures} />
        )}

        {/* 預覽：跟 PDF 一樣的 A4 橫式頁面，依畫面寬度縮小 */}
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          {loading ? '讀取中...' : `表單預覽（${validPeriod ? rocMonthLabel(period) : ''}）${records.length === 0 ? '：這個月還沒有紀錄，仍會產生空白表單' : ''}`}
        </div>
        <div ref={previewRef} aria-label="機房檢查表預覽" style={{ display: 'flex', flexDirection: 'column', gap: '16px', opacity: loading ? 0.4 : 1 }}>
          {!loading && validPeriod && (
            <div style={{ width: `${SHEET_WIDTH * scale}px`, height: `${SHEET_HEIGHT * scale}px`, boxShadow: '0 2px 10px rgba(0,0,0,0.18)', border: '1px solid var(--border-color)', overflow: 'hidden', margin: '0 auto' }}>
              <div style={{ width: `${SHEET_WIDTH}px`, height: `${SHEET_HEIGHT}px`, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{sheet}</div>
            </div>
          )}
        </div>
      </div>

      {/* 下載 PDF 用：原尺寸、畫在畫面外 */}
      {renderForPdf && (
        <div ref={pdfRef} aria-hidden="true" style={{ position: 'fixed', left: '-20000px', top: 0, width: `${SHEET_WIDTH}px`, pointerEvents: 'none' }}>
          {sheet}
        </div>
      )}

      {editing && (
        <IsoRoomCheckModal record={editing.record} onClose={() => setEditing(null)} onSaved={handleSaved} />
      )}
    </div>
  );
};

export default IsoRoomCheck;
