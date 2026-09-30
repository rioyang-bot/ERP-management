import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ChecklistTemplates from '../pages/ChecklistTemplates';
import { queries } from '../../database/queries';

/**
 * 刪除範本項目後，設備上的同一項
 *
 * 先前刪範本時設備上一律保留，結果刪掉的拍照項目在檢查表上一直都在；
 * 用同一個名稱重建時，同步看到同名舊列就跳過，新項目與說明永遠套不上去。
 */
let calls;
const called = (name) => calls.filter((c) => c.query === name);

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  window.alert = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  window.electronAPI = {
    getDashboardStats: vi.fn(),
    runTransaction: vi.fn(),
    namedQuery: vi.fn(async (query, params) => {
      calls.push({ query, params });
      if (query === 'fetchChecklistGroups') {
        return { success: true, rows: [{ id: 2, name: 'BlackCore 出機檢查表', brand: 'BLACKCORE', main_count: 0, detail_count: 0, photo_count: 1 }] };
      }
      if (query === 'fetchChecklistItems') return { success: true, rows: [{ id: 61, group_id: 2, kind: 'PHOTO', name: 'RAID' }] };
      if (query === 'deleteUnusedAssetChecklistItemsBySource' || query === 'deleteUnusedAssetChecklistItemsByGroup') {
        return { success: true, rows: [{ id: 1, asset_id: 1 }, { id: 2, asset_id: 2 }, { id: 3, asset_id: 3 }] };
      }
      if (query === 'deleteChecklistItem' || query === 'deleteChecklistGroup') return { success: true, rows: [{ id: params[0] }] };
      return { success: true, rows: [] };
    }),
  };
});

const renderPage = async () => {
  render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
  await screen.findByText('RAID');
};

describe('刪除範本項目', () => {
  it('先清掉設備上沒有紀錄的同一項，再刪範本', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '刪除 RAID' }));

    await waitFor(() => expect(called('deleteChecklistItem')).toHaveLength(1));
    const order = calls.map((c) => c.query);
    // 範本一刪，設備列的來源就變成 NULL，所以順序不能反過來
    expect(order.indexOf('deleteUnusedAssetChecklistItemsBySource')).toBeLessThan(order.indexOf('deleteChecklistItem'));
    expect(called('deleteUnusedAssetChecklistItemsBySource')[0].params).toEqual([61]);
    expect(await screen.findByText('「RAID」已從 3 台設備上移除')).toBeInTheDocument();
  });

  it('確認訊息說清楚哪些會移除、哪些保留', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '刪除 RAID' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('還沒勾選、填寫或拍照的同一項會一併移除'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('已經有紀錄的保留'));
  });

  it('清除失敗就不刪範本，免得設備上的舊項目再也對不回來', async () => {
    const original = window.electronAPI.namedQuery;
    window.electronAPI.namedQuery = vi.fn(async (query, params) => (
      query === 'deleteUnusedAssetChecklistItemsBySource'
        ? (calls.push({ query, params }), { success: false, error: 'boom' })
        : original(query, params)
    ));
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '刪除 RAID' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('刪除失敗')));
    expect(called('deleteChecklistItem')).toHaveLength(0);
  });

  it('刪整個主項目時同樣先清設備上沒有紀錄的', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '刪除主項目 BlackCore 出機檢查表' }));

    await waitFor(() => expect(called('deleteChecklistGroup')).toHaveLength(1));
    const order = calls.map((c) => c.query);
    expect(order.indexOf('deleteUnusedAssetChecklistItemsByGroup')).toBeLessThan(order.indexOf('deleteChecklistGroup'));
    expect(called('deleteUnusedAssetChecklistItemsByGroup')[0].params).toEqual([2]);
  });
});

describe('查詢', () => {
  const oneLine = (s) => s.replace(/\s+/g, ' ');

  it('只刪沒有勾選、沒有內容、沒有照片的', () => {
    for (const name of ['deleteUnusedAssetChecklistItemsBySource', 'deleteUnusedAssetChecklistItemsByGroup']) {
      const sql = oneLine(queries[name]);
      expect(sql, name).toContain('NOT COALESCE(a.is_checked, FALSE)');
      expect(sql, name).toContain("NULLIF(TRIM(COALESCE(a.content, '')), '') IS NULL");
      expect(sql, name).toContain('NOT EXISTS (SELECT 1 FROM asset_photos p WHERE p.checklist_item_id = a.id)');
    }
  });

  it('同步時先把同名的舊列接回範本，而不是看到同名就跳過', () => {
    const sql = oneLine(queries.syncBrandChecklistToAssets).trim();
    expect(sql).toMatch(/^WITH relinked AS \( UPDATE asset_checklist_items x SET source_item_id = t\.item_id, description = t\.description/);
    expect(sql).toContain('AND x.source_item_id IS NULL');
    // 接回與補上用的是同一套比對規則
    expect(sql.match(/JOIN item_master m ON/g)).toHaveLength(2);
  });

  it('一次性清理只動主要檢查功能與拍照項目，逐台自訂的細項不碰', () => {
    const sql = require('fs').readFileSync('database/migration_checklist_orphan_cleanup.sql', 'utf8');
    expect(sql).toMatch(/WHERE a\.source_item_id IS NULL\s+AND a\.kind IN \('MAIN', 'PHOTO'\)/);
  });
});
