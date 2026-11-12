import React from 'react';
import './IsoSheet.css';
import { signerLineParts } from '../utils/isoThreatIntel';

/**
 * ISO 27001「S-413-02 威脅情資自我檢核表」的檢視：照上傳的 Word 檔版面畫（版面由伺服器讀出，見 server/threatIntelDocx.js 的 previewChecklistDocx）
 *
 * - 頁首：文件編號、文件名稱、LOGO、發布日期、版次、標題；頁尾：機密等級、頁碼
 * - 內文：段落與表格依原順序，遇到分頁就換一頁（檢核表內容很長時，換頁位置可能跟 Word 不同）
 * - 檢核人（簽章）那一行：簽了就把簽名放在底線的位置、日期填簽核日期，跟下載的 Word 檔一樣
 *
 * 尺寸以 twips（1/1440 吋）換算成畫面像素（96 dpi：15 twips = 1px）。
 */
const px = (twips) => twips / 15;
const ptPx = (halfPoints) => (halfPoints ? (halfPoints / 2) * (96 / 72) : null);
const FONT = '"標楷體", "DFKai-SB", "BiauKai", "Kaiti TC", "Times New Roman", serif';
const ALIGN = { both: 'justify', distribute: 'justify', center: 'center', right: 'right', left: 'left', start: 'left', end: 'right' };

const Runs = ({ runs, baseSize }) => runs.map((r, i) => (
  <span key={i} style={{ fontWeight: r.bold ? 700 : 400, color: r.color || '#000', fontSize: `${ptPx(r.size) || baseSize}px` }}>{r.text}</span>
));

/** 一般段落；檢核人簽章那一段簽了就放簽名 */
const Paragraph = ({ p, signature, baseSize = 16, compact = false }) => {
  const style = { margin: 0, textAlign: ALIGN[p.align] || 'left', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: compact ? 1.35 : 1.5, minHeight: compact ? undefined : '1em' };
  if (p.signer) {
    const text = p.runs.map((r) => r.text).join('');
    const size = ptPx(p.runs[0]?.size) || baseSize;
    if (!signature?.png) {
      return <p data-signer-line="unsigned" style={{ ...style, margin: '24px 0 16px', fontSize: `${size}px` }}>{text}</p>;
    }
    const { label, after } = signerLineParts(text, signature.signedAt);
    return (
      <p data-signer-line="signed" style={{ ...style, margin: '24px 0 16px', fontSize: `${size}px` }}>
        <span>{label}</span>
        <img src={signature.png} alt="檢核人簽名" style={{ width: '134px', height: '45px', objectFit: 'contain', verticalAlign: 'bottom' }} />
        <span>{after}</span>
      </p>
    );
  }
  return <p style={style}><Runs runs={p.runs} baseSize={baseSize} /></p>;
};

/** 表格：欄寬照原檔、合併儲存格（gridSpan、vMerge）、表頭底色 */
const Table = ({ t }) => {
  // 欄寬資料不齊（欄數比格子少）就平均分配
  const cols = Math.max(...t.rows.map((row) => row.reduce((n, c) => n + c.span, 0)), 1);
  const widths = t.widths.length === cols ? t.widths : Array(cols).fill(1);
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  // 每格在第幾欄，算出 vMerge 往下合併幾列
  const placed = t.rows.map((row) => {
    let col = 0;
    return row.map((c) => { const at = col; col += c.span; return { ...c, col: at }; });
  });
  const rowSpanOf = (ri, col) => {
    let n = 1;
    for (let r = ri + 1; r < placed.length; r += 1) {
      const below = placed[r].find((c) => c.col === col);
      if (below?.vMerge !== 'continue') break;
      n += 1;
    }
    return n;
  };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', border: '2px solid #000', color: '#000', backgroundColor: '#fff' }}>
      <colgroup>{widths.map((w, i) => <col key={i} style={{ width: `${(w / total) * 100}%` }} />)}</colgroup>
      <tbody>
        {placed.map((row, ri) => (
          <tr key={ri}>
            {row.filter((c) => c.vMerge !== 'continue').map((c, ci) => (
              <td key={ci} colSpan={c.span} rowSpan={c.vMerge === 'restart' ? rowSpanOf(ri, c.col) : undefined}
                style={{ border: '1px solid #000', padding: '3px 6px', verticalAlign: c.vAlign === 'center' ? 'middle' : c.vAlign === 'bottom' ? 'bottom' : 'top', backgroundColor: c.fill || '#fff', color: '#000' }}>
                {c.paras.map((p, pi) => <Paragraph key={pi} p={p} baseSize={16} compact />)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

/** LOGO：照 Word 的大小與裁切（srcRect）顯示 */
const Logo = ({ logo }) => {
  const w = logo.widthIn * 96;
  const h = logo.heightIn * 96;
  const { l = 0, t = 0, r = 0, b = 0 } = logo.crop || {};
  const imgW = w / Math.max(0.05, 1 - l - r);
  const imgH = h / Math.max(0.05, 1 - t - b);
  return (
    <div style={{ width: `${w}px`, height: `${h}px`, overflow: 'hidden' }}>
      <img src={logo.dataUrl} alt="LOGO" style={{ display: 'block', width: `${imgW}px`, height: `${imgH}px`, maxWidth: 'none', marginLeft: `${-l * imgW}px`, marginTop: `${-t * imgH}px` }} />
    </div>
  );
};

const Header = ({ h }) => (
  <div style={{ marginBottom: '6px' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'end', borderBottom: '3px solid #000', paddingBottom: '4px', fontSize: '15px' }}>
      <div style={{ lineHeight: 1.5 }}>
        <div>文件編號：{h.docNo}</div>
        <div>文件名稱：{h.docName}</div>
      </div>
      <div style={{ alignSelf: 'center', padding: '0 12px' }}>
        {h.logo && <Logo logo={h.logo} />}
      </div>
      <div style={{ lineHeight: 1.5, textAlign: 'right' }}>
        <div>發布日期：{h.publishDate}</div>
        <div>版次：{h.version}</div>
      </div>
    </div>
    {h.title && <div style={{ textAlign: 'center', fontSize: '27px', fontWeight: 700, margin: '6px 0 2px', letterSpacing: '2px' }}>{h.title}</div>}
  </div>
);

/** 依分頁切成多頁 */
const toPages = (blocks = []) => {
  const pages = [[]];
  for (const b of blocks) {
    if (b.type === 'p' && b.pageBreak) {
      if (b.runs.length) pages.at(-1).push({ ...b, pageBreak: false });
      pages.push([]);
    } else {
      pages.at(-1).push(b);
    }
  }
  return pages.filter((p) => p.length > 0);
};

/**
 * @param {{ layout: object, signature?: { png: string, signedAt: string } | null }} props
 */
const IsoThreatIntelSheet = ({ layout, signature = null }) => {
  const { page, header, footer = [], blocks } = layout;
  const pages = toPages(blocks);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
      {pages.map((items, i) => (
        <div key={i} className="iso-threat-intel-sheet" data-testid={`threat-sheet-page-${i + 1}`}
          style={{
            position: 'relative', boxSizing: 'border-box', width: `${px(page.width)}px`, minHeight: `${px(page.height)}px`,
            padding: `28px ${px(page.margin.right)}px ${px(page.margin.bottom) + 30}px ${px(page.margin.left)}px`,
            backgroundColor: '#fff', color: '#000', fontFamily: FONT, boxShadow: '0 2px 10px rgba(0,0,0,0.18)', border: '1px solid var(--border-color)',
          }}>
          {header && <Header h={header} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {items.map((b, bi) => (b.type === 'table' ? <Table key={bi} t={b} /> : <Paragraph key={bi} p={b} signature={signature} />))}
          </div>
          <div style={{ position: 'absolute', left: `${px(page.margin.left)}px`, right: `${px(page.margin.right)}px`, bottom: '24px', fontSize: '13px' }}>
            <div style={{ textAlign: 'center' }}>{i + 1}</div>
            {footer.map((t) => <div key={t}>{t}</div>)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default IsoThreatIntelSheet;
