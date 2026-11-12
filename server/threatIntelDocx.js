// ============================================================================
// ISO 27001「S-413-02 威脅情資自我檢核表」的 Word 檔（.docx）處理
// ----------------------------------------------------------------------------
// 檢核表由「威脅情資檢核」專案每月產生（沿用公司範本的頁首、頁尾與附件），
// 每月 1 日上傳到 ERP，檢核人在 ERP 線上簽一次，下載時把簽名填回原檔。
//
//   parseChecklistDocx(buffer)  讀出檢核表的各列（檢核日期、情資來源、檢核項目、適用、更新）
//   signChecklistDocx(buffer, { signaturePng, signedDate })
//     把簽名圖與簽核日期填進表格下方「檢核人（簽章）：＿＿＿　日期：＿＿年＿＿月＿＿日」那一行，
//     其他內容原封不動；原檔沒有這一行就在檢核表後面補一行。
//
// 只動 word/document.xml 的那一行，另外加上簽名圖檔（word/media）與關聯（document.xml.rels）。
// ============================================================================

import JSZip from 'jszip';

const DOC_PATH = 'word/document.xml';
const RELS_PATH = 'word/_rels/document.xml.rels';
const TYPES_PATH = '[Content_Types].xml';

/** 表頭的欄位：依文字找出各欄在第幾欄（「適用/不適用」「更新/不更新」互相排除） */
const HEADER_COLUMNS = [
  { key: 'checkDate', match: (t) => t.includes('檢核日期') },
  { key: 'source', match: (t) => t.includes('情資來源') },
  { key: 'item', match: (t) => t.includes('檢核項目') },
  { key: 'applicable', match: (t) => t.includes('適用') && !t.includes('更新') },
  { key: 'update', match: (t) => t.includes('更新') && !t.includes('適用') },
];

export class ChecklistFormatError extends Error {}

const decodeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&');

const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * 找出 xml[from, to) 之間「最外層」的 <tag> 元素（略過包在內層表格裡的），回傳絕對位置
 * tag 例如 'w:tbl'、'w:tr'、'w:tc'、'w:p'
 */
export const topLevel = (xml, tag, from = 0, to = xml.length) => {
  const re = new RegExp(`<${tag}(?=[ >/])[^>]*?(/?)>|</${tag}>|<w:tbl(?=[ >])[^>]*>|</w:tbl>`, 'g');
  re.lastIndex = from;
  const out = [];
  let depth = 0; // 同名元素的深度
  let tblDepth = 0; // 內層表格的深度（找的不是表格時才用）
  let start = -1;
  let m;
  while ((m = re.exec(xml)) && m.index < to) {
    const tok = m[0];
    const isTbl = tag !== 'w:tbl' && /^<\/?w:tbl[ >]/.test(tok + ' ');
    if (isTbl) {
      if (tok.startsWith('</')) tblDepth -= 1; else tblDepth += 1;
      continue;
    }
    if (tblDepth > 0) continue;
    if (tok.startsWith('</')) {
      depth -= 1;
      if (depth === 0 && start >= 0) { out.push({ start, end: m.index + tok.length }); start = -1; }
    } else if (m[1] === '/') {
      if (depth === 0) out.push({ start: m.index, end: m.index + tok.length });
    } else {
      if (depth === 0) start = m.index;
      depth += 1;
    }
  }
  return out;
};

/** 一個段落的文字：w:t、不分行連字號、換行 */
const paragraphText = (p) => decodeXml((p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:noBreakHyphen\/>|<w:tab\/>|<w:br\/>|<w:br [^>]*\/>/g) || [])
  .map((tok) => {
    if (tok === '<w:noBreakHyphen/>') return '-';
    if (tok === '<w:tab/>') return ' ';
    if (tok.startsWith('<w:br')) return '\n';
    return tok.replace(/<[^>]+>/g, '');
  }).join(''));

/** 儲存格的文字：每個段落一行 */
export const cellText = (xml, cell) => topLevel(xml, 'w:p', cell.start, cell.end)
  .map((p) => paragraphText(xml.slice(p.start, p.end)))
  .join('\n')
  .replace(/[ \u3000]+\n/g, '\n')
  .trim();

const CHECKED = '[■☑☒✔✓▣]';
/** 「■適用 □不適用」→ 適用；沒勾就照原文字 */
const checkedOption = (text, options) => {
  for (const opt of options) {
    if (new RegExp(`${CHECKED}\\s*${opt}`).test(text)) return opt;
  }
  return text.replace(/\s+/g, ' ').trim();
};

/** 115/11/01 → 2026-11-01（不是民國日期就回 null） */
export const rocToYmd = (s) => {
  const m = String(s || '').trim().match(/^(\d{2,3})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]) + 1911;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/** 找出檢核表那張表格：第一列有「檢核日期」「檢核項目」 */
const findChecklistTable = (xml) => {
  for (const tbl of topLevel(xml, 'w:tbl')) {
    const trs = topLevel(xml, 'w:tr', tbl.start + 1, tbl.end - 1);
    if (trs.length === 0) continue;
    const headers = topLevel(xml, 'w:tc', trs[0].start + 1, trs[0].end - 1).map((c) => cellText(xml, c).replace(/\s+/g, ''));
    const col = {};
    for (const def of HEADER_COLUMNS) {
      const i = headers.findIndex(def.match);
      if (i >= 0) col[def.key] = i;
    }
    if (col.checkDate !== undefined && col.item !== undefined) return { tbl, trs, col };
  }
  return null;
};

/** 「檢核人（簽章）：＿＿＿」那一段（表格外、最外層的段落） */
const findSignerLine = (xml) => {
  const body = xml.indexOf('<w:body>');
  for (const p of topLevel(xml, 'w:p', body >= 0 ? body : 0)) {
    const text = paragraphText(xml.slice(p.start, p.end));
    if (/檢核人/.test(text) && /[＿_]/.test(text)) return { ...p, text };
  }
  return null;
};

const NOT_DOCX = '檔案不是 Word（.docx）格式，請上傳威脅情資自我檢核表的 .docx 檔。';

const loadZip = async (buffer) => {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new ChecklistFormatError(NOT_DOCX);
  }
  const file = zip.file(DOC_PATH);
  if (!file) throw new ChecklistFormatError(NOT_DOCX);
  return { zip, xml: await file.async('string') };
};

/**
 * 讀出檢核表
 * @param {Buffer|Uint8Array} buffer .docx 檔
 * @returns {Promise<{ period: string, checkDate: string, rows: object[], hasSignerLine: boolean }>}
 *   period：檢核日期所在月份（YYYY-MM）；rows：[{ no, checkDate, source, item, applicable, update }]
 */
export const parseChecklistDocx = async (buffer) => {
  const { xml } = await loadZip(buffer);
  const found = findChecklistTable(xml);
  if (!found) throw new ChecklistFormatError('找不到檢核表（表頭要有「檢核日期」「檢核項目」），請確認上傳的是威脅情資自我檢核表。');
  const { trs, col } = found;
  const rows = [];
  for (const tr of trs.slice(1)) {
    const cells = topLevel(xml, 'w:tc', tr.start + 1, tr.end - 1);
    const text = (key) => (col[key] !== undefined && cells[col[key]] ? cellText(xml, cells[col[key]]) : '');
    const row = {
      checkDate: text('checkDate').replace(/\s+/g, ''),
      source: text('source').replace(/\s*\n\s*/g, ' '),
      item: text('item'),
      applicable: checkedOption(text('applicable'), ['不適用', '適用']),
      update: checkedOption(text('update'), ['不更新', '更新']),
    };
    if (!row.checkDate && !row.item) continue; // 空白列
    rows.push({ no: rows.length + 1, ...row });
  }
  if (rows.length === 0) throw new ChecklistFormatError('檢核表裡沒有任何檢核項目。');
  const dates = rows.map((r) => rocToYmd(r.checkDate)).filter(Boolean);
  if (dates.length === 0) throw new ChecklistFormatError('檢核表的「檢核日期」不是民國日期（例如 115/11/01），無法判斷是哪個月的檢核表。');
  return { period: dates[0].slice(0, 7), checkDate: dates[0], rows, hasSignerLine: !!findSignerLine(xml) };
};

/** PNG 的寬高（IHDR） */
const pngSize = (bytes) => {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return { width: 600, height: 200 };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: dv.getUint32(16) || 600, height: dv.getUint32(20) || 200 };
};

const EMU_PER_INCH = 914400;
/** 簽名圖寬 1.4 吋（約 3.6 公分），高依比例 */
export const SIGNATURE_WIDTH_IN = 1.4;

const drawingXml = ({ relId, docPrId, cx, cy }) => (
  `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>`
  + `<wp:docPr id="${docPrId}" name="檢核人簽名"/>`
  + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
  + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
  + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="signature.png"/><pic:cNvPicPr/></pic:nvPicPr>`
  + `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
  + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
  + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
);

const textRun = (rPr, text) => `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

/** 2026-11-12 → 115年11月12日 */
export const rocDateText = (ymd) => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1]) - 1911}年${m[2]}月${m[3]}日` : '';
};

/**
 * 把檢核人的簽名與簽核日期填進「檢核人（簽章）」那一行
 * @param {Buffer|Uint8Array} buffer 上傳的原檔
 * @param {{ signaturePng?: string|null, signedDate?: string }} sign 簽名（PNG data: 網址）與簽核日期（YYYY-MM-DD）；沒簽名就照原檔
 * @returns {Promise<Buffer>}
 */
export const signChecklistDocx = async (buffer, { signaturePng = null, signedDate = '' } = {}) => {
  const { zip, xml } = await loadZip(buffer);
  if (!signaturePng) return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  const relsXml = (await zip.file(RELS_PATH)?.async('string'))
    || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const usedRelIds = new Set([...relsXml.matchAll(/Id="([^"]+)"/g)].map((m) => m[1]));
  let relId = 'rIdErpSignature';
  for (let k = 2; usedRelIds.has(relId); k += 1) relId = `rIdErpSignature${k}`;
  const docPrId = Math.max(0, ...[...xml.matchAll(/<wp:docPr [^>]*id="(\d+)"/g)].map((m) => Number(m[1])).filter((n) => n < 1e9)) + 1;

  const bytes = Buffer.from(String(signaturePng).replace(/^data:image\/png;base64,/, ''), 'base64');
  const size = pngSize(bytes);
  const cx = Math.round(SIGNATURE_WIDTH_IN * EMU_PER_INCH);
  const cy = Math.round(cx * (size.height / size.width));
  const image = drawingXml({ relId, docPrId, cx, cy });
  const dateText = rocDateText(signedDate);

  const line = findSignerLine(xml);
  let out;
  if (line) {
    // 沿用原段落的格式（靠右、字型大小），文字改成：檢核人（簽章）：[簽名]　　　日期：115年11月12日
    const p = xml.slice(line.start, line.end);
    const pPr = (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
    const rPr = (p.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    const label = (line.text.match(/^[^＿_]*/) || ['檢核人（簽章）：'])[0];
    const after = line.text.slice(line.text.search(/[＿_]/)).replace(/^[＿_]+/, '');
    const dateMatch = after.match(/^(\s*)(日期[：:])/);
    const runs = [textRun(rPr, label), image];
    if (dateMatch) runs.push(textRun(rPr, `${dateMatch[1]}${dateMatch[2]}${dateText}`));
    else if (after.trim()) runs.push(textRun(rPr, after));
    out = `${xml.slice(0, line.start)}<w:p>${pPr}${runs.join('')}</w:p>${xml.slice(line.end)}`;
  } else {
    // 舊格式沒有這一行：接在檢核表後面
    const found = findChecklistTable(xml);
    const at = found ? found.tbl.end : xml.indexOf('<w:sectPr');
    const para = '<w:p><w:pPr><w:spacing w:before="360" w:after="240"/><w:jc w:val="right"/></w:pPr>'
      + `${textRun('', '檢核人（簽章）：')}${image}${textRun('', `　　　日期：${dateText}`)}</w:p>`;
    out = xml.slice(0, at) + para + xml.slice(at);
  }
  zip.file(DOC_PATH, out);
  zip.file(RELS_PATH, relsXml.replace('</Relationships>',
    `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/erp-signature.png"/></Relationships>`));
  zip.file('word/media/erp-signature.png', bytes, { createFolders: false });
  const types = await zip.file(TYPES_PATH)?.async('string');
  if (types && !/<Default\s+Extension="png"/i.test(types)) {
    zip.file(TYPES_PATH, types.replace('<Default ', '<Default Extension="png" ContentType="image/png"/><Default '));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};
