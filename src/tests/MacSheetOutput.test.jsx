import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { buildMacSheet, buildMacSheetParts, MAC_LOGO } from '../utils/macSheet';
import { macDocxSection, exportMacDocx } from '../utils/macDocx';
import { buildChecklistSheet } from '../utils/checklistSheet';
import { createChecklistDocument } from '../utils/checklistDocx';
import { Document } from 'docx';

/**
 * MAC Address Information 的輸出：列印（另存 PDF）與 Word，版面照 LDA 原本的文件，右下角 METECH 標誌
 */
const MAC = { sn: 'NEO264300002', baseMac: 'a0:19:b2:c0:c5:95', mgtLan: '', mgtIpmi: '' };

const unpack = async (doc) => {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const xml = await zip.file('word/document.xml').async('string');
  const text = xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  const media = [];
  for (const f of Object.keys(zip.files).filter((n) => n.startsWith('word/media/') && !n.endsWith('/'))) {
    media.push((await zip.file(f).async('uint8array')).length);
  }
  return { xml, text, media };
};

describe('MAC 表：列印版', () => {
  it('單獨一頁：標題、SN、OUI、10 列 Pair 加 MGT，右下角標誌；A4 橫式', () => {
    const { html } = buildMacSheet(MAC);
    expect(html).toContain('MAC Address Information');
    expect(html).toContain('SN:&nbsp; NEO264300002');
    expect(html).toContain('OUI: LDA Technologies : a0:19:b2:c0');
    expect(html).toContain('P37,P38');
    expect(html).toContain('a0:19:b2:c0:c5:ba');
    expect(html).toContain('MGT<span class="red">(LAN,IPMI)</span>');
    // 頁面邊界 0：瀏覽器不印頁首頁尾（列印時間、網址／伺服器 IP、頁碼）
    expect(html).toContain('@page { size: A4 landscape; margin: 0; }');
    expect(html).toContain('@page mac-page { size: A4 landscape; margin: 0; }');
    expect(MAC_LOGO).toMatch(/^data:image\/png;base64,/);
    expect(html).toContain(`class="mac-logo" src="${MAC_LOGO}"`);
    expect(html).not.toContain('P3,P4');
  });

  it('SN 等內容一律逸出', () => {
    expect(buildMacSheet({ sn: '<b>x</b>' }).html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('附在出機檢查表後面：另起一頁，前面的檢查表不變', () => {
    const device = { id: 1, sn: 'NEO264300002', brand: 'LDA', model: 'FIREWALL' };
    const plain = buildChecklistSheet(device, []);
    const withMac = buildChecklistSheet(device, [], { appendix: buildMacSheetParts(MAC, { appended: true }) });
    expect(plain.html).not.toContain('mac-page');
    expect(withMac.html).toContain('class="mac-page appended"');
    expect(withMac.html).toContain('@page mac-page { size: A4 landscape; margin: 0; }');
    expect(withMac.html.indexOf('出機檢查表</h1>')).toBeLessThan(withMac.html.indexOf('MAC Address Information</h1>'));
  });
});

describe('MAC 表：Word 版', () => {
  let downloads;
  const realClick = HTMLAnchorElement.prototype.click;
  beforeEach(() => {
    downloads = [];
    HTMLAnchorElement.prototype.click = function stub() { downloads.push(this.download); };
    global.URL.createObjectURL = vi.fn(() => 'blob:x');
    global.URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { HTMLAnchorElement.prototype.click = realClick; });

  it('一頁橫式：內容與列印版相同，放進 METECH 標誌', async () => {
    const doc = new Document({ sections: [macDocxSection(MAC)] });
    const { xml, text, media } = await unpack(doc);
    expect(xml).toContain('w:orient="landscape"');
    expect(text).toContain('MAC Address Information');
    expect(text).toContain('SN:  NEO264300002');
    expect(text).toContain('OUI: LDA Technologies : a0:19:b2:c0');
    expect(text).toContain('a0:19:b2:c0:c5:b2');
    expect(text).toContain('MGT(LAN,IPMI)');
    // 標誌是真的圖檔（原檔約 13 KB），不是空的
    expect(media).toHaveLength(1);
    expect(media[0]).toBeGreaterThan(10000);
    // Exchange Port 紅字
    expect(xml).toContain('w:color w:val="FF0000"');
  });

  it('單獨匯出存成「MAC_Address_序號.docx」', async () => {
    await exportMacDocx(MAC);
    expect(downloads).toEqual(['MAC_Address_NEO264300002.docx']);
  });

  it('附在出機檢查表 Word 的最後一節', async () => {
    const device = { id: 1, sn: 'NEO264300002', brand: 'LDA', model: 'FIREWALL' };
    const { doc } = await createChecklistDocument(device, [], [], { loadImage: vi.fn(), extraSections: [macDocxSection(MAC)] });
    const { xml, text } = await unpack(doc);
    expect(text.indexOf('出機檢查表')).toBeLessThan(text.indexOf('MAC Address Information'));
    expect((xml.match(/<w:sectPr/g) || []).length).toBe(2);
  });
});
