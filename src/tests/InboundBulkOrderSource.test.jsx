import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InboundList from '../pages/InboundList';
import { queries } from '../../database/queries';

/**
 * 在進貨明細單上統一填寫訂單來源
 *
 * 訂單來源存在資產上。進貨入庫先前沒有這一欄，那批貨全都沒有值，
 * 而要補的話得到硬體列表一筆一筆改 —— 八十筆不切實際。
 */
const ORDERS = [{
  id: 11, order_no: 'IN-20260921-01', order_date: '2026-09-21', effective_date: '2026-09-21',
  created_at: '2026-09-21T10:00:00.000Z', partner_id: null, partner_name: null,
  invoice_no: null, attachments: '[]', item_count: 3, creator_name: 'Rio',
}];

const ITEMS = [
  { id: 1, sn: 'SFOC303000D7', quantity: 1, brand: 'CISCO', model: 'X25', category_name: '硬體', po_order_no: null, order_source: null },
  { id: 2, sn: 'SFOC303000CB', quantity: 1, brand: 'CISCO', model: 'X25', category_name: '硬體', po_order_no: null, order_source: 'PO-舊' },
  { id: 3, sn: null, quantity: 5, brand: 'CISCO', model: 'CABLE', category_name: '耗材', po_order_no: null, order_source: null },
];

describe('進貨明細：統一填寫訂單來源', () => {
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
      if (query === 'fetchInboundItems') return Promise.resolve({ success: true, rows: ITEMS });
      if (query === 'fetchSuppliers') return Promise.resolve({ success: true, rows: [] });
      if (query === 'updateOrderSourceByInboundOrder') {
        return Promise.resolve({ success: true, rows: [{ id: 1 }] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
    window.electronAPI = {
      namedQuery, runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const saved = () => calls.filter((c) => c.query === 'updateOrderSourceByInboundOrder');

  const openDetail = async () => {
    render(<MemoryRouter><InboundList /></MemoryRouter>);
    await userEvent.click(await screen.findByLabelText('查看進貨明細'));
    await screen.findByText('SFOC303000D7');
  };

  it('明細列出每一筆的訂單來源', async () => {
    await openDetail();
    expect(screen.getByRole('columnheader', { name: '訂單來源' })).toBeInTheDocument();
    expect(screen.getByText('PO-舊')).toBeInTheDocument();
  });

  it('還沒填的標示「未填」，沒有序號的那一列不標', async () => {
    await openDetail();

    // 三筆裡只有第一筆「有序號且沒填」符合；沒有序號的那一筆對不到資產，
    // 本來就不會有訂單來源，標成「未填」會誤導
    expect(screen.getAllByText('未填')).toHaveLength(1);
    expect(screen.getByText('未填').closest('tr')).toHaveTextContent('SFOC303000D7');
  });

  it('顯示已填幾筆 / 共幾筆', async () => {
    await openDetail();
    // 兩筆有序號，其中一筆已填
    expect(screen.getByText(/已填 1 \/ 2/)).toBeInTheDocument();
  });

  it('一次填寫整張單，預設不覆蓋已有的值', async () => {
    await openDetail();
    await userEvent.type(screen.getByLabelText('統一填寫訂單來源'), 'PO-2026-001');
    await userEvent.click(screen.getByRole('button', { name: '統一填寫' }));

    await waitFor(() => expect(saved()).toHaveLength(1));
    // [進貨單 id, 訂單來源, 是否覆蓋]
    expect(saved()[0].params).toEqual([11, 'PO-2026-001', false]);
  });

  it('沒輸入內容時按鈕停用', async () => {
    await openDetail();
    expect(screen.getByRole('button', { name: '統一填寫' })).toBeDisabled();
  });

  it('填寫後重新讀取明細', async () => {
    await openDetail();
    await userEvent.type(screen.getByLabelText('統一填寫訂單來源'), 'PO-2026-001');
    await userEvent.click(screen.getByRole('button', { name: '統一填寫' }));

    await waitFor(() =>
      expect(calls.filter((c) => c.query === 'fetchInboundItems')).toHaveLength(2));
  });

  it('取消確認就不送出', async () => {
    window.confirm.mockImplementation(() => false);
    await openDetail();
    await userEvent.type(screen.getByLabelText('統一填寫訂單來源'), 'PO-2026-001');
    await userEvent.click(screen.getByRole('button', { name: '統一填寫' }));

    expect(saved()).toHaveLength(0);
  });
});

describe('整批填寫的查詢', () => {
  const sql = queries.updateOrderSourceByInboundOrder;

  it('限定單一進貨單', () => {
    expect(sql).toContain('ii.inbound_order_id = $1');
  });

  it('預設只補空的，第三個參數為 true 才覆蓋', () => {
    expect(sql).toContain("($3::boolean OR COALESCE(a.custom_attributes->>'order_source', '') = '')");
  });

  it('以序號比對，忽略大小寫與前後空白', () => {
    expect(sql).toContain('UPPER(TRIM(a.sn)) = UPPER(TRIM(ii.sn))');
  });

  it('合併而不是取代 custom_attributes，其他屬性要保留', () => {
    expect(sql).toContain("COALESCE(a.custom_attributes, '{}'::jsonb)");
    expect(sql).toContain('||');
  });

  it('回傳資料列，呼叫端才知道改了幾筆', () => {
    expect(sql).toContain('RETURNING');
  });
});
