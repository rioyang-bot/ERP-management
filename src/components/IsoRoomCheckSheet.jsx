import React from 'react';
import IsoSheetHeader, { KAI, FONT, INK } from './IsoSheetHeader';
import { SHEET_WIDTH, SHEET_HEIGHT } from './IsoEquipmentSheet';
import { FORM_META, ITEMS, WEEKS, WEEK_LABEL, TEMP_RANGE, HUMIDITY_RANGE, rocYear, formatNumber, byWeek } from '../utils/isoRoomCheck';
import { rocDateOf } from '../utils/isoEquipmentForm';

export { SHEET_WIDTH, SHEET_HEIGHT };

/**
 * 欄寬照範本表格（twips）：檢查項目、說明、第一～五周（第三周在範本裡被切成兩格）、異常狀況說明。
 * 最下面一列「單位主管」跨第一周到第三周的前半，所以第三周要分兩欄。
 */
const GRID = [1833, 5387, 1140, 1141, 695, 446, 1141, 1141, 2413];
const TOTAL_W = GRID.reduce((s, w) => s + w, 0);
/** 每一周佔第幾欄、跨幾欄 */
const WEEK_SPAN = { 1: 1, 2: 1, 3: 2, 4: 1, 5: 1 };

const ROW_H = { head: 32, date: 46, temp: 56, humidity: 56, sign: 84 };
const ITEM_H = { CCTV: 50, ACCESS: 44, EQUIPMENT: 44, ENVIRONMENT: 56 };

const GRAY = '#D9D9D9';
// 系統的深色模式會把表格（尤其 thead 裡的格子）改成深底淺字，表單上一律白底黑字
const cell = { border: `1px solid ${INK}`, padding: '2px 6px', verticalAlign: 'middle', fontFamily: FONT, lineHeight: 1.3, overflow: 'hidden', color: INK, backgroundColor: '#ffffff' };
const center = { ...cell, textAlign: 'center' };
const head = { ...center, backgroundColor: GRAY, fontFamily: KAI, fontWeight: 400, fontSize: '16px', letterSpacing: '1px' };

const Lines = ({ text }) => String(text).split('\n').map((line, i) => <div key={i}>{line}</div>);

/** 異常狀況說明：有異常的那幾週各一段（日期時間、說明、處理方式）；沒有就印範本的空白格式 */
const AbnormalNotes = ({ records }) => {
  const list = records.filter((r) => r && r.abnormalNote);
  if (list.length === 0) {
    return (
      <div style={{ fontSize: '14px', lineHeight: 1.7 }}>
        <div>___年___月___日</div>
        <div>___時___分</div>
        <div>說明：</div>
        <div>處理方式：</div>
      </div>
    );
  }
  // 字多就縮小一點，免得超出格子（一格大約 17 行、每行 11 個字）
  const lines = list.reduce((s, r) => s + 2 + Math.ceil((3 + r.abnormalNote.length) / 11) + Math.ceil((5 + r.abnormalAction.length) / 11), 0);
  const fontSize = lines > 17 ? Math.max(9, Math.floor(13 * Math.sqrt(17 / lines))) : 13;
  return (
    <div data-testid="room-abnormal-notes" style={{ fontSize: `${fontSize}px`, lineHeight: 1.3, wordBreak: 'break-word', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {list.map((r) => {
        const [y, m, d] = r.checkDate.split('-');
        const [hh, mm] = r.checkTime.split(':');
        return (
          <div key={r.id ?? r.checkDate}>
            <div>{rocYear(y)}年{m}月{d}日</div>
            <div>{hh}時{mm}分</div>
            <div>說明：{r.abnormalNote}</div>
            <div>處理方式：{r.abnormalAction}</div>
          </div>
        );
      })}
    </div>
  );
};

const Mark = ({ status }) => (
  <span data-mark={status || ''} style={{ fontSize: '19px', fontFamily: 'Arial, sans-serif' }}>
    {status === 'NORMAL' ? 'V' : status === 'ABNORMAL' ? 'ｘ' : ''}
  </span>
);

const Signature = ({ label, sig }) => (sig ? (
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
    <img src={sig.png} alt={`${label}簽名`} style={{ height: '56px', width: '168px', objectFit: 'contain' }} />
    <span style={{ fontSize: '13px' }}>{rocDateOf(sig.signedAt)}</span>
  </div>
) : null);

/**
 * 機房檢查表的一頁（A4 橫式，一個月一張），版面照公司範本
 *
 * @param {{ period: string, records: object[], signatures?: Record<string, {png: string, signedAt: string}> }} props
 *   records 是這個月的紀錄（依周排）；signatures 只放有效的簽名（INSPECTOR 檢查人、SUPERVISOR 單位主管）
 */
const IsoRoomCheckSheet = ({ period, records, signatures = {} }) => {
  const weeks = byWeek(records);
  const [y, m] = period.split('-');

  const weekCells = (render, style = {}) => WEEKS.map((w) => (
    <td key={w} colSpan={WEEK_SPAN[w]} data-week={w} style={{ ...center, ...style }}>{render(weeks[w - 1])}</td>
  ));

  return (
    <div
      className="iso-room-check-sheet"
      data-period={period}
      style={{
        width: `${SHEET_WIDTH}px`, height: `${SHEET_HEIGHT}px`, boxSizing: 'border-box', padding: '30px 52px 22px 48px',
        backgroundColor: '#ffffff', color: INK, fontFamily: FONT, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <IsoSheetHeader meta={FORM_META} />

      <div style={{ textAlign: 'center', fontFamily: KAI, fontSize: '26px', letterSpacing: '2px', margin: '10px 0' }}>{FORM_META.docName}</div>

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', border: `2px solid ${INK}`, fontSize: '15px', fontFamily: FONT, color: INK }}>
        <colgroup>{GRID.map((w, i) => <col key={i} style={{ width: `${(w / TOTAL_W) * 100}%` }} />)}</colgroup>
        <thead>
          <tr>
            <th rowSpan={3} style={head}>檢查項目</th>
            <th rowSpan={3} style={head}>檢查項目說明</th>
            <th colSpan={6} style={{ ...head, height: `${ROW_H.head}px` }}>檢查 <span style={{ fontFamily: FONT, textDecoration: 'underline' }}>{rocYear(y)}年{m}</span> 月份</th>
            <th rowSpan={3} style={head}>異常狀況說明</th>
          </tr>
          <tr>
            {WEEKS.map((w) => <th key={w} colSpan={WEEK_SPAN[w]} style={{ ...head, height: `${ROW_H.head}px` }}>{WEEK_LABEL[w]}</th>)}
          </tr>
          <tr>
            {weekCells((r) => (
              <div style={{ fontSize: '14px', lineHeight: 1.35 }}>
                <div>{r ? `${r.checkDate.slice(5, 7)}/${r.checkDate.slice(8, 10)}` : '/'}</div>
                <div>{r ? r.checkTime : '：'}</div>
              </div>
            ), { height: `${ROW_H.date}px`, fontWeight: 400 })}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td rowSpan={2} style={center}>溫度管制</td>
            <td rowSpan={2} style={cell}>
              <div>1.機房溫度：{TEMP_RANGE.min}至{TEMP_RANGE.max}℃</div>
              <div>2.相對溼度：{HUMIDITY_RANGE.min}%至{HUMIDITY_RANGE.max}%</div>
            </td>
            {weekCells((r) => `${r ? formatNumber(r.temperature) : ''}℃`, { height: `${ROW_H.temp}px` })}
            <td rowSpan={6} style={{ ...cell, verticalAlign: 'top', padding: '6px' }}><AbnormalNotes records={weeks} /></td>
          </tr>
          <tr>
            {weekCells((r) => `${r ? formatNumber(r.humidity) : ''}%`, { height: `${ROW_H.humidity}px` })}
          </tr>
          {ITEMS.map((item) => (
            <tr key={item.key} data-item={item.key}>
              <td style={{ ...center, height: `${ITEM_H[item.key]}px` }}>{item.label}</td>
              <td style={cell}><Lines text={item.detail} /></td>
              {weekCells((r) => <Mark status={r?.results?.[item.key]} />)}
            </tr>
          ))}
          <tr>
            <td style={{ ...head, height: `${ROW_H.sign}px` }}>檢查人</td>
            <td data-sign="INSPECTOR" style={cell}><Signature label="檢查人" sig={signatures.INSPECTOR} /></td>
            <td colSpan={3} style={head}>單位主管</td>
            <td colSpan={4} data-sign="SUPERVISOR" style={cell}><Signature label="單位主管" sig={signatures.SUPERVISOR} /></td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontFamily: KAI, fontSize: '15px', marginTop: '8px' }}>{FORM_META.remark}</div>

      <div style={{ marginTop: 'auto', fontSize: '14px', textAlign: 'center' }}>
        <div>1</div>
        <div style={{ fontFamily: KAI, marginTop: '2px' }}>機密等級：{FORM_META.confidentiality}</div>
      </div>
    </div>
  );
};

export default IsoRoomCheckSheet;
