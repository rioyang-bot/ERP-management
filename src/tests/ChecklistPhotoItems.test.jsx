import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AssetPhotoSection from '../components/AssetPhotoSection';
import DeviceChecklistModal from '../components/DeviceChecklistModal';
import ChecklistTemplates from '../pages/ChecklistTemplates';
import { buildChecklistSheet } from '../utils/checklistSheet';
import { queries } from '../../database/queries';

/**
 * 出機檢查表的拍照項目
 *
 * 主機照片原本是整台一起上傳，人員不知道該拍哪些、拍漏了也看不出來。
 * 範本裡定義拍照項目（正面、背面…），自動套用到每台設備，逐項上傳，有照片就算完成。
 */
const DEVICE = { id: 7, sn: 'DFE322328070001', brand: 'SECRETHFT', model: '3122-SM' };

const PHOTO_ITEMS = [
  { id: 501, asset_id: 7, group_name: 'SecretHFT 出機檢查', kind: 'PHOTO', item_name: '正面', source_item_id: 61, photo_count: 1 },
  { id: 502, asset_id: 7, group_name: 'SecretHFT 出機檢查', kind: 'PHOTO', item_name: '背面', source_item_id: 62, photo_count: 0 },
];

const photo = (id, name, itemId = null) => ({
  id, asset_id: 7, file_name: `${name}-1787.jpg`, original_name: name,
  mime_type: 'image/jpeg', file_size: 1024, uploaded_by_name: '楊先生', checklist_item_id: itemId,
});

const imageFile = (name) => {
  const file = new File(['x'], name, { type: 'image/jpeg' });
  Object.defineProperty(file, 'size', { value: 1024 });
  return file;
};

let calls;
let namedQuery;
const called = (name) => calls.filter((c) => c.query === name);

const installApi = (handler) => {
  namedQuery = vi.fn(async (query, params) => {
    calls.push({ query, params });
    const res = handler(query, params);
    return res || { success: true, rows: [] };
  });
  window.electronAPI = {
    namedQuery,
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

describe('主機照片區列出拍照項目', () => {
  const photos = [photo(31, '正面.jpg', 501), photo(32, '機況.jpg', null)];

  beforeEach(() => {
    installApi((query) => {
      if (query === 'fetchAssetPhotos') return { success: true, rows: photos };
      if (query === 'insertAssetPhoto') return { success: true, rows: [{ id: 99 }] };
      return null;
    });
  });

  it('每個拍照項目都列出來，看得出哪些拍了、哪些還沒', async () => {
    render(<AssetPhotoSection device={DEVICE} photoItems={PHOTO_ITEMS} />);

    const front = await screen.findByTestId('photo-item-501');
    await waitFor(() => expect(within(front).getByText('已上傳 1 張')).toBeInTheDocument());
    expect(within(screen.getByTestId('photo-item-502')).getByText('尚未上傳')).toBeInTheDocument();
    expect(screen.getByTestId('photo-items-progress')).toHaveTextContent('拍照項目 1 / 2');
  });

  it('照片放在它所屬的拍照項目底下，其他的另列', async () => {
    render(<AssetPhotoSection device={DEVICE} photoItems={PHOTO_ITEMS} />);

    const front = await screen.findByTestId('photo-item-501');
    await waitFor(() => expect(within(front).getByText('正面.jpg')).toBeInTheDocument());
    expect(within(front).queryByText('機況.jpg')).not.toBeInTheDocument();
    expect(screen.getByText('其他照片（1 張）')).toBeInTheDocument();
    expect(screen.getByText('機況.jpg')).toBeInTheDocument();
  });

  it('從拍照項目上傳的照片會記在那一項底下', async () => {
    const onChanged = vi.fn();
    render(<AssetPhotoSection device={DEVICE} photoItems={PHOTO_ITEMS} onChanged={onChanged} />);
    await screen.findByTestId('photo-item-502');

    await userEvent.click(screen.getByRole('button', { name: '上傳 背面 的照片' }));
    await userEvent.upload(screen.getByTestId('asset-photo-item-input'), imageFile('back.jpg'));

    await waitFor(() => expect(called('insertAssetPhoto')).toHaveLength(1));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('「背面」'));
    expect(called('insertAssetPhoto')[0].params[7]).toBe(502);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(called('insertAuditLog')[0].params[8]).toContain('拍照項目：背面');
  });

  it('上方的上傳鈕上傳的是其他照片，不掛任何項目', async () => {
    render(<AssetPhotoSection device={DEVICE} photoItems={PHOTO_ITEMS} />);
    await screen.findByTestId('photo-item-501');

    expect(screen.getByTestId('upload-asset-photo-btn')).toHaveTextContent('上傳其他照片');
    await userEvent.upload(screen.getByTestId('asset-photo-input'), imageFile('extra.jpg'));

    await waitFor(() => expect(called('insertAssetPhoto')).toHaveLength(1));
    expect(called('insertAssetPhoto')[0].params[7]).toBeNull();
  });

  it('沒有拍照項目時維持原本的樣子', async () => {
    render(<AssetPhotoSection device={DEVICE} />);
    await screen.findByText('機況.jpg');
    expect(screen.queryByTestId('photo-items-progress')).not.toBeInTheDocument();
    expect(screen.getByTestId('upload-asset-photo-btn')).toHaveTextContent('上傳照片');
    // 沒有拍照項目時，掛在項目上的照片也照常列出
    expect(screen.getByText('正面.jpg')).toBeInTheDocument();
  });
});

describe('設備檢查表視窗', () => {
  const GROUPS = [{ id: 2, name: 'SecretHFT 出機檢查', brand: 'SECRETHFT', main_count: 1, detail_count: 0, photo_count: 2 }];
  const TEMPLATE = [
    { id: 21, group_id: 2, kind: 'MAIN', name: 'BIOS 設定' },
    { id: 61, group_id: 2, kind: 'PHOTO', name: '正面' },
    { id: 62, group_id: 2, kind: 'PHOTO', name: '背面' },
  ];
  const APPLIED = [
    { id: 801, group_name: 'SecretHFT 出機檢查', kind: 'MAIN', item_name: 'BIOS 設定', source_item_id: 21, is_checked: false },
    ...PHOTO_ITEMS,
    // 範本已經刪掉的拍照項目
    { id: 503, group_name: 'SecretHFT 出機檢查', kind: 'PHOTO', item_name: '舊項目', source_item_id: null, photo_count: 0 },
  ];

  beforeEach(() => {
    installApi((query) => {
      if (query === 'fetchChecklistGroups') return { success: true, rows: GROUPS };
      if (query === 'fetchChecklistItems') return { success: true, rows: TEMPLATE };
      if (query === 'fetchAssetChecklist') return { success: true, rows: APPLIED };
      if (query === 'fetchAssetPhotos') return { success: true, rows: [photo(31, '正面.jpg', 501)] };
      if (query === 'insertAssetPhoto') return { success: true, rows: [{ id: 99 }] };
      return null;
    });
  });

  it('標題列顯示照片完成度', async () => {
    render(<DeviceChecklistModal isOpen device={DEVICE} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByTestId('header-photo-progress')).toHaveTextContent('照片 1 / 3');
  });

  it('拍照項目不會混進勾選的檢查項目裡', async () => {
    render(<DeviceChecklistModal isOpen device={DEVICE} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByTestId('photo-item-501');
    expect(screen.queryByLabelText('正面 檢查完成')).not.toBeInTheDocument();
  });

  it('自動套用的拍照項目不能從單台移除，範本已刪除的才可以', async () => {
    render(<DeviceChecklistModal isOpen device={DEVICE} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByTestId('photo-item-503');
    expect(screen.queryByLabelText('移除 正面')).not.toBeInTheDocument();
    expect(screen.getByLabelText('移除 舊項目')).toBeInTheDocument();
  });

  it('上傳照片後重新讀取完成度', async () => {
    render(<DeviceChecklistModal isOpen device={DEVICE} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByTestId('photo-item-502');
    const before = called('fetchAssetChecklist').length;

    await userEvent.click(screen.getByRole('button', { name: '上傳 背面 的照片' }));
    await userEvent.upload(screen.getByTestId('asset-photo-item-input'), imageFile('back.jpg'));

    await waitFor(() => expect(called('fetchAssetChecklist').length).toBeGreaterThan(before));
  });
});

describe('範本維護頁的拍照項目', () => {
  let items;
  beforeEach(() => {
    items = [{ id: 21, group_id: 2, kind: 'MAIN', name: 'BIOS 設定' }];
    installApi((query, params) => {
      if (query === 'fetchChecklistGroups') {
        return { success: true, rows: [{ id: 2, name: 'SecretHFT 出機檢查', brand: 'SECRETHFT', main_count: 1, detail_count: 0, photo_count: items.filter((i) => i.kind === 'PHOTO').length }] };
      }
      if (query === 'fetchChecklistItems') return { success: true, rows: items };
      if (query === 'fetchDeviceBrands') return { success: true, rows: [{ id: 1, name: 'SECRETHFT' }] };
      if (query === 'insertChecklistItem') {
        const row = { id: 900 + items.length, group_id: params[0], kind: params[1], name: params[2] };
        items = [...items, row];
        return { success: true, rows: [row] };
      }
      if (query === 'syncBrandChecklistToAssets') return { success: true, rows: [{ id: 1 }, { id: 2 }] };
      return null;
    });
  });

  it('有拍照項目一欄', async () => {
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: '拍照項目' })).toBeInTheDocument();
  });

  it('新增拍照項目後立刻套用到符合的設備', async () => {
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    await screen.findByRole('heading', { name: '拍照項目' });

    // 左側主項目自動選好之前，輸入框是停用的
    await waitFor(() => expect(screen.getByLabelText('拍照項目名稱')).toBeEnabled());
    await userEvent.type(screen.getByLabelText('拍照項目名稱'), '正面');
    await userEvent.click(screen.getByRole('button', { name: '新增拍照項目' }));

    await waitFor(() => expect(called('insertChecklistItem')).toHaveLength(1));
    expect(called('insertChecklistItem')[0].params.slice(0, 3)).toEqual([2, 'PHOTO', '正面']);
    await waitFor(() => expect(called('syncBrandChecklistToAssets')).toHaveLength(1));
    expect(await screen.findByText(/主要 1 · 細項 0 · 拍照 1/)).toBeInTheDocument();
  });
});

describe('列印', () => {
  const ITEMS = [
    { id: 1, group_name: 'G', kind: 'MAIN', item_name: 'BIOS 設定', is_checked: true },
    { id: 2, group_name: 'G', kind: 'PHOTO', item_name: '正面', photo_count: 2 },
    { id: 3, group_name: 'G', kind: 'PHOTO', item_name: '背面', photo_count: 0 },
  ];

  it('拍照項目獨立一區，印出上傳狀態', () => {
    const { body } = buildChecklistSheet(DEVICE, ITEMS);
    expect(body).toContain('拍照項目（共 2 項，已上傳 1 項）');
    expect(body).toContain('☑ 已上傳 2 張');
    expect(body).toContain('☐ 尚未上傳');
  });

  it('拍照項目不算進勾選的檢查項目', () => {
    const { body } = buildChecklistSheet(DEVICE, ITEMS);
    expect(body).toContain('檢查項目（共 1 項，已完成 1 項）');
  });

  it('沒有拍照項目時不印這一區', () => {
    const { body } = buildChecklistSheet(DEVICE, [ITEMS[0]]);
    expect(body).not.toContain('拍照項目');
  });
});

describe('資料庫', () => {
  const oneLine = (s) => s.replace(/\s+/g, ' ');

  it('三種項目都自動套用，細項不再需要另外勾選', () => {
    const sql = oneLine(queries.syncBrandChecklistToAssets);
    expect(sql).toContain("i.kind IN ('MAIN', 'DETAIL', 'PHOTO')");
    expect(sql).not.toContain('auto_apply');
  });

  it('照片只能掛到同一台設備的拍照項目上', () => {
    const sql = oneLine(queries.insertAssetPhoto);
    expect(sql).toContain("c.id = $8::integer AND c.asset_id = $1::integer AND c.kind = 'PHOTO'");
  });

  it('設備項目帶出已上傳張數', () => {
    expect(oneLine(queries.fetchAssetChecklist)).toContain('p.checklist_item_id = c.id');
  });

  it('拍照項目從設備上移除時，照片留著改列為其他照片', () => {
    const sql = require('fs').readFileSync('database/migration_checklist_photo_items.sql', 'utf8');
    expect(sql).toMatch(/REFERENCES asset_checklist_items\(id\) ON DELETE SET NULL/);
    expect(sql).toContain("CHECK (kind IN ('MAIN', 'DETAIL', 'PHOTO'))");
  });
});
