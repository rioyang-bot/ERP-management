import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LentList from '../pages/LentList';

/**
 * 耗材借用的庫存異動
 *
 * 在此之前，耗材借出只是把庫存扣掉，歸還時完全沒有處理耗材，
 * 導致單子標記為已歸還、庫存卻永遠短少那些數量。
 */
describe('借用單：耗材的庫存異動', () => {
  const CONSUMABLE = {
    item_id: 10,
    brand: 'PANDUIT',
    model: 'CAT6A 3M BLUE',
    quantity: 8,
    category_name: '耗材',
    specification: '',
    sn: null,
  };

  const DEVICE = {
    item_id: 20,
    brand: 'SUPERMICRO',
    model: 'SYS-1029P-WTR',
    quantity: 1,
    category_name: '設備',
    sn: 'SN123456',
  };

  const lentRecord = (status) => ({
    id: 1,
    request_no: 'DN-20260913-01',
    customer: '台積電',
    location: '新竹',
    shipping_date: '2026-09-13',
    expected_return_date: '2026-09-20',
    status,
    request_type: 'LEND',
    creator_name: 'Admin',
    signed_doc_url: null,
    signed_doc_name: null,
  });

  let calls;

  const setup = ({ status, items }) => {
    calls = [];
    window.alert = vi.fn();
    window.confirm = vi.fn().mockReturnValue(true);

    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchLentRequests') return Promise.resolve({ success: true, rows: [lentRecord(status)] });
      if (query === 'fetchDNItems') return Promise.resolve({ success: true, rows: items });
      if (query === 'checkItemStock') return Promise.resolve({ success: true, rows: [{ stock_qty: 25 }] });
      if (query === 'checkAssetActive') return Promise.resolve({ success: true, rows: [{ status: 'ACTIVE' }] });
      // 庫存異動類查詢帶有 RETURNING id，成功時會回一列
      if (query.startsWith('updateStockQty')) return Promise.resolve({ success: true, rows: [{ id: 10 }] });
      return Promise.resolve({ success: true, rows: [] });
    });
  };

  const called = (name) => calls.filter((c) => c.query === name);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('確認借出時扣庫存並記為借出中，用的不是一般出貨的扣庫存', async () => {
    setup({ status: 'PENDING', items: [CONSUMABLE] });
    render(<LentList />);

    await waitFor(() => expect(screen.getByText('DN-20260913-01')).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText('確認借出'));

    await waitFor(() => expect(called('updateStockQtyOnLendOut')).toHaveLength(1));
    expect(called('updateStockQtyOnLendOut')[0].params).toEqual([8, 10]);
    // 一般出貨的扣庫存不會記錄借出中，借用流程不該用它
    expect(called('updateStockQtyOnOutbound')).toHaveLength(0);
  });

  it('登記歸還時把耗材數量加回庫存', async () => {
    setup({ status: 'SHIPPED', items: [CONSUMABLE] });
    render(<LentList />);

    await waitFor(() => expect(screen.getByText('DN-20260913-01')).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText('歸還入庫'));
    await userEvent.click(await screen.findByText('確定歸還'));

    await waitFor(() => expect(called('updateStockQtyOnLendReturn')).toHaveLength(1));
    expect(called('updateStockQtyOnLendReturn')[0].params).toEqual([8, 10]);
  });

  it('歸還同時含耗材與設備時，兩者都要處理', async () => {
    setup({ status: 'SHIPPED', items: [CONSUMABLE, DEVICE] });
    render(<LentList />);

    await waitFor(() => expect(screen.getByText('DN-20260913-01')).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText('歸還入庫'));
    await userEvent.click(await screen.findByText('確定歸還'));

    await waitFor(() => expect(called('updateStockQtyOnLendReturn')).toHaveLength(1));
    const assetCalls = called('updateAssetStatusAndLocationBySn');
    expect(assetCalls).toHaveLength(1);
    expect(assetCalls[0].params).toEqual(['ACTIVE', '', 'SN123456']);
  });

  it('庫存被擋下時視為失敗，不會把單子標記成已借出', async () => {
    setup({ status: 'PENDING', items: [CONSUMABLE] });
    // 模擬 stock_qty >= $1 的條件擋下更新：success 仍為 true，但沒有異動到任何一列
    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchLentRequests') return Promise.resolve({ success: true, rows: [lentRecord('PENDING')] });
      if (query === 'fetchDNItems') return Promise.resolve({ success: true, rows: [CONSUMABLE] });
      if (query === 'checkItemStock') return Promise.resolve({ success: true, rows: [{ stock_qty: 25 }] });
      if (query === 'updateStockQtyOnLendOut') return Promise.resolve({ success: true, rows: [] });
      return Promise.resolve({ success: true, rows: [] });
    });

    render(<LentList />);
    await waitFor(() => expect(screen.getByText('DN-20260913-01')).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText('確認借出'));

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(called('updateOutboundRequestStatus')).toHaveLength(0);
  });
});
