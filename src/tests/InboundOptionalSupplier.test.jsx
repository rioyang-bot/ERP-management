import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Inbound from '../pages/Inbound';
import { MemoryRouter } from 'react-router-dom';
import { createRunTransactionMock } from './helpers/mockTransaction';

/**
 * 進貨單的供應商改為非必填
 *
 * 收到貨時常常還沒確認是哪一家供應商，卻必須先把品項與數量入庫。
 * 因此建立進貨單時允許留空，日後於進貨單列表編輯補填。
 */
describe('進貨入庫單：供應商非必填', () => {
  const namedQueryMock = vi.fn();
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    window.confirm = vi.fn().mockReturnValue(true);

    namedQueryMock.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchSuppliers') {
        return Promise.resolve({ success: true, rows: [{ id: 7, name: '元大Yuanta' }] });
      }
      if (query === 'fetchAvailableItems') {
        return Promise.resolve({
          success: true,
          rows: [{ id: 1, brand: 'PANDUIT', model: 'CAT6A', specification: '3M', type: '線材', cat_name: '耗材', unit: '條' }],
        });
      }
      if (query === 'countInboundOrders') return Promise.resolve({ success: true, rows: [{ count: 0 }] });
      return Promise.resolve({ success: true, rows: [] });
    });

    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
    };
  });

  const renderPage = () => render(<MemoryRouter><Inbound /></MemoryRouter>);

  it('供應商欄位標示為可留空，不再標示必填', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/供應商名稱/)).toBeInTheDocument());

    const label = screen.getByText(/供應商名稱/);
    expect(label.textContent).toContain('可留空');
    expect(label.textContent).not.toContain('必填');
  });

  it('下拉選單的預設項說明日後可補填', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/尚未確認/)).toBeInTheDocument());
  });

  it('未選供應商時不會被擋下，也不會跳出要求先選採購單的提示', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/供應商名稱/)).toBeInTheDocument());

    const submit = screen.getByRole('button', { name: /確認入庫|建立進貨單|入庫/ });
    fireEvent.click(submit);

    await waitFor(() => {
      const messages = window.alert.mock.calls.map((c) => String(c[0]));
      // 確定 handleSubmit 真的有執行到（否則此測試會空過）：
      // 明細尚未選品項，後續的檢查一定會有訊息
      expect(messages.length).toBeGreaterThan(0);
      // 舊版會先在供應商這一關擋下，要求先選採購單帶入供應商
      expect(messages.some((m) => m.includes('請先選擇對應的採購單以帶入供應商資訊'))).toBe(false);
      expect(messages.some((m) => m.includes('請確認所有明細均已選擇入庫品項'))).toBe(true);
    });
  });
});
