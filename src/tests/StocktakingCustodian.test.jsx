import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queries } from '../../database/queries';

/**
 * 庫存盤點表：公司資產多一欄「保管人」，資料取資產的 End-user
 *
 * End-user 在資產上有欄位與 custom_attributes 兩處（設備列表先讀欄位），查詢照同樣的順序取。
 * 設備、硬體、耗材三個分頁是依品項加總的數量，沒有單台的 End-user，不加這一欄。
 */
const COMPANY_ROWS = [
  { id: 1, sn: 'QTU5250009', asset_no: 'METECH-2026-001', brand: 'RARITAN', model: 'PX3-5466R', status: 'ACTIVE', location: 'BQDC3F', category_name: '設備', end_user: '王大明' },
  { id: 2, sn: 'A9000000009', asset_no: null, brand: 'SERVER TECHNOLOGY', model: 'C2WG24BN', status: 'LENT', location: 'LAB, 2F', category_name: '設備', end_user: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
  window.electronAPI = {
    namedQuery: vi.fn((query) => {
      if (query === 'fetchCompanyAssets') return Promise.resolve({ success: true, rows: COMPANY_ROWS });
      if (query === 'fetchStocktakingAssets') return Promise.resolve({ success: true, rows: [{ item_master_id: 9, category_name: '設備', brand: 'ARISTA', model: 'DCS-7010TX', stock_qty: 2 }] });
      return Promise.resolve({ success: true, rows: [] });
    }),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
});

const showCompany = async () => {
  const { default: Stocktaking } = await import('../pages/Stocktaking');
  render(<Stocktaking />);
  await userEvent.click(screen.getByText('公司資產盤點'));
  await screen.findByText('QTU5250009');
};

const LABEL = '保管人(End-User)';
const headers = () => screen.getAllByRole('columnheader').map((th) => th.textContent.trim());
const cellsOf = (sn) => [...screen.getByText(sn).closest('tr').querySelectorAll('td')].map((td) => td.textContent.trim());

describe('公司資產盤點：保管人', () => {
  it('查詢帶出 End-user：先讀欄位，空的再讀 custom_attributes', () => {
    expect(queries.fetchCompanyAssets).toContain(
      "COALESCE(NULLIF(TRIM(a.end_user), ''), NULLIF(TRIM(a.custom_attributes->>'end_user'), '')) AS end_user"
    );
  });

  it('保管人欄排在存放地點後面、實盤總數前面', async () => {
    await showCompany();
    const h = headers();
    expect(h.indexOf(LABEL)).toBe(h.indexOf('存放地點') + 1);
    expect(h.indexOf('實盤總數')).toBe(h.indexOf(LABEL) + 1);
    expect(cellsOf('QTU5250009')[h.indexOf(LABEL)]).toBe('王大明');
  });

  it('沒有 End-user 的顯示「未指定」，不是空白', async () => {
    await showCompany();
    expect(cellsOf('A9000000009')[headers().indexOf(LABEL)]).toBe('未指定');
  });

  it('可以用保管人搜尋', async () => {
    await showCompany();
    await userEvent.type(screen.getByPlaceholderText(/保管人/), '王大明');
    await waitFor(() => expect(screen.queryByText('A9000000009')).not.toBeInTheDocument());
    expect(screen.getByText('QTU5250009')).toBeInTheDocument();
  });

  it('匯出的 CSV 也有保管人欄（逗號換成全形，不會把欄位切開）', async () => {
    const blobs = [];
    global.URL.createObjectURL = vi.fn((b) => { blobs.push(b); return 'blob:x'; });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await showCompany();
    await userEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));
    const text = await blobs[0].text();
    const [head, first, second] = text.replace(/^﻿/, '').split('\n');
    expect(head).toBe('資產分類,廠牌,型號,資產序號(Asset No),序號(S/N),狀態,存放地點,保管人(End-User),實盤確認,盤點備註');
    expect(first).toBe('"設備","RARITAN","PX3-5466R","METECH-2026-001","QTU5250009","在庫","BQDC3F","王大明","",""');
    expect(second.split('","')[6]).toBe('LAB， 2F');
    expect(second.split('","')[7]).toBe('');
    clickSpy.mockRestore();
  });

  it('設備盤點（依品項加總）不加保管人欄', async () => {
    const { default: Stocktaking } = await import('../pages/Stocktaking');
    render(<Stocktaking />);
    await screen.findByText('DCS-7010TX');
    expect(headers()).not.toContain(LABEL);
  });
});
