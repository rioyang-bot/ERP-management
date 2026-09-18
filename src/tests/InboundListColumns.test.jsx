import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InboundList from '../pages/InboundList';
import { queries } from '../../database/queries';

/**
 * 進貨單列表的項目數與建立者
 *
 * 出貨單、借用單、維修單的列表都有這兩欄，進貨單沒有 ——
 * 入庫資料有疑問時，既看不出這張單收了幾項，也查不出是誰經手的。
 * 建立者需要 inbound_orders.creator_id（見 migration_inbound_creator.sql）；
 * 既有單據沒有可回填的來源，因此舊單顯示為「－」。
 */
const ORDERS = [
  {
    id: 11, order_no: 'IN-20260715-01', order_date: '2026-07-15', effective_date: '2026-07-15',
    created_at: '2026-09-18T10:30:00.000Z', partner_id: 7, partner_name: '元大Yuanta',
    invoice_no: 'INV-001', attachments: '[]', item_count: 3, creator_name: 'Rio',
  },
  {
    id: 12, order_no: 'IN-20260601-01', order_date: '2026-06-01', effective_date: '2026-06-01',
    created_at: '2026-06-01T02:00:00.000Z', partner_id: null, partner_name: null,
    invoice_no: null, attachments: '[]', item_count: 0, creator_name: null,
  },
];

describe('進貨單列表：項目數與建立者', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn((query) => {
        if (query === 'fetchInboundList') return Promise.resolve({ success: true, rows: ORDERS });
        if (query === 'fetchSuppliers') return Promise.resolve({ success: true, rows: [] });
        return Promise.resolve({ success: true, rows: [] });
      }),
      runTransaction: vi.fn(),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const renderList = () => render(<MemoryRouter><InboundList /></MemoryRouter>);

  it('列表有項目數與建立者兩欄', async () => {
    renderList();
    await screen.findByText('IN-20260715-01');

    expect(screen.getByRole('columnheader', { name: '項目數' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '建立者' })).toBeInTheDocument();
  });

  it('顯示該單的項目數與建立者', async () => {
    renderList();
    const row = (await screen.findByText('IN-20260715-01')).closest('tr');

    expect(row).toHaveTextContent('3');
    expect(row).toHaveTextContent('Rio');
  });

  it('沒有記錄建立者的舊單顯示為 －，不會是空白或 undefined', async () => {
    renderList();
    const row = (await screen.findByText('IN-20260601-01')).closest('tr');

    expect(row).toHaveTextContent('－');
    expect(row).not.toHaveTextContent('undefined');
  });

  it('項目數為 0 時顯示 0，不是空白', async () => {
    renderList();
    const row = (await screen.findByText('IN-20260601-01')).closest('tr');
    const cells = [...row.querySelectorAll('td')].map((td) => td.textContent.trim());

    // 發票欄的 '--' 之後就是項目數
    expect(cells).toContain('0');
  });
});

describe('進貨單列表查詢', () => {
  const sql = queries.fetchInboundList;

  it('算出該單的品項筆數', () => {
    expect(sql).toMatch(/SELECT COUNT\(\*\) FROM inbound_items ii WHERE ii\.inbound_order_id = io\.id\) as item_count/);
  });

  it('以 creator_id 取出建立者姓名', () => {
    expect(sql).toContain('u.full_name as creator_name');
    expect(sql).toContain('LEFT JOIN users u ON io.creator_id = u.id');
  });

  it('用 LEFT JOIN，沒有建立者的舊單不會從列表消失', () => {
    expect(sql).not.toMatch(/\bINNER JOIN users\b/);
    expect(sql).not.toMatch(/\n\s*JOIN users\b/);
  });

  it('建單時寫入建立者', () => {
    expect(queries.insertInboundOrder).toContain('creator_id');
  });
});
