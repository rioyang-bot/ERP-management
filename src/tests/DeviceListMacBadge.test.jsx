import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeviceList from '../pages/DeviceList';
import { queries } from '../../database/queries';

/**
 * 設備列表：需要 MAC 表（主項目勾了「需要 MAC 表」，例如 LDA FIREWALL）的設備，
 * P1 沒填時在「出機檢查」欄顯示紅底「MAC 未填」，填了顯示綠色「MAC 已填」；不需要的設備不顯示。
 */
const dev = (id, sn) => ({
  id, sn, brand: 'LDA', type: 'SWITCH', model: 'FIREWALL', specification: '',
  ownership: 'FOR_SALE', status: 'ACTIVE', custom_attributes: {}, components: [],
});
const DEVICES = [dev(1, 'NEO0001'), dev(2, 'NEO0002'), dev(3, 'NEO0003'), dev(4, 'NEO0004')];
const SUMMARY = [
  { asset_id: 1, total: 7, done: 2, photo_total: 0, photo_done: 0, photo_count: 0, mac_required: true, mac_filled: false },
  { asset_id: 2, total: 7, done: 7, photo_total: 0, photo_done: 0, photo_count: 0, mac_required: true, mac_filled: true },
  { asset_id: 3, total: 7, done: 1, photo_total: 0, photo_done: 0, photo_count: 0, mac_required: false, mac_filled: false },
  // 還沒有任何檢查項目，但需要 MAC 表：仍要提示
  { asset_id: 4, total: 0, done: 0, photo_total: 0, photo_done: 0, photo_count: 0, mac_required: true, mac_filled: false },
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
  render(<MemoryRouter initialEntries={['/devices?brand=LDA']}><DeviceList /></MemoryRouter>);
  await screen.findByText('NEO0001');
};

describe('設備列表：MAC 表未填提示', () => {
  it('P1 沒填：紅底「MAC 未填」；已填：綠色「MAC 已填」；不需要的設備沒有標籤', async () => {
    await show();
    const missing = await screen.findByTestId('mac-badge-1');
    expect(missing).toHaveTextContent('MAC 未填');
    expect(missing.style.backgroundColor).toBe('rgb(220, 38, 38)');
    expect(screen.getByTestId('mac-badge-2')).toHaveTextContent('MAC 已填');
    expect(screen.queryByTestId('mac-badge-3')).toBeNull();
  });

  it('還沒有檢查項目的設備，需要 MAC 表也會提示', async () => {
    await show();
    expect(await screen.findByTestId('mac-badge-4')).toHaveTextContent('MAC 未填');
  });

  it('點標籤開啟出機檢查表', async () => {
    await show();
    await userEvent.click(await screen.findByTestId('mac-badge-1'));
    expect(await screen.findByText('出機檢查表', { selector: 'h2' })).toBeInTheDocument();
  });

  it('摘要查詢帶出 mac_required / mac_filled，P1 有填才算已填', () => {
    const sql = queries.fetchAssetChecklistSummary.replace(/\s+/g, ' ');
    expect(sql).toContain('AS mac_required');
    expect(sql).toContain("NULLIF(TRIM(COALESCE(mi.base_mac, '')), '') IS NOT NULL");
    expect(sql).toContain('WHERE g.mac_table');
  });
});
