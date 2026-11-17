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

const run = (text, { size = 40, bold = false, color, font } = {}) =>
  new TextRun({ text, size, bold, color, font: font ? { ascii: font, hAnsi: font } : undefined });

const macCell = (runs, fill) => new TableCell({
  width: { size: COL, type: WidthType.DXA },
  borders: BORDERS,
  verticalAlign: VerticalAlign.CENTER,
  shading: { type: ShadingType.CLEAR, color: 'auto', fill },
  margins: { top: 40, bottom: 40, left: 160, right: 120 },
  children: [new Paragraph({ children: runs, spacing: { before: 0, after: 0 } })],
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
    children: ['Pair', 'Server Port', 'Exchange Port'].map((t) => macCell([run(t, { size: 44, bold: true, color: 'FFFFFF' })], c.header)),
  });
  const body = rows.map((r, i) => {
    const fill = i % 2 === 0 ? c.bandDark : c.bandLight;
    const pair = r.mgt
      ? [run('MGT', { size: 42 }), run('(LAN,IPMI)', { size: 42, color: c.red })]
      : [run(r.pair, { size: 42 })];
    const valueSize = r.mgt ? 30 : 42;
    return new TableRow({
      height: { value: 580, rule: 'atLeast' },
      children: [
        macCell(pair, fill),
        macCell([run(r.server, { size: valueSize, color: r.mgt ? c.red : undefined })], fill),
        macCell([run(r.exchange, { size: valueSize, color: c.red })], fill),
      ],
    });
  });

  const logo = new Paragraph({
    children: [new ImageRun({
      type: 'png',
      data: dataUrlToBytes(MAC_LOGO),
      transformation: LOGO_SIZE,
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, align: HorizontalPositionAlign.RIGHT },
        verticalPosition: { relative: VerticalPositionRelativeFrom.MARGIN, align: VerticalPositionAlign.BOTTOM },
        wrap: { type: TextWrappingType.NONE },
        allowOverlap: true,
      },
    })],
  });

  return {
    properties: {
      page: {
        size: { width: PAGE.height, height: PAGE.width, orientation: PageOrientation.LANDSCAPE },
        margin: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin },
      },
    },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(MAC_TITLE, { size: 80, bold: true, color: c.title, font: serif })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [run(`SN:  ${mac.sn || ''}`, { size: 48, bold: true, color: c.title, font: serif })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [run(`OUI: ${OUI_VENDOR} : ${oui}`, { size: 38, bold: true })] }),
      new Table({
        width: { size: COL * 3, type: WidthType.DXA },
        columnWidths: [COL, COL, COL],
        alignment: AlignmentType.CENTER,
        rows: [header, ...body],
      }),
      logo,
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
