/**
 * MAC Address Information 的 Word 版
 *
 * 與列印版（utils/macSheet.js）同一個版面：A4 橫式一頁，藍色標題、SN、OUI，綠色表頭的表格，
 * Exchange Port 與 MGT 的值用紅字，右下角是 METECH 標誌。
 * macDocxSection 回傳一個 docx 的 section：單獨匯出時文件只有這一節，
 * 附在出機檢查表後面時接在檢查表那一節之後（Word 每一節可以有自己的紙張方向）。
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  WidthType, AlignmentType, ShadingType, VerticalAlign, BorderStyle, PageOrientation,
  HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, HorizontalPositionAlign, VerticalPositionAlign,
  TextWrappingType,
} from 'docx';
import { buildMacTable, OUI_VENDOR } from './macAddress';
import { MAC_LOGO, MAC_TITLE, MAC_COLORS } from './macSheet';

// A4 橫式，邊界 12mm；單位 twip
const PAGE = { width: 16838, height: 11906, margin: 680 };
const CONTENT = PAGE.width - PAGE.margin * 2;
const TABLE_WIDTH = Math.round(CONTENT * 0.88);
const COL = Math.floor(TABLE_WIDTH / 3);
const WHITE = { style: BorderStyle.SINGLE, size: 12, color: 'FFFFFF' };
const BORDERS = { top: WHITE, bottom: WHITE, left: WHITE, right: WHITE };
// 標誌的原圖 113×120，印出來約 22mm 寬
const LOGO_SIZE = { width: 83, height: 88 };

/** data:image/png;base64,... → Uint8Array */
export function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// 字型寫死在每一段：附在出機檢查表後面時，不會套到那份文件的預設字型（Calibri）
const run = (text, { size = 40, bold = false, color, font = 'Arial' } = {}) =>
  new TextRun({ text, size, bold, color, font: { ascii: font, hAnsi: font } });

// 段落一律單行間距、前後不留白：中文字型（微軟正黑體）預設行高很大，Word 會把表格撐高
const TIGHT = { before: 0, after: 0, line: 240 };
// 列高固定（exact）：字再大也不會把表格撐到第二頁
const ROW_HEIGHT = 560;
const HEADER_HEIGHT = 600;

const macCell = (runs, fill) => new TableCell({
  width: { size: COL, type: WidthType.DXA },
  borders: BORDERS,
  verticalAlign: VerticalAlign.CENTER,
  shading: { type: ShadingType.CLEAR, color: 'auto', fill },
  margins: { top: 20, bottom: 20, left: 160, right: 120 },
  children: [new Paragraph({ children: runs, spacing: TIGHT })],
});

/**
 * @param {{ sn?: string, baseMac?: string, mgtLan?: string, mgtIpmi?: string }} mac
 * @returns {object} docx section
 */
export function macDocxSection(mac = {}) {
  const { oui, rows } = buildMacTable(mac);
  const c = MAC_COLORS;
  const serif = 'Times New Roman';

  const header = new TableRow({
    tableHeader: true,
    height: { value: HEADER_HEIGHT, rule: 'exact' },
    children: ['Pair', 'Server Port', 'Exchange Port'].map((t) => macCell([run(t, { size: 42, bold: true, color: 'FFFFFF' })], c.header)),
  });
  const body = rows.map((r, i) => {
    const fill = i % 2 === 0 ? c.bandDark : c.bandLight;
    const pair = r.mgt
      ? [run('MGT', { size: 40 }), run('(LAN,IPMI)', { size: 40, color: c.red })]
      : [run(r.pair, { size: 40 })];
    const valueSize = r.mgt ? 28 : 40;
    return new TableRow({
      height: { value: ROW_HEIGHT, rule: 'exact' },
      children: [
        macCell(pair, fill),
        macCell([run(r.server, { size: valueSize, color: r.mgt ? c.red : undefined })], fill),
        macCell([run(r.exchange, { size: valueSize, color: c.red })], fill),
      ],
    });
  });

  // 標誌是浮動圖片，固定在版面右下角；錨點放在標題那一段（第一段）。
  // 先前錨在表格後面的空白段落，頁面一滿那一段被擠到下一頁，標誌就跟著跑到第二頁。
  const logo = new ImageRun({
    type: 'png',
    data: dataUrlToBytes(MAC_LOGO),
    transformation: LOGO_SIZE,
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, align: HorizontalPositionAlign.RIGHT },
      verticalPosition: { relative: VerticalPositionRelativeFrom.MARGIN, align: VerticalPositionAlign.BOTTOM },
      wrap: { type: TextWrappingType.NONE },
      allowOverlap: true,
    },
  });

  return {
    properties: {
      page: {
        size: { width: PAGE.height, height: PAGE.width, orientation: PageOrientation.LANDSCAPE },
        margin: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin },
      },
    },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: TIGHT, children: [run(MAC_TITLE, { size: 72, bold: true, color: c.title, font: serif }), logo] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { ...TIGHT, after: 200 }, children: [run(`SN:  ${mac.sn || ''}`, { size: 44, bold: true, color: c.title, font: serif })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { ...TIGHT, after: 80 }, children: [run(`OUI: ${OUI_VENDOR} : ${oui}`, { size: 36, bold: true })] }),
      new Table({
        width: { size: COL * 3, type: WidthType.DXA },
        columnWidths: [COL, COL, COL],
        alignment: AlignmentType.CENTER,
        rows: [header, ...body],
      }),
      // Word 規定表格後面要有一段；縮到最小，不佔版面
      new Paragraph({ spacing: TIGHT, children: [run('', { size: 2 })] }),
    ],
  };
}

const safeName = (s) => String(s).replace(/[\\/:*?"<>|]/g, '_');

/** 單獨匯出 MAC 表（Word） */
export async function exportMacDocx(mac = {}) {
  const doc = new Document({
    creator: 'ERP',
    title: `${MAC_TITLE} ${mac.sn || ''}`.trim(),
    styles: { default: { document: { run: { font: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Microsoft JhengHei' } } } } },
    sections: [macDocxSection(mac)],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(`MAC_Address_${mac.sn || ''}`)}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return doc;
}
