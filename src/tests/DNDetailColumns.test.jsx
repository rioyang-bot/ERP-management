import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DNList from '../pages/DNList';
import { RoleContext } from '../context/RoleContext';

/**
 * 出貨單明細：廠牌、型號、規格分開三欄
 *
 * 原本「項目詳情」把廠牌型號擠在一行、規格放在下面一小行，
 * 看不出是哪一個欄位打錯。拆成三欄，與進貨明細相同。
 */
const DN = {
  id: 7, request_no: 'DN-20261002-01', request_type: 'SALE', customer: '元大', location: '台北',
  shipping_date: '2026-10-02', status: 'PENDING', item_count: 2, creator_name: 'Admin',
  signed_doc_url: null, signed_doc_name: null,
};
const ITEMS = [
  { id: 1, item_id: 10, brand: 'DELL', model: 'R750', specification: '32C', type: 'SERVER', category_name: '設備', sn: 'SN-1', quantity: 1, location: '台北' },
  { id: 2, item_id: 11, brand: 'METECH', model: 'LC-LC', specification: '', type: '光纖線', category_name: '耗材', sn: null, quantity: 3, location: '台北' },
];

beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
  window.electronAPI = {
    namedQuery: vi.fn(async (query) => {
      if (query === 'fetchDNList') return { success: true, rows: [DN] };
      if (query === 'fetchDNItems') return { success: true, rows: ITEMS };
      return { success: true, rows: [] };
    }),
    runTransaction: vi.fn(),
    saveFile: vi.fn(),
    getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
});

const openDetail = async () => {
  render(
    <MemoryRouter>
      <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1 }, setAuthUser: vi.fn() }}>
        <DNList />
      </RoleContext.Provider>
    </MemoryRouter>
  );
  const row = (await screen.findByText(DN.request_no)).closest('tr');
  await userEvent.click(within(row).getByTitle('查看詳情'));
  await waitFor(() => expect(screen.getByTestId('dn-item-brand-0')).toBeInTheDocument());
};

describe('出貨單明細的欄位', () => {
  it('沒有「項目詳情」，改成廠牌、型號、規格三欄', async () => {
    await openDetail();
    const table = screen.getByTestId('dn-item-brand-0').closest('table');
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    expect(headers).toEqual(['類型', '廠牌', '型號', '規格', '序號 (S/N)', '數量', '發送位置']);
    expect(table.querySelector('tbody tr').querySelectorAll('td')).toHaveLength(headers.length);
  });

  it('各欄顯示各自的值，沒填的顯示 -', async () => {
    await openDetail();
    expect(screen.getByTestId('dn-item-brand-0')).toHaveTextContent('DELL');
    expect(screen.getByTestId('dn-item-model-0')).toHaveTextContent('R750');
    expect(screen.getByTestId('dn-item-spec-0')).toHaveTextContent('32C');
    expect(screen.getByTestId('dn-item-spec-1')).toHaveTextContent('-');
  });
});
