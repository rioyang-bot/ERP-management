import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { createChecklistDocument, exportChecklistDocx } from '../utils/checklistDocx';
import ChecklistWordButton from '../components/ChecklistWordButton';

/**
 * 出機檢查表匯出 Word（連照片）
 *
 * 內容同列印版；照片是一欄表格：每個拍照項目一列「項目：說明」，下面每張照片一列撐滿寬度。
 */
const DEVICE = { id: 3056, sn: 'STG10041Y26', type: 'SERVER', brand: 'SECRETHFT', model: 'SECRETHFT-ARL', specification: '8C-Gen1', client: 'KGI', location: 'IDC', components: [{ brand: 'INTEL', model: 'X710', sn: 'NIC-1' }] };
const ITEMS = [
  { id: 1, group_name: 'ARL 出機檢查', kind: 'CHECK', item_name: 'BIOS FW Update', is_checked: true },
  { id: 2, group_name: 'ARL 出機檢查', kind: 'CHECK', item_name: 'IPMI full speed Fans', is_checked: false },
  { id: 3, group_name: 'ARL 出機檢查', kind: 'DETAIL', item_name: 'OS', content: 'RH9.6' },
  { id: 4, group_name: 'ARL 出機檢查', kind: 'PHOTO', item_name: 'Type', description: 'lshw |more' },
  { id: 5, group_name: 'ARL 出機檢查', kind: 'PHOTO', item_name: 'CPU', description: 'lscpu' },
  { id: 6, group_name: 'ARL 出機檢查', kind: 'PHOTO', item_name: '主機背面' },
];
const photo = (id, name, itemId) => ({ id, file_name: `${name}-1.png`, original_name: name, checklist_item_id: itemId });
const PHOTOS = [photo(11, 'type.png', 4), photo(12, 'cpu1.png', 5), photo(13, 'cpu2.png', 5), photo(14, 'misc.png', null)];

// 1x1 PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0));
const fakeImage = (w = 800, h = 400) => async () => ({ data: PNG, width: w, height: h, type: 'png' });

/** 文件解開：document.xml 的純文字（每段一行）與照片數 */
const unpack = async (doc) => {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const xml = await zip.file('word/document.xml').async('string');
  const text = xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  const drawings = (xml.match(/<w:drawing>/g) || []).length;
  return { xml, text, drawings };
};

describe('createChecklistDocument', () => {
  it('設備資訊、檢查項目（勾選）、細項紀錄、簽核欄都在', async () => {
    const { doc } = await createChecklistDocument(DEVICE, ITEMS, [], { loadImage: fakeImage() });
    const { text } = await unpack(doc);
    for (const s of ['出機檢查表', 'STG10041Y26', 'SECRETHFT-ARL', 'KGI', 'INTEL X710（SN: NIC-1）',
      '檢查項目（共 2 項，已完成 1 項）', 'BIOS FW Update', '☑', '☐', '細項紀錄', 'RH9.6', '檢查人員', '覆核']) {
      expect(text).toContain(s);
    }
  });

  it('照片：每個拍照項目一列「項目：說明」，下面每張照片一列；不屬於項目的列在其他照片', async () => {
    const { doc, failed } = await createChecklistDocument(DEVICE, ITEMS, PHOTOS, { loadImage: fakeImage() });
    const { text, drawings } = await unpack(doc);
    expect(failed).toEqual([]);
    expect(drawings).toBe(4);
    const lines = text.split('\n');
    const at = (s) => lines.indexOf(s);
    expect(text).toContain('照片（共 4 張）');
    // 順序：Type → CPU（兩張）→ 主機背面（沒有照片）→ 其他照片
    expect(at('Type：lshw |more')).toBeGreaterThan(-1);
    expect(at('CPU：lscpu')).toBeGreaterThan(at('Type：lshw |more'));
    expect(at('主機背面')).toBeGreaterThan(at('CPU：lscpu'));
    expect(lines[at('主機背面') + 1]).toBe('（尚未上傳照片）');
    expect(at('其他照片')).toBeGreaterThan(at('主機背面'));
  });

  it('照片撐滿表格寬度、比例不變', async () => {
    const { doc } = await createChecklistDocument(DEVICE, ITEMS, [PHOTOS[0]], { loadImage: fakeImage(1600, 800) });
    const { xml } = await unpack(doc);
    const [, cx, cy] = xml.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
    // 寬:高 維持 2:1；寬度接近內文寬（A4 扣 14mm 邊界，約 17.6cm）
    expect(Math.round(Number(cx) / Number(cy))).toBe(2);
    expect(Number(cx) / 360000).toBeGreaterThan(16);
    expect(Number(cx) / 360000).toBeLessThan(18);
  });

  it('讀不到的照片：放說明文字，回報檔名，其餘照常', async () => {
    let n = 0;
    const loadImage = async () => { n += 1; if (n === 2) throw new Error('404'); return fakeImage()(); };
    const { doc, failed } = await createChecklistDocument(DEVICE, ITEMS, PHOTOS, { loadImage });
    const { text, drawings } = await unpack(doc);
    expect(failed).toEqual(['cpu1.png']);
    expect(drawings).toBe(3);
    expect(text).toContain('（照片讀取失敗：cpu1.png）');
  });
});

describe('匯出並下載', () => {
  let downloads;
  const realClick = HTMLAnchorElement.prototype.click;
  beforeEach(() => {
    downloads = [];
    window.alert = vi.fn();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:docx');
    globalThis.URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = function stub() { downloads.push(this.download); };
    window.electronAPI = { namedQuery: vi.fn(async (q) => (q === 'fetchAssetPhotos' ? { success: true, rows: PHOTOS } : { success: true, rows: [] })) };
  });
  afterEach(() => { HTMLAnchorElement.prototype.click = realClick; });

  it('讀這台設備的照片，存成「出機檢查表_序號.docx」', async () => {
    const res = await exportChecklistDocx(DEVICE, ITEMS, { loadImage: fakeImage() });
    expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('fetchAssetPhotos', [3056]);
    expect(downloads).toEqual(['出機檢查表_STG10041Y26.docx']);
    expect(res).toEqual({ photos: 4, failed: [] });
  });

  it('按鈕：沒有檢查項目時不能按', () => {
    render(<ChecklistWordButton device={DEVICE} items={[]} disabled />);
    expect(screen.getByRole('button', { name: /匯出 Word/ })).toBeDisabled();
  });

  it('按鈕：照片讀不到時匯出照常、提示哪幾張沒放進去', async () => {
    // 預設的讀圖會走 canvas（jsdom 沒有），每張都失敗 —— 正好驗證失敗的提示
    render(<ChecklistWordButton device={DEVICE} items={ITEMS} />);
    await userEvent.click(screen.getByRole('button', { name: /匯出 Word/ }));
    await waitFor(() => expect(downloads).toEqual(['出機檢查表_STG10041Y26.docx']));
    expect(window.alert.mock.calls[0][0]).toContain('有 4 張照片讀取失敗');
  });
});
