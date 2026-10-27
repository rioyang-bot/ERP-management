/**
 * ISO 27001「S-408-02 設備攜出入單」依月份匯出（Word）
 *
 * 直接拿公司的範本檔（src/assets/templates/S-408-02-equipment-in-out-v1.0.docx）來填，
 * 頁首（文件編號、發布日期、版次）、頁尾（機密等級、頁碼）、字型與框線完全不動，只動表格：
 *   - 標題「115年OO月份」換成匯出的年月（民國年）
 *   - 「設備名稱、數量」拆成「設備名稱」「數量」兩欄
 *   - 依進貨單、出貨單、借用單（借出、歸還）逐列填入，至少保留範本原本的 10 列
 *
 * 只算類別為「設備」的（硬體、耗材不列），不列序號：同一天、同原因、同對象、
 * 同廠牌／型號／規格的加總成一列（查詢見 fetchEquipmentMovements）。
 *
 *   來源                 用途   原因       廠商
 *   進貨單               攜入   進貨       供應商
 *   出貨單               攜出   出貨       客戶（換貨單產生的＝換貨、維修以庫存換貨的＝維修換貨）
 *   借用單借出           攜出   借出       客戶
 *   借用單歸還           攜入   歸還       客戶
 *   換貨單換回           攜入   換貨       客戶
 *   維修現場取回         攜入   維修取回   客戶
 *   送修原廠／原廠返還   攜出／攜入  送修原廠／原廠返還  原廠（維修單上的供應商）
 *   維修完工交回客戶     攜出   維修完工   客戶（以庫存換貨的故障機留在公司，不算）
 *
 * 機房管理員、權責主管留空，由簽核的人手寫。
 */
import JSZip from 'jszip';

/** 範本原本的資料列數，少於這個數量時補空白列，維持表單的樣子 */
export const MIN_ROWS = 10;
// 「設備名稱、數量」原本一欄 3685，拆成設備名稱 2885＋數量 800（總寬不變）
const NAME_COL = 3685;
const NAME_W = 2885;
const QTY_W = 800;

export const rocYear = (year) => Number(year) - 1911;

/** 2026-10-05 → 115/10/05 */
export const formatRocDate = (ymd) => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${rocYear(m[1])}/${m[2]}/${m[3]}` : '';
};

/** 這個月的起日（含）與下個月 1 號（不含），給 fetchEquipmentMovements */
export const monthRange = (year, month) => {
  const pad = (n) => String(n).padStart(2, '0');
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  return [`${year}-${pad(month)}-01`, `${ny}-${pad(nm)}-01`];
};

/** 查詢結果 → 表單的列 */
export const toFormRows = (movements = []) => movements.map((m) => ({
  date: formatRocDate(m.move_date),
  name: [m.brand, m.model, m.specification].map((s) => String(s || '').trim()).filter(Boolean).join(' '),
  qty: Number(m.qty) || 0,
  direction: m.direction === 'IN' ? 'IN' : 'OUT',
  reason: m.reason || '',
  vendor: m.vendor || '',
}));

const escapeXml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cellsOf = (row) => row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];

/** 這一格（只動第一段）的文字換成 text；沿用段落本身的字型設定 */
const setCellText = (cell, text, { center = false } = {}) => {
  const value = escapeXml(text);
  return cell.replace(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/, (para, inner) => {
    const pPr = (inner.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
    const rPr = (pPr.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    let nextPPr = pPr;
    if (center) {
      nextPPr = /<w:jc\b[^>]*\/>/.test(pPr)
        ? pPr.replace(/<w:jc\b[^>]*\/>/, '<w:jc w:val="center"/>')
        : pPr.replace(/(<w:rPr>|<\/w:pPr>)/, '<w:jc w:val="center"/>$1');
    }
    const run = value ? `<w:r>${rPr}<w:t xml:space="preserve">${value}</w:t></w:r>` : '';
    return `<w:p>${nextPPr}${run}</w:p>`;
  });
};

/** 「設備名稱、數量」那一格拆成兩格 */
const splitNameCell = (cell, nameText, qtyText, { header = false } = {}) => {
  const resize = (c, w) => c.replace(`<w:tcW w:w="${NAME_COL}"`, `<w:tcW w:w="${w}"`);
  return setCellText(resize(cell, NAME_W), nameText, { center: header })
    + setCellText(resize(cell, QTY_W), qtyText, { center: true });
};

/** 用途：攜出／攜入其中一個打勾 */
const setPurpose = (cell, direction) => {
  if (!direction) return cell;
  return cell
    .replace('<w:t>□攜出</w:t>', `<w:t>${direction === 'OUT' ? '☑' : '□'}攜出</w:t>`)
    .replace('<w:t>□攜入</w:t>', `<w:t>${direction === 'IN' ? '☑' : '□'}攜入</w:t>`);
};

/**
 * 複製出來的列會有一樣的 w14:paraId／textId；這兩個屬性是選用的，
 * 拿掉讓 Word 自己產生，免得重複的編號被當成檔案有問題
 */
const stripIds = (xml) => xml.replace(/\s+w14:(paraId|textId)="[^"]*"/g, '');

const buildDataRow = (templateRow, r) => {
  const cells = cellsOf(templateRow);
  const [date, nameQty, purpose, reason, vendor, ...rest] = cells;
  const filled = [
    setCellText(date, r?.date || '', { center: true }),
    splitNameCell(nameQty, r?.name || '', r ? String(r.qty) : ''),
    setPurpose(purpose, r?.direction),
    setCellText(reason, r?.reason || '', { center: true }),
    setCellText(vendor, r?.vendor || ''),
    ...rest, // 機房管理員、權責主管留空
  ];
  let i = 0;
  return stripIds(templateRow.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, () => filled[i++]));
};

const buildHeaderRow = (headerRow) => {
  let i = 0;
  const row = headerRow.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (cell) => {
    const idx = i++;
    return idx === 1 ? splitNameCell(cell, '設備名稱', '數量', { header: true }) : cell;
  });
  // 表頭在每一頁重複，資料多到換頁時也看得懂欄位
  return row.includes('<w:tblHeader/>') ? row : row.replace('<w:trPr>', '<w:trPr><w:tblHeader/>');
};

/**
 * 填好的 document.xml
 * @param {string} xml 範本的 word/document.xml
 */
export function fillDocumentXml(xml, { year, month, rows = [] }) {
  const tblStart = xml.indexOf('<w:tbl>');
  const tblEnd = xml.lastIndexOf('</w:tbl>');
  if (tblStart < 0 || tblEnd < 0) throw new Error('範本裡找不到表格');

  // 標題「115年OO月份」：只換表格前面那一段
  const before = xml.slice(0, tblStart)
    .replace('<w:t>115</w:t>', `<w:t>${rocYear(year)}</w:t>`)
    .replace('<w:t>OO</w:t>', `<w:t>${String(month).padStart(2, '0')}</w:t>`);
  let table = xml.slice(tblStart, tblEnd);
  const after = xml.slice(tblEnd);

  table = table.replace(`<w:gridCol w:w="${NAME_COL}"/>`, `<w:gridCol w:w="${NAME_W}"/><w:gridCol w:w="${QTY_W}"/>`);
  const trs = table.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
  if (trs.length < 2) throw new Error('範本表格的列數不對');
  const header = buildHeaderRow(trs[0]);
  const template = trs[1];
  const total = Math.max(MIN_ROWS, rows.length);
  const body = Array.from({ length: total }, (_, i) => buildDataRow(template, rows[i] || null)).join('');

  const head = table.slice(0, table.indexOf(trs[0]));
  const tail = table.slice(table.lastIndexOf(trs[trs.length - 1]) + trs[trs.length - 1].length);
  return before + head + header + body + tail + after;
}

/**
 * 用範本產生這個月的設備攜出入單
 * @param {ArrayBuffer|Uint8Array} templateBuffer 範本 .docx
 * @returns {Promise<Blob>}
 */
export async function fillEquipmentForm(templateBuffer, { year, month, rows }) {
  const zip = await JSZip.loadAsync(templateBuffer);
  const xml = await zip.file('word/document.xml').async('string');
  zip.file('word/document.xml', fillDocumentXml(xml, { year, month, rows }));
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

/** 檔名：S-408-02設備攜出入單_115年10月.docx */
export const formFileName = (year, month) => `S-408-02設備攜出入單_${rocYear(year)}年${String(month).padStart(2, '0')}月.docx`;
