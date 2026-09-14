import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LentList from '../pages/LentList';
import { MemoryRouter } from 'react-router-dom';
import { RoleContext } from '../context/RoleContext';
import { createRunTransactionMock } from './helpers/mockTransaction';

/**
 * 借用單列表的分頁切換
 *
 * 待借出為空時，程式會自動切到借出中。這個自動切換原本每次抓資料都會執行，
 * 而切換分頁本身就會重新抓資料 —— 於是使用者點「已建立（待借出）」會被立刻
 * 彈回借出中，看起來像點了沒反應，那個分頁等於永遠打不開。
 */
describe('借用單列表：分頁切換', () => {
  const shipped = {
    id: 1, request_no: 'DN-SHIPPED-01', customer: '台積電', location: '新竹',
    shipping_date: '2026-09-14', expected_return_date: '2026-09-30',
    status: 'SHIPPED', request_type: 'LEND', creator_name: 'Admin',
  };
  const pending = { ...shipped, id: 2, request_no: 'DN-PENDING-01', status: 'PENDING' };

  const namedQueryMock = vi.fn();

  const setup = (rows) => {
    namedQueryMock.mockImplementation((query) => {
      if (query === 'fetchLentRequests') return Promise.resolve({ success: true, rows });
      return Promise.resolve({ success: true, rows: [], rowCount: 1 });
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
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

  it('待借出為空時，第一次載入自動切到借出中', async () => {
    setup([shipped]);
    renderList();
    await waitFor(() => expect(screen.getByText('DN-SHIPPED-01')).toBeInTheDocument());
  });

  it('待借出為空時，仍然點得進「已建立（待借出）」分頁', async () => {
    setup([shipped]);
    renderList();
    await waitFor(() => expect(screen.getByText('DN-SHIPPED-01')).toBeInTheDocument());

    // 統計卡片上也有同樣的文字，要指定分頁按鈕
    await userEvent.click(screen.getByRole('button', { name: /已建立 \(待借出\)/ }));

    // 舊版會被立刻彈回借出中，於是借出中的單據還留在畫面上
    await waitFor(() => {
      expect(screen.queryByText('DN-SHIPPED-01')).not.toBeInTheDocument();
      expect(screen.getByText(/目前尚無待借出單據/)).toBeInTheDocument();
    });
  });

  it('待借出有資料時不會被切走', async () => {
    setup([pending, shipped]);
    renderList();
    await waitFor(() => expect(screen.getByText('DN-PENDING-01')).toBeInTheDocument());
    expect(screen.queryByText('DN-SHIPPED-01')).not.toBeInTheDocument();
  });

  it('切換分頁不會重複發出查詢', async () => {
    setup([pending, shipped]);
    renderList();
    await waitFor(() => expect(screen.getByText('DN-PENDING-01')).toBeInTheDocument());

    const before = namedQueryMock.mock.calls.filter((c) => c[0] === 'fetchLentRequests').length;
    await userEvent.click(screen.getByRole('button', { name: /借出中 \(待歸還\)/ }));
    await waitFor(() => expect(screen.getByText('DN-SHIPPED-01')).toBeInTheDocument());

    const after = namedQueryMock.mock.calls.filter((c) => c[0] === 'fetchLentRequests').length;
    expect(after).toBe(before);
  });
});
