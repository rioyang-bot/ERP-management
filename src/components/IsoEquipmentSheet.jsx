import React from 'react';
import logoUrl from '../assets/iso-dreamjet-logo.png';
import { FORM_META, SIGN_ROLES, rocYear, rocDateOf } from '../utils/isoEquipmentForm';

/** A4 橫式，96 dpi 的像素大小；下載 PDF 時以這個大小拍照 */
export const SHEET_WIDTH = 1123;
export const SHEET_HEIGHT = 794;

/** 欄寬照範本表格（twips 換成比例） */
const COLS = [
  { key: 'date', label: '日期', w: 1560, align: 'center' },
  { key: 'name', label: '設備名稱', w: 3817, align: 'left' },
  { key: 'sn', label: '序號', w: 2410, align: 'center' },
  { key: 'purpose', label: '用途', w: 1418, align: 'left' },
  { key: 'reason', label: '原因', w: 2693, align: 'center' },
  { key: 'vendor', label: '供應商/客戶', w: 2410, align: 'left' },
];
const TOTAL_W = COLS.reduce((s, c) => s + c.w, 0);

/**
 * LOGO：範本裡是同一張圖裁切後顯示（a:srcRect，左 10.459%、上 25.587%、右 29.155%、下 37.245%），
 * 這裡照同樣比例裁，高度 52px
 */
const LOGO = { natW: 1256, natH: 837, l: 0.10459, t: 0.25587, r: 0.29155, b: 0.37245, height: 52 };
const logoBox = (() => {
  const fullH = LOGO.height / (1 - LOGO.t - LOGO.b);
  const fullW = fullH * (LOGO.natW / LOGO.natH);
  return { boxW: fullW * (1 - LOGO.l - LOGO.r), fullW, fullH, left: -fullW * LOGO.l, top: -fullH * LOGO.t };
})();

const KAI ='"DFKai-SB", "標楷體", "BiauKai", "Kaiti TC", "KaiTi", serif';
const FONT = `"Times New Roman", ${KAI}`;
const INK = '#000000';

const Box = ({ checked, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
    <span aria-hidden="true" style={{
      width: '14px', height: '14px', border: `1.5px solid ${INK}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: checked ? INK : '#fff', color: '#fff', fontSize: '12px', lineHeight: 1, fontFamily: 'Arial, sans-serif', fontWeight: 900,
    }}>{checked ? '✓' : ''}</span>
    {label}
  </span>
);

/** 用途：攜出／攜入其中一個打勾；空白列兩個都不勾 */
const Purpose = ({ direction }) => (
  <span data-purpose={direction || ''} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
    <Box checked={direction === 'OUT'} label="攜出" />
    <Box checked={direction === 'IN'} label="攜入" />
  </span>
);

const Signature = ({ label, sig }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
    <span style={{ fontFamily: KAI, fontSize: '19px' }}>{label}：</span>
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: '6px', minWidth: '190px', height: '46px', borderBottom: `1px solid ${INK}` }}>
      {sig && (
        <>
          <img src={sig.png} alt={`${label}簽名`} style={{ height: '44px', width: '132px', objectFit: 'contain' }} />
          <span style={{ fontSize: '13px', paddingBottom: '3px' }}>{rocDateOf(sig.signedAt)}</span>
        </>
      )}
    </span>
  </span>
);

/**
 * 設備攜出入單的一頁（A4 橫式），版面照公司範本
 *
 * @param {{ year: number, month: number, rows: (object|null)[], page: number, pageCount: number,
 *           signatures?: Record<string, {png: string, signedAt: string}> }} props
 *   rows 已分好頁（null 是補的空白列）；signatures 只放有效的簽名
 */
const IsoEquipmentSheet = React.forwardRef(({ year, month, rows, page, pageCount, signatures = {} }, ref) => (
  <div
    ref={ref}
    className="iso-equipment-sheet"
    data-page={page}
    style={{
      width: `${SHEET_WIDTH}px`, height: `${SHEET_HEIGHT}px`, boxSizing: 'border-box', padding: '30px 52px 22px 48px',
      backgroundColor: '#ffffff', color: INK, fontFamily: FONT, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}
  >
    {/* 頁首 */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `3px solid ${INK}`, paddingBottom: '6px', fontSize: '15px', lineHeight: 1.5 }}>
      <div style={{ fontFamily: FONT, flex: 1 }}>
        <div>文件編號：{FORM_META.docNo}</div>
        <div>文件名稱：{FORM_META.docName}</div>
      </div>
      <div style={{ position: 'relative', width: `${logoBox.boxW}px`, height: `${LOGO.height}px`, overflow: 'hidden', flex: 'none' }}>
        <img src={logoUrl} alt="LOGO" style={{ position: 'absolute', left: `${logoBox.left}px`, top: `${logoBox.top}px`, width: `${logoBox.fullW}px`, height: `${logoBox.fullH}px`, maxWidth: 'none' }} />
      </div>
      <div style={{ flex: 1, textAlign: 'right' }}>
        <div>發布日期：{FORM_META.publishDate}</div>
        <div>版次：{FORM_META.version}</div>
      </div>
    </div>

    <div style={{ textAlign: 'center', fontFamily: KAI, fontSize: '24px', letterSpacing: '2px', margin: '8px 0 0' }}>{FORM_META.docName}</div>
    <div style={{ textAlign: 'right', fontFamily: FONT, fontSize: '19px', fontWeight: 700, color: '#ff0000', margin: '0 0 6px' }}>
      {rocYear(year)} 年 {String(month).padStart(2, '0')} 月份
    </div>

    {/* 表格：每頁固定 10 列 */}
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', border: `2px solid ${INK}`, fontSize: '15px', fontFamily: FONT, color: INK }}>
      <colgroup>{COLS.map((c) => <col key={c.key} style={{ width: `${(c.w / TOTAL_W) * 100}%` }} />)}</colgroup>
      <thead>
        <tr>
          {COLS.map((c) => (
            <th key={c.key} style={{ height: '40px', border: `1px solid ${INK}`, backgroundColor: '#D9D9D9', fontFamily: KAI, fontWeight: 400, fontSize: '17px', letterSpacing: '2px' }}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} data-blank={r ? undefined : 'true'}>
            {COLS.map((c) => (
              <td key={c.key} style={{ height: '45px', padding: '2px 6px', border: `1px solid ${INK}`, textAlign: c.align, verticalAlign: 'middle', wordBreak: 'break-word', lineHeight: 1.2, overflow: 'hidden', fontFamily: FONT }}>
                {c.key === 'purpose' ? <Purpose direction={r?.direction} /> : (r?.[c.key] || '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>

    {/* 頁尾：每頁都有簽核欄 */}
    <div style={{ marginTop: 'auto', fontSize: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '20px' }}>
        <span style={{ minWidth: '120px' }}>{page} / {pageCount}</span>
        {SIGN_ROLES.map((d) => <Signature key={d.role} label={d.label} sig={signatures[d.role]} />)}
      </div>
      <div style={{ fontFamily: KAI, marginTop: '4px' }}>機密等級：{FORM_META.confidentiality}</div>
    </div>
  </div>
));

IsoEquipmentSheet.displayName = 'IsoEquipmentSheet';

export default IsoEquipmentSheet;
