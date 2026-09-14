import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LentList from '../pages/LentList';

/**
 * 撤銷借出：把「借出中」退回「待借出」以便修改
 *
 * 與「歸還」的差別在帳上很重要：歸還代表對方真的把東西還回來了，
 * 單據結案並留下歸還日期；撤銷代表這次借出根本沒發生，
 * 不該留下一筆從未發生過的借還紀錄。
 */
describe('借用單：撤銷借出', () => {
  const CONSUMABLE = {
    item_id: 10, brand: 'PANDUIT', model: 'CAT6A', quantity: 8,
    category_name: '耗材', specification: '', sn: null,
  };
  const DEVICE = {
    item_id: 20, brand: 'DELL', model: 'R750', quantity: 1,
    category_name: '設備', sn: 'SN-REVERT-1',
  };

  const record = (status) => ({
    id: 1, request_no: 'DN-20260914-01', customer: '台積電', location: '新竹',
    shipping_date: '2026-09-14', expected_return_date: '2026-09-21',
    status, request_type: 'LEND', creator_name: 'Admin',
    signed_doc_url: null, signed_doc_name: null,
  });

  let calls;

  const setup = (items) => {
    calls = [];
    window.alert = vi.fn();
    window.confirm = vi.fn().mockReturnValue(true);
    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchLentRequests') return Promise.resolve({ success: true, rows: [record('SHIPPED')] });
      if (query === 'fetchDNItems') return Promise.resolve({ success: true, rows: items });
      if (query.startsWith('updateStockQty')) return Promise.resolve({ success: true, rows: [{ id: 10 }] });
      return Promise.resolve({ success: true, rows: [], rowCount: 1 });
    });
  };

  const called = (name) => calls.filter((c) => c.query === name);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const openAndConfirm = async () => {
    render(<LentList />);
    await waitFor(() => expect(screen.getByText('DN-20260914-01')).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText('撤銷借出'));
    await userEvent.click(await screen.findByText('確定撤銷'));
  };

  it('耗材的數量會加回庫存', async () => {
    setup([CONSUMABLE]);
    await openAndConfirm();

    await waitFor(() => expect(called('updateStockQtyOnLendReturn')).toHaveLength(1));
    expect(called('updateStockQtyOnLendReturn')[0].params).toEqual([8, 10]);
  });

  it('設備的狀態恢復為在庫並清空位置', async () => {
    setup([DEVICE]);
    await openAndConfirm();

    await waitFor(() => expect(called('updateAssetStatusAndLocationBySn')).toHaveLength(1));
    expect(called('updateAssetStatusAndLocationBySn')[0].params).toEqual(['ACTIVE', '', 'SN-REVERT-1']);
  });

  it('單據退回待借出，而不是標記為已歸還', async () => {
    setup([CONSUMABLE, DEVICE]);
    await openAndConfirm();

    await waitFor(() => expect(called('updateOutboundRequestStatus')).toHaveLength(1));
    expect(called('updateOutboundRequestStatus')[0].params).toEqual(['PENDING', 1]);
    // 撤銷不該留下歸還紀錄，否則履歷上會多出一次從未發生的借還
    expect(called('updateOutboundRequestReturned')).toHaveLength(0);
  });

  it('確認視窗要說明這不是歸還，避免用錯', async () => {
    setup([CONSUMABLE]);
    render(<LentList />);
    await waitFor(() => expect(screen.getByText('DN-20260914-01')).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText('撤銷借出'));

    expect(await screen.findByText(/這不是「歸還」/)).toBeInTheDocument();
    expect(screen.getByText(/請改用「歸還入庫」/)).toBeInTheDocument();
  });

  it('取消就什麼都不會動', async () => {
    setup([CONSUMABLE]);
    render(<LentList />);
    await waitFor(() => expect(screen.getByText('DN-20260914-01')).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText('撤銷借出'));
    await userEvent.click(await screen.findByText('取消'));

    expect(called('updateOutboundRequestStatus')).toHaveLength(0);
    expect(called('updateStockQtyOnLendReturn')).toHaveLength(0);
  });
});
