import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ChecklistTemplates from '../pages/ChecklistTemplates';
import AssetPhotoSection from '../components/AssetPhotoSection';
import { buildChecklistSheet } from '../utils/checklistSheet';
import { queries } from '../../database/queries';

/**
 * 拍照項目的說明與範例
 *
 * 光有「正面」兩個字，拍的人不知道要拍到什麼程度才算數 ——
 * 說明寫下拍攝指示，設備上每一項底下直接看得到。
 * 常用的項目與說明存成範例，新增時直接選取，不必每個主項目重打一次。
 */
const FRONT_DESC = '關機狀態、正面平視\n前面板與序號貼紙都要清楚入鏡';

let calls;
let items;
let examples;
const called = (name) => calls.filter((c) => c.query === name);

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  window.alert = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
  globalThis.URL.revokeObjectURL = vi.fn();
  items = [
    { id: 61, group_id: 2, kind: 'PHOTO', name: '正面', description: FRONT_DESC },
  ];
  examples = [
    { id: 1, name: '背面', description: '接線全部插好後，從正後方拍，看得到每一條線的標籤' },
    { id: 2, name: '正面', description: '（範例說明）' },
  ];

  window.electronAPI = {
    getDashboardStats: vi.fn(),
    runTransaction: vi.fn(),
    loadMedia: vi.fn(async () => ({ success: true, blob: new Blob(['x']) })),
    namedQuery: vi.fn(async (query, params) => {
      calls.push({ query, params });
      if (query === 'fetchChecklistGroups') {
        return { success: true, rows: [{ id: 2, name: 'SecretHFT 出機檢查', brand: 'SECRETHFT', main_count: 0, detail_count: 0, photo_count: items.length }] };
      }
      if (query === 'fetchChecklistItems') return { success: true, rows: items };
      if (query === 'fetchDeviceBrands') return { success: true, rows: [] };
      if (query === 'fetchChecklistPhotoExamples') return { success: true, rows: examples };
      if (query === 'insertChecklistItem') {
        const row = { id: 900 + items.length, group_id: params[0], kind: params[1], name: params[2], description: params[4] };
        items = [...items, row];
        return { success: true, rows: [row] };
      }
      if (query === 'insertChecklistPhotoExample') {
        const row = { id: 50 + examples.length, name: params[0], description: params[1] };
        examples = [...examples, row];
        return { success: true, rows: [row] };
      }
      if (query === 'deleteChecklistPhotoExample') {
        examples = examples.filter((e) => e.id !== params[0]);
        return { success: true, rows: [{ id: params[0] }] };
      }
      if (query === 'updateChecklistItemName' || query === 'updateChecklistItemDescription' || query === 'updateChecklistPhotoExample') {
        return { success: true, rows: [{ id: 1 }] };
      }
      return { success: true, rows: [] };
    }),
  };
});

const renderPage = async () => {
  render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
  await screen.findByRole('heading', { name: '拍照項目' });
  // 左側主項目自動選好之前，輸入框是停用的
  await waitFor(() => expect(screen.getByLabelText('拍照項目名稱')).toBeEnabled());
};

describe('拍照項目說明', () => {
  it('新增拍照項目時可以一併寫說明', async () => {
    await renderPage();
    await userEvent.type(screen.getByLabelText('拍照項目名稱'), '機櫃內配線');
    await userEvent.type(screen.getByLabelText('拍照項目說明'), '打開機櫃門，由上往下拍');
    await userEvent.click(screen.getByRole('button', { name: '新增拍照項目' }));

    await waitFor(() => expect(called('insertChecklistItem')).toHaveLength(1));
    expect(called('insertChecklistItem')[0].params).toEqual([2, 'PHOTO', '機櫃內配線', 1, '打開機櫃門，由上往下拍']);
    // 新增完清空，下一筆不會帶著上一筆的說明
    await waitFor(() => expect(screen.getByLabelText('拍照項目說明').value).toBe(''));
  });

  it('其他種類的項目不帶說明', async () => {
    await renderPage();
    await userEvent.type(screen.getByLabelText('拍照項目說明'), '這段不該跟著主要檢查功能走');
    await userEvent.type(screen.getByLabelText('主要檢查功能名稱'), 'BIOS 設定');
    await userEvent.click(screen.getByRole('button', { name: '新增主要檢查功能' }));

    await waitFor(() => expect(called('insertChecklistItem')).toHaveLength(1));
    expect(called('insertChecklistItem')[0].params[4]).toBeNull();
  });

  it('範本上的拍照項目顯示說明', async () => {
    await renderPage();
    expect(screen.getByText((_, el) => el?.textContent === FRONT_DESC && el.tagName === 'SPAN')).toBeInTheDocument();
  });

  it('修改說明後，已套用到設備上的也跟著更新', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '修改 正面' }));
    const desc = screen.getByLabelText('修改拍照項目說明');
    await userEvent.clear(desc);
    await userEvent.type(desc, '新的說明');
    await userEvent.click(screen.getByRole('button', { name: '儲存項目' }));

    await waitFor(() => expect(called('updateChecklistItemDescription')[0]?.params).toEqual(['新的說明', 61]));
    await waitFor(() => expect(called('syncAssetChecklistDescriptionBySource')[0]?.params).toEqual(['新的說明', 61]));
  });

  it('只改名稱時不會動到說明', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '修改 正面' }));
    const name = screen.getByLabelText('修改項目名稱');
    await userEvent.clear(name);
    await userEvent.type(name, '正面照');
    await userEvent.click(screen.getByRole('button', { name: '儲存項目' }));

    await waitFor(() => expect(called('updateChecklistItemName')).toHaveLength(1));
    expect(called('updateChecklistItemDescription')).toHaveLength(0);
  });
});

describe('從範例加入', () => {
  it('選了範例就直接加入，名稱與說明都帶進去', async () => {
    await renderPage();
    await userEvent.selectOptions(screen.getByLabelText('從範例加入拍照項目'), '1');

    await waitFor(() => expect(called('insertChecklistItem')).toHaveLength(1));
    expect(called('insertChecklistItem')[0].params).toEqual([
      2, 'PHOTO', '背面', 1, '接線全部插好後，從正後方拍，看得到每一條線的標籤',
    ]);
    expect(called('syncBrandChecklistToAssets').length).toBeGreaterThan(0);
  });

  it('已經加入的範例不能再選', async () => {
    await renderPage();
    const option = within(screen.getByLabelText('從範例加入拍照項目')).getByRole('option', { name: '正面（已加入）' });
    expect(option).toBeDisabled();
  });

  it('同名的項目不會重複加', async () => {
    await renderPage();
    await userEvent.type(screen.getByLabelText('拍照項目名稱'), '正面');
    await userEvent.click(screen.getByRole('button', { name: '新增拍照項目' }));

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('已經在這個主項目'));
    expect(called('insertChecklistItem')).toHaveLength(0);
  });

  it('主項目裡寫好的拍照項目可以存成範例', async () => {
    examples = [];
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '把 正面 存成範例' }));

    await waitFor(() => expect(called('insertChecklistPhotoExample')[0]?.params).toEqual(['正面', FRONT_DESC, 0]));
    expect(await screen.findByText('「正面」已存成範例')).toBeInTheDocument();
  });

  it('範例裡已經有同名的就不重複存', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '把 正面 存成範例' }));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('範例裡已經有「正面」'));
    expect(called('insertChecklistPhotoExample')).toHaveLength(0);
  });
});

describe('拍照項目範例庫', () => {
  it('列出範例與說明', async () => {
    await renderPage();
    const lib = screen.getByTestId('photo-example-library');
    expect(within(lib).getByText('背面')).toBeInTheDocument();
    expect(within(lib).getByText(/從正後方拍/)).toBeInTheDocument();
  });

  it('新增範例', async () => {
    await renderPage();
    const lib = screen.getByTestId('photo-example-library');
    await userEvent.type(within(lib).getByLabelText('範例項目名稱'), '側面');
    await userEvent.type(within(lib).getByLabelText('範例說明'), '左側，看得到散熱孔');
    await userEvent.click(within(lib).getByRole('button', { name: '新增範例' }));

    await waitFor(() => expect(called('insertChecklistPhotoExample')[0]?.params).toEqual(['側面', '左側，看得到散熱孔', 2]));
    expect(await within(lib).findByText('側面')).toBeInTheDocument();
  });

  it('刪除範例要先問過，並說明不影響已加入的項目', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '刪除範例 背面' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('不受影響'));
    await waitFor(() => expect(called('deleteChecklistPhotoExample')[0]?.params).toEqual([1]));
  });

  it('讀不到範例時不影響整頁', async () => {
    const original = window.electronAPI.namedQuery;
    window.electronAPI.namedQuery = vi.fn(async (query, params) => (
      query === 'fetchChecklistPhotoExamples'
        ? { success: false, error: 'relation "checklist_photo_examples" does not exist' }
        : original(query, params)
    ));
    await renderPage();
    expect(screen.getByText('還沒有任何範例')).toBeInTheDocument();
    expect(screen.getByLabelText('從範例加入拍照項目')).toBeDisabled();
  });
});

describe('設備與列印看得到說明', () => {
  it('設備的拍照項目底下顯示說明', async () => {
    window.electronAPI.namedQuery = vi.fn(async () => ({ success: true, rows: [] }));
    render(
      <AssetPhotoSection
        device={{ id: 7, sn: 'SN1' }}
        photoItems={[{ id: 501, kind: 'PHOTO', item_name: '正面', description: FRONT_DESC, photo_count: 0 }]}
      />
    );
    const desc = await screen.findByTestId('photo-item-desc-501');
    expect(desc.textContent).toBe(FRONT_DESC);
  });

  it('列印的拍照項目附上說明', () => {
    const { body } = buildChecklistSheet({ sn: 'SN1' }, [
      { id: 1, kind: 'PHOTO', group_name: 'G', item_name: '正面', description: '<正面平視>', photo_count: 0 },
    ]);
    expect(body).toContain('<div class="photo-desc">&lt;正面平視&gt;</div>');
  });
});

describe('資料庫', () => {
  const oneLine = (s) => s.replace(/\s+/g, ' ');

  it('自動套用時把說明一併帶到設備上', () => {
    const sql = oneLine(queries.syncBrandChecklistToAssets);
    expect(sql).toContain('source_item_id, sort_order, description)');
    expect(sql).toContain('COALESCE(i.sort_order, 0), i.description');
  });

  it('範例名稱不可重複', () => {
    const sql = require('fs').readFileSync('database/migration_checklist_photo_examples.sql', 'utf8');
    expect(sql).toMatch(/UNIQUE INDEX IF NOT EXISTS idx_checklist_photo_examples_name\s+ON checklist_photo_examples \(UPPER\(TRIM\(name\)\)\)/);
  });
});
