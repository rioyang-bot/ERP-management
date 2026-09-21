import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InboundList from '../pages/InboundList';

/**
 * 進貨日期
 *
 * 建單畫面上的「進貨/到貨日期」先前只拿來編單號，從未寫進資料庫 ——
 * order_date 落到預設的今天，列表顯示的又是建檔時間，日期打錯無從更正。
 * 現在日期會存下來，並且與供應商、發票號碼同一個編輯入口可以修改。
 */
const ORDERS = [
  {
    id: 11,
    order_no: 'IN-20260715-01',
    order_date: '2026-07-15',
    effective_date: '2026-07-15',
    created_at: '2026-09-18T10:30:00.000Z',
    partner_id: 7,
    partner_name: '元大Yuanta',
    invoice_no: 'INV-001',
    attachments: '[]',
  },
];

describe('進貨單列表：進貨日期', () => {
  const namedQuery = vi.fn();
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchInboundList') return Promise.resolve({ success: true, rows: ORDERS });
      if (query === 'fetchSuppliers') return Promise.resolve({ success: true, rows: [{ id: 7, name: '元大Yuanta' }] });
      if (query === 'fetchInboundItems') return Promise.resolve({ success: true, rows: [] });
      if (query === 'updateInboundOrderHeader') return Promise.resolve({ success: true, rows: [{ id: 11 }] });
      return Promise.resolve({ success: true, rows: [] });
    });
    window.electronAPI = {
      namedQuery,
      runTransaction: vi.fn(),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const called = (name) => calls.filter((c) => c.query === name);
  const renderList = () => render(<MemoryRouter><InboundList /></MemoryRouter>);

  /** 打開詳情並切到編輯模式 */
  const openEdit = async () => {
    renderList();
    await userEvent.click(await screen.findByLabelText('編輯進貨單'));
    return screen.findByLabelText('進貨日期');
  };

  it('列表把進貨日期與建立時間分開呈現', async () => {
    renderList();
    await screen.findByText('IN-20260715-01');

    expect(screen.getByRole('columnheader', { name: '進貨日期' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '建立時間' })).toBeInTheDocument();
    // 進貨日期是七月，建檔時間是九月，兩者不同
    expect(screen.getByText('2026-07-15')).toBeInTheDocument();
  });

  it('編輯模式可以修改進貨日期', async () => {
    const input = await openEdit();
    expect(input.value).toBe('2026-07-15');
  });

  it('改好的日期會寫回資料庫', async () => {
    const input = await openEdit();
    await userEvent.clear(input);
    await userEvent.type(input, '2026-08-01');
    await userEvent.click(screen.getByRole('button', { name: /儲存/ }));

    await waitFor(() => expect(called('updateInboundOrderHeader')).toHaveLength(1));
    // 參數：供應商、發票號碼、附件、單號 id、進貨日期
    expect(called('updateInboundOrderHeader')[0].params[4]).toBe('2026-08-01');
  });

  it('只改發票號碼時日期原樣送出，不會被清掉', async () => {
    await openEdit();
    const invoice = screen.getByDisplayValue('INV-001');
    await userEvent.clear(invoice);
    await userEvent.type(invoice, 'INV-002');
    await userEvent.click(screen.getByRole('button', { name: /儲存/ }));

    await waitFor(() => expect(called('updateInboundOrderHeader')).toHaveLength(1));
    const params = called('updateInboundOrderHeader')[0].params;
    expect(params[1]).toBe('INV-002');
    expect(params[4]).toBe('2026-07-15');
  });
});
