import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Packer } from 'docx';
import JSZip from 'jszip';
import AssetPhotoSection from '../components/AssetPhotoSection';
import ChecklistTemplates from '../pages/ChecklistTemplates';
import { buildChecklistSheet } from '../utils/checklistSheet';
import { createChecklistDocument } from '../utils/checklistDocx';
import { hasDefaultPhoto, usesDefaultPhoto, isPhotoItemDone, defaultPhotoOf } from '../utils/checklistDefaultPhoto';
import { queries } from '../../database/queries';

/**
 * 出機檢查表：拍照項目的預設照片
 *
 * 同一種設備拍出來都一樣的項目，在範本上傳一張預設照片。
 * 設備上這一項還沒上傳自己的照片時：顯示預設照片（標明「預設照片」）、算已完成、
 * 匯出 Word 印預設照片並加註。上傳了自己的照片就改用自己的。
 */
const DEVICE = { id: 7, sn: 'DFE322328070001', brand: 'SECRETHFT', model: '3122-SM' };

// 501：自己有照片，範本也有預設 → 用自己的；502：沒照片、範本有預設 → 用預設；503：都沒有
const PHOTO_ITEMS = [
  { id: 501, asset_id: 7, group_name: 'SecretHFT 出機檢查', kind: 'PHOTO', item_name: '正面', source_item_id: 61, photo_count: 1, default_photo_file: 'front-default.jpg', default_photo_name: '正面範例.jpg' },
  { id: 502, asset_id: 7, group_name: 'SecretHFT 出機檢查', kind: 'PHOTO', item_name: '背板標示', source_item_id: 62, photo_count: 0, default_photo_file: 'rear-default.jpg', default_photo_name: '背板.jpg', default_photo_size: 2048 },
  { id: 503, asset_id: 7, group_name: 'SecretHFT 出機檢查', kind: 'PHOTO', item_name: '機櫃內配線', source_item_id: 63, photo_count: 0, default_photo_file: null },
];
const OWN_PHOTO = { id: 31, asset_id: 7, file_name: 'front-own.jpg', original_name: '正面.jpg', mime_type: 'image/jpeg', file_size: 1024, uploaded_by_name: '楊先生', checklist_item_id: 501 };

// 範本頁要先讀主項目與項目才畫得出來，整套測試一起跑時常超過預設的 1 秒
const PAGE_LOAD = { timeout: 5000 };

let calls;
const called = (name) => calls.filter((c) => c.query === name);
const auditLogs = () => called('insertAuditLog').map((c) => ({ module: c.params[4], targetId: c.params[6], summary: c.params[8], details: c.params[9] }));

const installApi = (handler) => {
  window.electronAPI = {
    namedQuery: vi.fn(async (query, params) => {
      calls.push({ query, params });
      return handler(query, params) || { success: true, rows: [] };
    }),
    runTransaction: vi.fn(),
    getDashboardStats: vi.fn(),
    saveFile: vi.fn(async (name) => ({ success: true, fileName: `${name}-1787` })),
    loadMedia: vi.fn(async () => ({ success: true, blob: new Blob(['x']) })),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  window.alert = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('判定規則', () => {
  it('自己沒照片、範本有預設照片才用預設；用預設也算完成', () => {
    expect(hasDefaultPhoto(PHOTO_ITEMS[0])).toBe(true);
    expect(usesDefaultPhoto(PHOTO_ITEMS[0])).toBe(false);
    expect(usesDefaultPhoto(PHOTO_ITEMS[1])).toBe(true);
    expect(usesDefaultPhoto(PHOTO_ITEMS[2])).toBe(false);
    expect(PHOTO_ITEMS.map((i) => isPhotoItemDone(i))).toEqual([true, true, false]);
  });

  it('預設照片包成照片的形狀，標記 isDefault', () => {
    expect(defaultPhotoOf(PHOTO_ITEMS[1])).toMatchObject({ file_name: 'rear-default.jpg', original_name: '背板.jpg', checklist_item_id: 502, isDefault: true });
    expect(defaultPhotoOf(PHOTO_ITEMS[2])).toBeNull();
  });
});

describe('資料庫查詢', () => {
  it('設備的檢查表從範本帶出預設照片；完成度把預設照片算進去', () => {
    expect(queries.fetchAssetChecklist).toContain("LEFT JOIN checklist_items t ON t.id = c.source_item_id AND c.kind = 'PHOTO'");
    expect(queries.fetchAssetChecklistSummary).toContain('t.default_photo_file IS NOT NULL');
  });

  it('只有拍照項目能設預設照片，並回傳原本的檔名', () => {
    expect(queries.setChecklistItemDefaultPhoto).toContain("i.kind = 'PHOTO'");
    expect(queries.setChecklistItemDefaultPhoto).toContain('old.default_photo_name AS prev_photo_name');
    expect(queries.clearChecklistItemDefaultPhoto).toContain('default_photo_file = NULL');
  });

  it('複製主項目時預設照片一併帶過去', () => {
    expect(queries.copyChecklistItems).toContain('default_photo_file, default_photo_name');
  });
});

describe('設備的主機照片區', () => {
  beforeEach(() => {
    installApi((query) => (query === 'fetchAssetPhotos' ? { success: true, rows: [OWN_PHOTO] } : null));
  });

  it('沒照片的項目顯示預設照片並標明，算完成；預設照片不能在設備上刪', async () => {
    render(<AssetPhotoSection device={DEVICE} photoItems={PHOTO_ITEMS} />);
    const rear = await screen.findByTestId('photo-item-502');
    expect(within(rear).getByText('使用預設照片')).toBeInTheDocument();
    const card = within(rear).getByTestId('asset-photo-default-502-rear-default.jpg');
    expect(within(card).getByText('預設照片')).toBeInTheDocument();
    expect(within(card).queryByTitle('刪除')).toBeNull();
    // 正面自己有照片：用自己的，不顯示預設
    const front = screen.getByTestId('photo-item-501');
    await waitFor(() => expect(within(front).getByText('已上傳 1 張')).toBeInTheDocument());
    expect(within(front).queryByText('預設照片')).toBeNull();
    // 完成度：正面（自己的）+ 背板（預設）= 2 / 3
    expect(screen.getByTestId('photo-items-progress')).toHaveTextContent('拍照項目 2 / 3');
    expect(within(screen.getByTestId('photo-item-503')).getByText('尚未上傳')).toBeInTheDocument();
  });

  it('預設照片的縮圖也會取回', async () => {
    render(<AssetPhotoSection device={DEVICE} photoItems={PHOTO_ITEMS} />);
    await waitFor(() => expect(window.electronAPI.loadMedia).toHaveBeenCalledWith('rear-default.jpg'));
    // 自己已經有照片的項目不去取它的預設照片
    expect(window.electronAPI.loadMedia).not.toHaveBeenCalledWith('front-default.jpg');
  });
});

describe('列印與匯出', () => {
  it('列印版：用預設照片的項目標示「使用預設照片」，算進已上傳', () => {
    const { body: html } = buildChecklistSheet(DEVICE, PHOTO_ITEMS);
    expect(html).toContain('拍照項目（共 3 項，已上傳 2 項）');
    expect(html).toContain('☑ 使用預設照片');
    expect(html).toContain('☐ 尚未上傳');
  });

  it('Word：沒照片的項目印預設照片，圖說加註「預設照片」', async () => {
    const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0));
    const loadImage = vi.fn(async () => ({ data: PNG, width: 800, height: 400, type: 'png' }));
    const { doc } = await createChecklistDocument(DEVICE, PHOTO_ITEMS, [OWN_PHOTO], { loadImage });
    expect(loadImage.mock.calls.map(([p]) => p.file_name)).toEqual(['front-own.jpg', 'rear-default.jpg']);
    const xml = await (await JSZip.loadAsync(await Packer.toBuffer(doc))).file('word/document.xml').async('string');
    const text = xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
    expect(text).toContain('背板標示（預設照片）');
    expect(text).not.toContain('正面（預設照片）');
    expect(text).toContain('機櫃內配線');
    expect(text).toContain('（尚未上傳照片）');
  });
});

describe('範本維護頁：設定預設照片', () => {
  let items;
  beforeEach(() => {
    items = [
      { id: 61, group_id: 2, kind: 'PHOTO', name: '背板標示' },
      { id: 62, group_id: 2, kind: 'PHOTO', name: '正面', default_photo_file: 'front-default.jpg', default_photo_name: '正面範例.jpg' },
    ];
    installApi((query, params) => {
      if (query === 'fetchChecklistGroups') return { success: true, rows: [{ id: 2, name: 'SecretHFT 出機檢查', brand: 'SECRETHFT', main_count: 0, detail_count: 0, photo_count: 2 }] };
      if (query === 'fetchChecklistItems') return { success: true, rows: items };
      if (query === 'fetchDeviceBrands') return { success: true, rows: [{ id: 1, name: 'SECRETHFT' }] };
      if (query === 'setChecklistItemDefaultPhoto') {
        const it = items.find((i) => i.id === params[5]);
        const prev = it.default_photo_name || null;
        Object.assign(it, { default_photo_file: params[0], default_photo_name: params[1] });
        return { success: true, rows: [{ id: it.id, name: it.name, prev_photo_name: prev }] };
      }
      if (query === 'clearChecklistItemDefaultPhoto') {
        const it = items.find((i) => i.id === params[0]);
        const prev = it.default_photo_name;
        Object.assign(it, { default_photo_file: null, default_photo_name: null });
        return { success: true, rows: [{ id: it.id, name: it.name, prev_photo_name: prev }] };
      }
      return null;
    });
  });

  const imageFile = (name) => {
    const file = new File(['x'], name, { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: 1024 });
    return file;
  };

  it('上傳預設照片：存檔、寫入範本、記事件', async () => {
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    const btn = await screen.findByRole('button', { name: '上傳 背板標示 的預設照片' }, PAGE_LOAD);
    await userEvent.click(btn);
    fireEvent.change(screen.getByTestId('default-photo-input'), { target: { files: [imageFile('背板.jpg')] } });

    await waitFor(() => expect(called('setChecklistItemDefaultPhoto')).toHaveLength(1));
    expect(window.electronAPI.saveFile).toHaveBeenCalledWith('背板.jpg', expect.anything());
    expect(called('setChecklistItemDefaultPhoto')[0].params).toEqual(['背板.jpg-1787', '背板.jpg', 'image/jpeg', 1024, expect.anything(), 61]);
    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    expect(auditLogs()[0]).toMatchObject({
      module: 'SETTING', targetId: '61',
      summary: '出機檢查表拍照項目 [背板標示]（主項目 [SecretHFT 出機檢查]）設定預設照片 [背板.jpg]',
    });
    expect(await screen.findByText('預設照片：背板.jpg')).toBeInTheDocument();
  });

  it('更換：事件紀錄寫出換掉了哪一張', async () => {
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: '更換 正面 的預設照片' }, PAGE_LOAD));
    fireEvent.change(screen.getByTestId('default-photo-input'), { target: { files: [imageFile('正面新.jpg')] } });
    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    expect(auditLogs()[0].summary).toBe('出機檢查表拍照項目 [正面]（主項目 [SecretHFT 出機檢查]）更換預設照片：正面範例.jpg → 正面新.jpg');
  });

  it('移除預設照片並記事件', async () => {
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: '移除 正面 的預設照片' }, PAGE_LOAD));
    await waitFor(() => expect(called('clearChecklistItemDefaultPhoto')[0]?.params).toEqual([62]));
    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    expect(auditLogs()[0].summary).toBe('出機檢查表拍照項目 [正面]（主項目 [SecretHFT 出機檢查]）移除預設照片 [正面範例.jpg]');
    expect(await screen.findByRole('button', { name: '上傳 正面 的預設照片' }, PAGE_LOAD)).toBeInTheDocument();
  });

  it('不是圖片：不上傳', async () => {
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: '上傳 背板標示 的預設照片' }, PAGE_LOAD));
    fireEvent.change(screen.getByTestId('default-photo-input'), { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('不能當預設照片')));
    expect(window.electronAPI.saveFile).not.toHaveBeenCalled();
  });

  // 預設照片也能用貼上的：「貼上」鈕讀剪貼簿，或點選預設照片那一列後按 Ctrl+V
  const pasteImage = (target = document) => {
    const blob = new File(['x'], 'image.png', { type: 'image/png' });
    fireEvent.paste(target, { clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => blob }], files: [blob] } });
  };
  const savedName = () => window.electronAPI.saveFile.mock.calls[0]?.[0];

  it('「貼上」鈕：剪貼簿的圖片當預設照片，依拍照項目重新命名並記事件', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: async () => [{ types: ['image/png'], getType: async () => blob }] },
    });
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: '貼上 背板標示 的預設照片' }, PAGE_LOAD));
    await waitFor(() => expect(called('setChecklistItemDefaultPhoto')).toHaveLength(1));
    // 剪貼簿的檔名都是 image.png：改成「項目_預設照片_時間」
    expect(savedName()).toMatch(/^背板標示_預設照片_\d{8}-\d{6}\.png$/);
    expect(called('setChecklistItemDefaultPhoto')[0].params.at(-1)).toBe(61);
    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    expect(auditLogs()[0].summary).toMatch(/^出機檢查表拍照項目 \[背板標示\]（主項目 \[SecretHFT 出機檢查\]）設定預設照片 \[背板標示_預設照片_\d{8}-\d{6}\.png\]$/);
  });

  it('已經有預設照片：貼上就是更換，事件紀錄寫出換掉了哪一張', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: async () => [{ types: ['image/png'], getType: async () => blob }] },
    });
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: '貼上 正面 的預設照片' }, PAGE_LOAD));
    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('確定要更換「正面」的預設照片嗎'));
    expect(auditLogs()[0].summary).toMatch(/更換預設照片：正面範例\.jpg → 正面_預設照片_\d{8}-\d{6}\.png$/);
  });

  it('剪貼簿裡沒有圖片就說明，不上傳', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: async () => [{ types: ['text/plain'], getType: async () => new Blob(['hi']) }] },
    });
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: '貼上 背板標示 的預設照片' }, PAGE_LOAD));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('剪貼簿裡沒有圖片')));
    expect(window.electronAPI.saveFile).not.toHaveBeenCalled();
  });

  it('點選預設照片那一列後按 Ctrl+V：貼到那一項，貼完取消選取', async () => {
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    const row = await screen.findByTestId('default-photo-61', {}, PAGE_LOAD);
    // 還沒點選：Ctrl+V 不做事
    pasteImage();
    expect(window.electronAPI.saveFile).not.toHaveBeenCalled();

    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('default-photo-paste-hint-61')).toHaveTextContent('按 Ctrl+V 貼上');
    pasteImage();
    await waitFor(() => expect(called('setChecklistItemDefaultPhoto')).toHaveLength(1));
    expect(called('setChecklistItemDefaultPhoto')[0].params.at(-1)).toBe(61);
    expect(savedName()).toMatch(/^背板標示_預設照片_/);
    await waitFor(() => expect(screen.getByTestId('default-photo-61')).toHaveAttribute('aria-selected', 'false'));
  });

  it('再點一次取消選取；游標在輸入框裡時照常貼上文字', async () => {
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    const row = await screen.findByTestId('default-photo-61', {}, PAGE_LOAD);
    await userEvent.click(row);
    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-selected', 'false');

    await userEvent.click(row);
    const input = document.createElement('input');
    input.setAttribute('aria-label', '其他輸入框');
    document.body.appendChild(input);
    pasteImage(input);
    expect(window.electronAPI.saveFile).not.toHaveBeenCalled();
    input.remove();
  });
});
