// 測試用：做一份跟威脅情資檢核專案產生的格式一樣的 S-413-02 Word 檔
// （檢核表五欄＋表格下方「檢核人（簽章）」那一行＋附件表）
import JSZip from 'jszip';
import zlib from 'zlib';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const RPR = '<w:rPr><w:sz w:val="24"/></w:rPr>';
const para = (text) => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>${RPR}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
/** CVE 編號在原檔裡用不分行連字號 */
const cveParagraph = (text) => `<w:p><w:r><w:t xml:space="preserve">${text.split('-').map(esc).join('</w:t><w:noBreakHyphen/><w:t xml:space="preserve">')}</w:t></w:r></w:p>`;
const cell = (inner, w = 1701) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${inner}</w:tc>`;

export const SIGNER_LINE = '檢核人（簽章）：＿＿＿＿＿＿＿＿＿＿＿＿＿　　　日期：＿＿＿年＿＿月＿＿日';
export const signerParagraph = (text = SIGNER_LINE) => `<w:p><w:pPr><w:spacing w:before="360" w:after="240"/><w:jc w:val="right"/></w:pPr><w:r>${RPR}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

/** 一列：item 的每一行一個段落；legacy＝舊格式多一欄檢核人 */
export const fixtureRow = ({ date = '115/11/01', source = '國家資通安全研究院', lines, applicable = true, update = true }, { legacy = false } = {}) => (
  `<w:tr><w:trPr><w:cantSplit/></w:trPr>${[
    cell(para(date), 1781),
    cell(para(source), 2777),
    cell(lines.map((l) => (l.includes('CVE-') ? cveParagraph(l) : para(l))).join(''), 6626),
    cell(para(applicable ? '■適用' : '□適用') + para(applicable ? '□不適用' : '■不適用')),
    cell(para(update ? '■更新' : '□更新') + para(update ? '□不更新' : '■不更新')),
    ...(legacy ? [cell(para(''))] : []),
  ].join('')}</w:tr>`
);

export const DEFAULT_ROWS = [
  { lines: ['【Windows 11】', '微軟釋出115年10月份安全性更新', '已遭利用：CVE-2026-96951'] },
  { lines: ['【ERP 管理系統】', 'Node.js存在4項高風險安全漏洞'] },
  { lines: ['【不適用】其餘 23 則公告均不適用'], applicable: false, update: false },
];

const headerRow = (legacy) => `<w:tr>${['檢核日期', '情資來源', '檢核項目', '適用/不適用', '更新/不更新', ...(legacy ? ['檢核人'] : [])].map((t) => cell(para(t))).join('')}</w:tr>`;
const APPENDIX = '<w:p><w:r><w:t>附件、威脅情資來源</w:t></w:r></w:p><w:tbl><w:tblPr/>'
  + `<w:tr>${['類型', '情資來源', '連結'].map((t) => cell(para(t))).join('')}</w:tr>`
  + `<w:tr>${['預警通報', '微軟Microsoft', 'https://msrc.microsoft.com/update-guide'].map((t) => cell(para(t))).join('')}</w:tr></w:tbl>`;

/** document.xml：legacy＝舊格式（有檢核人欄、沒有簽章那一行） */
export const fixtureDocumentXml = (rowsXml, { legacy = false } = {}) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>`
  + `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="1781"/></w:tblGrid>${headerRow(legacy)}${rowsXml}</w:tbl>`
  + `${legacy ? '' : signerParagraph()}${APPENDIX}<w:sectPr/></w:body></w:document>`;

/** 做一份 .docx（Buffer） */
export const buildChecklistDocx = async ({ rows = DEFAULT_ROWS, rowsXml, documentXml, legacy = false, withPngType = true } = {}) => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + `${withPngType ? '<Default Extension="png" ContentType="image/png"/>' : ''}<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('word/document.xml', documentXml || fixtureDocumentXml(rowsXml ?? rows.map((r) => fixtureRow(r, { legacy })).join(''), { legacy }));
  return zip.generateAsync({ type: 'nodebuffer' });
};

/** 一張 w×h 的 PNG（簽名用），color 不同就是不同的簽名 */
export const pngDataUrl = (w = 600, h = 200, color = [0, 0, 160]) => {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 255);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 3 + 1)] = 0;
    const x = Math.floor(w / 2); const o = y * (w * 3 + 1) + 1 + x * 3;
    raw[o] = color[0]; raw[o + 1] = color[1]; raw[o + 2] = color[2];
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return `data:image/png;base64,${Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64')}`;
};
