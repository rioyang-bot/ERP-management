import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LentList from '../pages/LentList';
import { MemoryRouter } from 'react-router-dom';
import { RoleContext } from '../context/RoleContext';

/**
 * 借用列表的搜尋框放在頁籤列右側
 *
 * 原本頁籤下面另外一整列只放一個搜尋框，左邊一小塊、右邊全空。
 * 搬到頁籤列的右側（與維修單列表相同），表格往上挪。
 */
const shipped = {
  id: 1, request_no: 'DN-SHIPPED-01', customer: '台積電', location: '新竹',
  shipping_date: '2026-09-14', expected_return_date: '2026-09-30',
  status: 'SHIPPED', request_type: 'LEND', creator_name: 'Admin',
};

beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
  window.electronAPI = {
    namedQuery: vi.fn((query) => Promise.resolve({ success: true, rows: query === 'fetchLentRequests' ? [shipped] : [] })),
    runTransaction: vi.fn(),
    saveFile: vi.fn(),
    getDashboardStats: vi.fn(),
  };
});

const renderList = () => render(
  <MemoryRouter>
    <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1 }, setAuthUser: vi.fn() }}>
      <LentList />
    </RoleContext.Provider>
  </MemoryRouter>
);

describe('借用列表：搜尋在頁籤列右側', () => {
  it('搜尋框與頁籤在同一列，靠右', async () => {
    renderList();
    await screen.findByText('DN-SHIPPED-01');
    const bar = screen.getByTestId('lent-tab-bar');
    const toolbar = screen.getByTestId('lent-toolbar');
    expect(bar.lastElementChild).toBe(toolbar);
    expect(toolbar.style.marginLeft).toBe('auto');
    expect(toolbar.contains(screen.getByPlaceholderText(/快速搜尋單號/))).toBe(true);
    expect([...bar.querySelectorAll(':scope > button')].map((b) => b.textContent.replace(/\d+$/, '').trim()))
      .toEqual(['已建立 (待借出)', '借出中 (待歸還)', '已結案 (歷史紀錄)']);
  });

  it('頁籤列下面直接是表格，沒有另一列', async () => {
    renderList();
    await screen.findByText('DN-SHIPPED-01');
    const bar = screen.getByTestId('lent-tab-bar');
    expect(bar.nextElementSibling.querySelector('table')).not.toBeNull();
  });

  it('借出中的「僅顯示逾期未還」也在同一列', async () => {
    renderList();
    await screen.findByText('DN-SHIPPED-01');
    expect(screen.getByTestId('lent-toolbar')).toHaveTextContent('僅顯示逾期未還');
  });

  it('搜尋照常運作', async () => {
    renderList();
    await screen.findByText('DN-SHIPPED-01');
    await userEvent.type(screen.getByPlaceholderText(/快速搜尋單號/), '不存在的單號');
    await waitFor(() => expect(screen.queryByText('DN-SHIPPED-01')).not.toBeInTheDocument());
  });
});
