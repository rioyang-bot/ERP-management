import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseChecklistDocx, signChecklistDocx, rocToYmd, rocDateText, ChecklistFormatError } from '../../server/threatIntelDocx.js';
import { buildChecklistDocx, fixtureRow, fixtureDocumentXml, pngDataUrl, DEFAULT_ROWS } from './threatIntelFixture.js';

/**
 * S-413-02 威脅情資自我檢核表的 Word 檔
 *
 * - 讀出檢核表那張表格的各列：檢核日期、情資來源、檢核項目（每個段落一行、不分行連字號還原）、適用、更新
 * - 月份取檢核日期（民國）；附件表不會被當成檢核列
 * - 簽核：簽名與日期填進表格下方「檢核人（簽章）：＿＿＿　日期：＿＿年＿＿月＿＿日」那一行，其他內容原封不動
 */
const docXml = async (buf) => (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
const paragraphOf = (xml, text) => {
  const i = xml.indexOf(text);
  return xml.slice(xml.lastIndexOf('<w:p>', i), xml.indexOf('</w:p>', i) + 6);
};

describe('威脅情資自我檢核表 Word 檔', () => {
  it('讀出各列：檢核項目每段一行、CVE 的不分行連字號還原、■ 勾的選項；月份取檢核日期；認得檢核人簽章那一行', async () => {
    const parsed = await parseChecklistDocx(await buildChecklistDocx());
    expect(parsed.period).toBe('2026-11');
    expect(parsed.checkDate).toBe('2026-11-01');
    expect(parsed.hasSignerLine).toBe(true);
    expect(parsed.rows).toEqual([
      { no: 1, checkDate: '115/11/01', source: '國家資通安全研究院', item: '【Windows 11】\n微軟釋出115年10月份安全性更新\n已遭利用：CVE-2026-96951', applicable: '適用', update: '更新' },
      { no: 2, checkDate: '115/11/01', source: '國家資通安全研究院', item: '【ERP 管理系統】\nNode.js存在4項高風險安全漏洞', applicable: '適用', update: '更新' },
      { no: 3, checkDate: '115/11/01', source: '國家資通安全研究院', item: '【不適用】其餘 23 則公告均不適用', applicable: '不適用', update: '不更新' },
    ]);
  });

  it('舊格式（表格多一欄檢核人、沒有簽章那一行）也讀得出來；空白列略過', async () => {
    const blank = `<w:tr>${'<w:tc><w:p/></w:tc>'.repeat(6)}</w:tr>`;
    const parsed = await parseChecklistDocx(await buildChecklistDocx({ legacy: true, rowsXml: fixtureRow(DEFAULT_ROWS[0], { legacy: true }) + blank }));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ applicable: '適用', update: '更新' });
    expect(parsed.hasSignerLine).toBe(false);
  });

  it('民國日期：115/11/01 → 2026-11-01；不存在的日期或不是民國日期回 null；簽核日期 → 115年11月12日', () => {
    expect(rocToYmd('115/11/01')).toBe('2026-11-01');
    expect(rocToYmd(' 115/2/9 ')).toBe('2026-02-09');
    expect(rocToYmd('115/02/30')).toBeNull();
    expect(rocToYmd('2026-11-01')).toBeNull();
    expect(rocDateText('2026-11-12')).toBe('115年11月12日');
  });

  it('不是 Word 檔、找不到檢核表、沒有任何列、檢核日期不是民國日期 → 看得懂的錯誤', async () => {
    await expect(parseChecklistDocx(Buffer.from('not a zip'))).rejects.toThrow(ChecklistFormatError);
    await expect(parseChecklistDocx(Buffer.from('not a zip'))).rejects.toThrow('不是 Word（.docx）格式');
    const noTable = '<?xml version="1.0"?><w:document xmlns:w="w"><w:body><w:p><w:r><w:t>別的文件</w:t></w:r></w:p></w:body></w:document>';
    await expect(parseChecklistDocx(await buildChecklistDocx({ documentXml: noTable }))).rejects.toThrow('找不到檢核表');
    await expect(parseChecklistDocx(await buildChecklistDocx({ rowsXml: '' }))).rejects.toThrow('沒有任何檢核項目');
    await expect(parseChecklistDocx(await buildChecklistDocx({ rows: [{ date: '11/01', lines: ['x'] }] }))).rejects.toThrow('不是民國日期');
  });

  it('簽核：簽名圖（1.4 吋寬、依比例）與日期填進「檢核人（簽章）」那一行，沿用原本的格式；其他內容與附件原封不動', async () => {
    const original = await buildChecklistDocx();
    const out = await signChecklistDocx(original, { signaturePng: pngDataUrl(), signedDate: '2026-11-12' });
    const zip = await JSZip.loadAsync(out);
    const xml = await zip.file('word/document.xml').async('string');
    const rels = await zip.file('word/_rels/document.xml.rels').async('string');

    expect(Object.keys(zip.files).filter((f) => f.startsWith('word/media'))).toEqual(['word/media/erp-signature.png']);
    expect(rels).toContain('Id="rIdErpSignature" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/erp-signature.png"');
    expect(rels).toContain('Target="styles.xml"');

    const line = paragraphOf(xml, '檢核人（簽章）');
    expect(line).toContain('<w:jc w:val="right"/>'); // 原本靠右
    expect(line).toContain('<w:sz w:val="24"/>'); // 原本的字型大小
    expect(line).toContain('<wp:extent cx="1280160" cy="426720"/>');
    expect(line).toContain('r:embed="rIdErpSignature"');
    expect(line.indexOf('檢核人（簽章）：')).toBeLessThan(line.indexOf('<w:drawing>'));
    expect(line).toContain('　　　日期：115年11月12日');
    expect(line).not.toContain('＿');
    expect((xml.match(/<w:drawing>/g) || [])).toHaveLength(1);
    // 表格與附件照舊，重新讀出來的列一樣
    expect(xml).toContain('附件、威脅情資來源');
    expect((await parseChecklistDocx(out)).rows).toEqual((await parseChecklistDocx(original)).rows);
  });

  it('舊格式沒有簽章那一行：在檢核表後面補一行；沒有 png 類型就補上', async () => {
    const original = await buildChecklistDocx({ legacy: true, withPngType: false });
    const zip = await JSZip.loadAsync(await signChecklistDocx(original, { signaturePng: pngDataUrl(), signedDate: '2026-11-12' }));
    const xml = await zip.file('word/document.xml').async('string');
    const line = paragraphOf(xml, '檢核人（簽章）');
    expect(xml.indexOf('</w:tbl>')).toBeLessThan(xml.indexOf('檢核人（簽章）'));
    expect(xml.indexOf('檢核人（簽章）')).toBeLessThan(xml.indexOf('附件、威脅情資來源'));
    expect(line).toContain('<w:drawing>');
    expect(line).toContain('日期：115年11月12日');
    expect(await zip.file('[Content_Types].xml').async('string')).toContain('<Default Extension="png" ContentType="image/png"/>');
  });

  it('還沒簽核：內容照原檔（不加圖檔）', async () => {
    const zip = await JSZip.loadAsync(await signChecklistDocx(await buildChecklistDocx(), {}));
    expect(await zip.file('word/document.xml').async('string')).toBe(fixtureDocumentXml(DEFAULT_ROWS.map((r) => fixtureRow(r)).join('')));
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media'))).toBe(false);
    expect(await docXml(await signChecklistDocx(await buildChecklistDocx(), { signaturePng: null }))).toContain('＿＿＿年＿＿月＿＿日');
  });
});
