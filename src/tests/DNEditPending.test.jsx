import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import OutboundRegistrationModal from '../components/OutboundRegistrationModal';
import DNList from '../pages/DNList';
import { RoleContext } from '../context/RoleContext';
import { createRunTransactionMock } from './helpers/mockTransaction';

/**
 * 編輯出貨單（僅限「已建立 (待出貨)」）
 *
 * 出貨單原本建好就只能刪掉重建。已確認出貨的單不可編輯 ——
 * 庫存與資產狀態都已依照單上內容異動，事後改內容會對不起來。
 */
describe('出貨單：編輯待出貨的單據', () => {
  const DN = {
    id: 7,
    request_no: 'DN-20260914-05',
    request_type: 'SALE',
    customer: '原客戶',
    location: '原地點',
    contact_info: '王先生 0900-000-000',
    shipping_date: '2026-09-14',
    project_name: '',
    status: 'PENDING',
    item_count: 1,
    creator_name: 'Admin',
    signed_doc_url: null,
    signed_doc_name: null,
  };

  const ITEMS = [
    { id: 1, item_id: 10, brand: 'DELL', model: 'R750', specification: '32C',
      type: 'SERVER', category_name: '設備', sn: 'SN-1', quantity: 1, location: '原地點' },
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
      if (query === 'fetchDNList') return Promise.resolve({ success: true, rows: [DN] });
      if (query === 'fetchDNItems') return Promise.resolve({ success: true, rows: ITEMS });
      if (query === 'fetchCustomers') return Promise.resolve({ success: true, rows: [{ id: 1, name: '原客戶', contact: '王先生', phone: '0900-000-000', address: '原地點' }] });
      if (query === 'countOutboundRequests') return Promise.resolve({ success: true, rows: [{ count: 1 }] });
      return Promise.resolve({ success: true, rows: [], rowCount: 1 });
    });

    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const called = (name) => calls.filter((c) => c.query === name);

  const renderModal = () => render(
    <MemoryRouter>
      <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, full_name: 'Admin' }, setAuthUser: vi.fn() }}>
        <OutboundRegistrationModal isOpen editingDn={DN} onClose={vi.fn()} onSuccess={vi.fn()} />
      </RoleContext.Provider>
    </MemoryRouter>
  );

  it('開啟時沿用原單號並載入原客戶，標題顯示為修改', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByDisplayValue(/原客戶/)).toBeInTheDocument());
    expect(screen.getByText(/修改出貨單/)).toBeInTheDocument();
    expect(screen.getByText(/儲存修改/)).toBeInTheDocument();
    // 編輯不可產生新單號
    expect(screen.getByDisplayValue('DN-20260914-05')).toBeInTheDocument();
  });

  it('載入原單的明細品項', async () => {
    renderModal();
    await waitFor(() => expect(called('fetchDNItems')[0].params).toEqual([7]));
    await waitFor(() => expect(screen.getByText(/SN-1/)).toBeInTheDocument());
  });

  it('儲存時更新原單而不是新建，並整批換掉明細', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText(/SN-1/)).toBeInTheDocument());

    await userEvent.click(screen.getByText(/儲存修改/));

    await waitFor(() => expect(called('updateOutboundRequestHeader')).toHaveLength(1));
    // 單頭更新帶入原單 id
    expect(called('updateOutboundRequestHeader')[0].params.at(-1)).toBe(7);
    // 明細整批換掉
    expect(called('deleteOutboundItemsByRequest')[0].params).toEqual([7]);
    // 不該再開一張新單，也不該再抽一個新單號
    expect(called('insertOutboundRequestWithProject')).toHaveLength(0);
    expect(called('countOutboundRequests')).toHaveLength(0);
  });

  it('明細寫回原單，不會寫到別張單上', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText(/SN-1/)).toBeInTheDocument());

    await userEvent.click(screen.getByText(/儲存修改/));

    await waitFor(() => expect(called('insertOutboundItem')).toHaveLength(1));
    expect(called('insertOutboundItem')[0].params[0]).toBe(7);
    expect(called('insertOutboundItem')[0].params[2]).toBe('SN-1');
  });

  it('編輯模式不會把內容寫進新建用的草稿', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByDisplayValue(/原客戶/)).toBeInTheDocument());

    // 草稿若被覆蓋，下次開「新增出貨單」會帶出別人的單
    expect(localStorage.getItem('dn_draft_header')).toBeNull();
    expect(localStorage.getItem('dn_draft_items')).toBeNull();
  });

  describe('列表上的入口', () => {
    const renderList = () => render(
      <MemoryRouter>
        <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, full_name: 'Admin' }, setAuthUser: vi.fn() }}>
          <DNList />
        </RoleContext.Provider>
      </MemoryRouter>
    );

    it('待出貨的單有編輯按鈕', async () => {
      renderList();
      await waitFor(() => expect(screen.getByText('DN-20260914-05')).toBeInTheDocument());
      expect(screen.getByLabelText('編輯')).toBeInTheDocument();
    });

    it('已出貨的單沒有編輯按鈕', async () => {
      namedQueryMock.mockImplementation((query) => {
        if (query === 'fetchDNList') return Promise.resolve({ success: true, rows: [{ ...DN, status: 'SHIPPED' }] });
        return Promise.resolve({ success: true, rows: [], rowCount: 1 });
      });
      renderList();
      await waitFor(() => expect(screen.getByText('DN-20260914-05')).toBeInTheDocument());
      expect(screen.queryByLabelText('編輯')).not.toBeInTheDocument();
      // 已出貨也不可刪除，維持原本的限制
      expect(screen.queryByLabelText('刪除')).not.toBeInTheDocument();
    });
  });
});
