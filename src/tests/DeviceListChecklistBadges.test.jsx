import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeviceList from '../pages/DeviceList';
import { queries } from '../../database/queries';

/**
 * 設備列表的出機檢查狀態
 *
 * 「檢查 x/y」原本只算主要檢查功能；細項填了沒有、照片拍了沒有，
 * 都要打開檢查表才知道。現在：
 *   檢查 x/y   主要檢查功能（勾選）+ 細項（有填內容）
 *   照片 x/y   拍照項目拍了幾項；沒有拍照項目但有上傳照片時顯示張數
 */
const dev = (id, sn) => ({
  id, sn, brand: 'BLACKCORE', type: 'SERVER', model: '3122-TX', specification: '96C',
  ownership: 'FOR_SALE', status: 'ACTIVE', custom_attributes: {}, components: [],
});
const DEVICES = [dev(1, 'BC0001'), dev(2, 'BC0002'), dev(3, 'BC0003'), dev(4, 'BC0004')];
const SUMMARY = [
  { asset_id: 1, total: 8, done: 5, photo_total: 5, photo_done: 2, photo_count: 3 },
  { asset_id: 2, total: 8, done: 8, photo_total: 5, photo_done: 5, photo_count: 7 },
  // 沒有拍照項目，但有上傳照片
  { asset_id: 3, total: 0, done: 0, photo_total: 0, photo_done: 0, photo_count: 4 },
];

beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
  window.electronAPI = {
    namedQuery: vi.fn((query) => {
      if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') return Promise.resolve({ success: true, rows: DEVICES });
      if (query === 'fetchAssetChecklistSummary') return Promise.resolve({ success: true, rows: SUMMARY });
      return Promise.resolve({ success: true, rows: [] });
    }),
    runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
});

const show = async () => {
  render(<MemoryRouter initialEntries={['/devices?brand=BLACKCORE']}><DeviceList /></MemoryRouter>);
  await screen.findByText('BC0001');
};

describe('設備列表：出機檢查與照片狀態', () => {
  it('有獨立的「出機檢查」欄位，兩個標籤都在這一欄，不在狀態欄', async () => {
    await show();
    const headers = [...document.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const col = headers.indexOf('出機檢查');
    expect(col).toBe(headers.indexOf('狀態') + 1);

    const cells = (await screen.findByTestId('checklist-badge-1')).closest('tr').querySelectorAll('td');
    expect(cells[col].contains(screen.getByTestId('checklist-badge-1'))).toBe(true);
    expect(cells[col].contains(screen.getByTestId('photo-badge-1'))).toBe(true);
    expect(cells[col - 1].querySelector('[data-testid^="checklist-badge"]')).toBeNull();
  });

  it('沒有任何檢查資料的設備在這一欄顯示「—」', async () => {
    await show();
    await screen.findByTestId('photo-badge-1');
    const headers = [...document.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const row = screen.getByText('BC0004').closest('tr');
    expect(row.querySelectorAll('td')[headers.indexOf('出機檢查')].textContent).toBe('—');
  });

  it('檢查數量包含細項', async () => {
    await show();
    expect(await screen.findByTestId('checklist-badge-1')).toHaveTextContent('檢查 5/8');
    expect(screen.getByTestId('checklist-badge-1').title).toContain('細項填寫內容才算');
  });

  it('有拍照項目時顯示拍了幾項，說明共幾張照片', async () => {
    await show();
    const badge = await screen.findByTestId('photo-badge-1');
    expect(badge).toHaveTextContent('照片 2/5');
    expect(badge.title).toContain('共 3 張照片');
  });

  it('拍齊了與還沒拍齊用不同顏色', async () => {
    await show();
    const partial = await screen.findByTestId('photo-badge-1');
    const full = screen.getByTestId('photo-badge-2');
    expect(full).toHaveTextContent('照片 5/5');
    expect(partial.style.color).not.toBe(full.style.color);
  });

  it('沒有拍照項目但有上傳照片，顯示張數', async () => {
    await show();
    expect(await screen.findByTestId('photo-badge-3')).toHaveTextContent('照片 4 張');
    // 沒有檢查項目就不顯示檢查標籤
    expect(screen.queryByTestId('checklist-badge-3')).not.toBeInTheDocument();
  });

  it('什麼都沒有的設備不顯示任何標籤', async () => {
    await show();
    await screen.findByTestId('photo-badge-1');
    expect(screen.queryByTestId('checklist-badge-4')).not.toBeInTheDocument();
    expect(screen.queryByTestId('photo-badge-4')).not.toBeInTheDocument();
  });
});

describe('彙總查詢', () => {
  const sql = queries.fetchAssetChecklistSummary.replace(/\s+/g, ' ');

  it('細項填了內容才算完成', () => {
    expect(sql).toContain("COUNT(*) FILTER (WHERE c.kind IN ('MAIN', 'DETAIL'))::int AS total");
    expect(sql).toContain("(c.kind = 'DETAIL' AND NULLIF(TRIM(COALESCE(c.content, '')), '') IS NOT NULL)");
  });

  it('沒有檢查項目、只有照片的設備也列得出來', () => {
    expect(sql).toContain('FULL JOIN photos p ON p.asset_id = i.asset_id');
  });
});
