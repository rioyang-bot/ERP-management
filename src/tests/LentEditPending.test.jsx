import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LendOrderRegistrationModal from '../components/LendOrderRegistrationModal';
import LentList from '../pages/LentList';
import { MemoryRouter } from 'react-router-dom';
import { RoleContext } from '../context/RoleContext';
import { createRunTransactionMock } from './helpers/mockTransaction';

/**
 * 編輯借用單（僅限「待借出」）
 *
 * 借用單原本沒有編輯功能，要改內容只能刪掉重建。
 * 已出庫的單不可編輯 —— 內容改了會與實際庫存不符。
 */
describe('借用單：編輯待借出的單據', () => {
  const DN = {
    id: 42,
    request_no: 'DN-20260914-03',
    customer: '原客戶',
    location: '原地點',
    contact_info: '王先生',
    shipping_date: '2026-09-14',
    expected_return_date: '2026-09-30',
    project_name: '',
    status: 'PENDING',
    request_type: 'LEND',
    creator_name: 'Admin',
  };

  const ITEMS = [
    { id: 1, item_id: 10, brand: 'DELL', model: 'R750', specification: '32C',
      type: 'SERVER', category_name: '設備', sn: 'SN-1', quantity: 1, location: '原地點', purpose: '運作測試' },
  ];

  const namedQueryMock = vi.fn();
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    localStorage.clear();

    namedQueryMock.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchLentRequests') return Promise.resolve({ success: true, rows: [DN] });
      if (query === 'fetchDNItems') return Promise.resolve({ success: true, rows: ITEMS });
      if (query === 'fetchCustomers') return Promise.resolve({ success: true, rows: [{ id: 1, name: '原客戶' }] });
      if (query === 'countOutboundRequests') return Promise.resolve({ success: true, rows: [{ count: 1 }] });
      return Promise.resolve({ success: true, rows: [], rowCount: 1 });
    });

    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
    };
  });

  const called = (name) => calls.filter((c) => c.query === name);

  const renderModal = () => render(
    <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, full_name: 'Admin' }, setAuthUser: vi.fn() }}>
      <LendOrderRegistrationModal isOpen editingDn={DN} onClose={vi.fn()} onSuccess={vi.fn()} />
    </RoleContext.Provider>
  );

  it('開啟時載入原單的客戶與單號，標題顯示為修改', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByDisplayValue('原客戶')).toBeInTheDocument());
    expect(screen.getByText(/修改借用單/)).toBeInTheDocument();
    expect(screen.getByText(/儲存修改/)).toBeInTheDocument();
  });

  it('載入原單的明細品項', async () => {
    renderModal();
    await waitFor(() => expect(called('fetchDNItems')[0].params).toEqual([42]));
    await waitFor(() => expect(screen.getByText(/SN-1/)).toBeInTheDocument());
  });

  it('儲存時更新原單而不是新建，並整批換掉明細', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByDisplayValue('原客戶')).toBeInTheDocument());

    await userEvent.click(screen.getByText(/儲存修改/));

    await waitFor(() => expect(called('updateOutboundRequestHeader')).toHaveLength(1));
    // 單頭更新帶入原單 id
    expect(called('updateOutboundRequestHeader')[0].params.at(-1)).toBe(42);
    // 明細整批換掉
    expect(called('deleteOutboundItemsByRequest')[0].params).toEqual([42]);
    // 不該再開一張新單
    expect(called('insertOutboundRequest')).toHaveLength(0);
  });

  it('編輯模式不會把內容寫進新建用的草稿', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByDisplayValue('原客戶')).toBeInTheDocument());

    // 草稿若被覆蓋，下次開「新增借用單」會帶出別人的單
    expect(localStorage.getItem('lend_draft_header')).toBeNull();
    expect(localStorage.getItem('lend_draft_items')).toBeNull();
  });

  describe('列表上的入口', () => {
    const renderList = () => render(
      <MemoryRouter>
        <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, full_name: 'Admin' }, setAuthUser: vi.fn() }}>
          <LentList />
        </RoleContext.Provider>
      </MemoryRouter>
    );

    it('待借出的單有編輯按鈕', async () => {
      renderList();
      await waitFor(() => expect(screen.getByText('DN-20260914-03')).toBeInTheDocument());
      expect(screen.getByLabelText('修改借用單')).toBeInTheDocument();
    });

    it('借出中的單沒有編輯按鈕', async () => {
      namedQueryMock.mockImplementation((query) => {
        if (query === 'fetchLentRequests') return Promise.resolve({ success: true, rows: [{ ...DN, status: 'SHIPPED' }] });
        return Promise.resolve({ success: true, rows: [], rowCount: 1 });
      });
      renderList();
      await waitFor(() => expect(screen.getByText('DN-20260914-03')).toBeInTheDocument());
      expect(screen.queryByLabelText('修改借用單')).not.toBeInTheDocument();
      // 借出中改用「撤銷借出」退回待借出後才能修改
      expect(screen.getByLabelText('撤銷借出')).toBeInTheDocument();
    });
  });
});
