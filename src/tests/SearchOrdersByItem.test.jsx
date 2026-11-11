import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import DNList from '../pages/DNList';
import { renderInboundHistory } from './helpers/renderInboundList';
import { matchingItems, summarizeItems } from '../utils/itemSearch';
import { queries } from '../../database/queries';

/**
 * 出貨單／進貨單：用品項（類型／廠牌／型號，也可以打規格、序號）搜尋，列出單號
 *
 * 原本搜尋列只比對單號、客戶／供應商、發票號碼，要找「哪幾張單出過某個型號」
 * 只能一張一張打開明細看。列表查詢改成帶出明細（item_lines），搜尋時一併比對，
 * 並在那一列標出是哪些品項符合。
 */
const DELL_SERVER = { type: 'SERVER', brand: 'DELL', model: 'R660XS', spec: '16C', sn: 'DELL-001', qty: 1 };
const DELL_SWITCH = { type: 'SWITCH', brand: 'DELL', model: 'S5248', spec: '', sn: 'SW-001', qty: 1 };
const ARISTA = { type: 'SWITCH', brand: 'ARISTA', model: 'DCS-7130', spec: '', sn: 'AR-001', qty: 1 };
const CABLE = { type: 'DAC CABLE', brand: 'METECH', model: 'DAC-40G-SR 3M', spec: '', sn: '', qty: 6 };

describe('matchingItems', () => {
  const LINES = [DELL_SERVER, DELL_SWITCH, ARISTA, CABLE];

  it('類型、廠牌、型號、規格、序號都比對，不分大小寫', () => {
    expect(matchingItems(LINES, 'dell')).toEqual([DELL_SERVER, DELL_SWITCH]);
    expect(matchingItems(LINES, 'switch')).toEqual([DELL_SWITCH, ARISTA]);
    expect(matchingItems(LINES, 'r660')).toEqual([DELL_SERVER]);
    expect(matchingItems(LINES, '16c')).toEqual([DELL_SERVER]);
    expect(matchingItems(LINES, 'AR-001')).toEqual([ARISTA]);
  });

  it('多個關鍵字要落在同一列明細上', () => {
    expect(matchingItems(LINES, 'DELL SWITCH')).toEqual([DELL_SWITCH]);
    // DELL 與 DCS-7130 分屬兩列，不算符合
    expect(matchingItems(LINES, 'DELL DCS-7130')).toEqual([]);
    expect(matchingItems(LINES, 'dac cable')).toEqual([CABLE]);
  });

  it('沒打關鍵字、沒有明細：沒有符合', () => {
    expect(matchingItems(LINES, '  ')).toEqual([]);
    expect(matchingItems(null, 'DELL')).toEqual([]);
  });

  it('同款合併、數量加總', () => {
    expect(summarizeItems([DELL_SERVER, { ...DELL_SERVER, sn: 'DELL-002' }, CABLE])).toEqual([
      { label: 'SERVER DELL R660XS', qty: 2 },
      { label: 'DAC CABLE METECH DAC-40G-SR 3M', qty: 6 },
    ]);
  });

  it('列表查詢帶出明細', () => {
    expect(queries.fetchDNList).toContain('AS item_lines');
    expect(queries.fetchDNList).toContain('FROM outbound_items x');
    expect(queries.fetchInboundList).toContain('AS item_lines');
    expect(queries.fetchInboundList).toContain('FROM inbound_items x');
  });
});

const PAGE_LOAD = { timeout: 5000 };
const mockList = (query, rows) => {
  window.electronAPI = {
    namedQuery: vi.fn(async (q) => (q === query ? { success: true, rows } : { success: true, rows: [] })),
    runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
};
const search = (text, field) => {
  if (field) fireEvent.change(screen.getAllByRole('combobox').find((s) => [...s.options].some((o) => o.value === field)), { target: { value: field } });
  fireEvent.change(screen.getByPlaceholderText(/^搜尋/), { target: { value: text } });
};

beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
});

describe('出貨單列表', () => {
  const DNS = [
    { id: 1, request_no: 'DN-20261001-01', customer: '凱基', status: 'SHIPPED', shipping_date: '2026-10-01', created_at: '2026-10-01T02:00:00Z', item_count: 2, item_lines: [DELL_SERVER, CABLE] },
    { id: 2, request_no: 'DN-20261002-01', customer: '元大', status: 'SHIPPED', shipping_date: '2026-10-02', created_at: '2026-10-02T02:00:00Z', item_count: 1, item_lines: [ARISTA] },
  ];
  const open = async () => {
    mockList('fetchDNList', DNS);
    render(<BrowserRouter><DNList /></BrowserRouter>);
    fireEvent.click(await screen.findByTestId('dn-tab-history', {}, PAGE_LOAD));
    await screen.findByText('DN-20261001-01', {}, PAGE_LOAD);
  };

  it('搜尋列可以選「品項」，打型號列出有出過的單號，並標出符合的品項', async () => {
    await open();
    search('R660XS', 'items');
    await waitFor(() => expect(screen.queryByText('DN-20261002-01')).toBeNull());
    expect(screen.getByText('DN-20261001-01')).toBeInTheDocument();
    expect(screen.getByTestId('dn-matched-items-1')).toHaveTextContent('符合：SERVER DELL R660XS ×1');
  });

  it('「全部欄位」也會比對品項', async () => {
    await open();
    search('arista');
    await waitFor(() => expect(screen.queryByText('DN-20261001-01')).toBeNull());
    expect(screen.getByTestId('dn-matched-items-2')).toHaveTextContent('ARISTA DCS-7130');
  });

  it('打客戶名稱時不顯示品項提示', async () => {
    await open();
    search('凱基');
    await waitFor(() => expect(screen.queryByText('DN-20261002-01')).toBeNull());
    expect(screen.queryByTestId('dn-matched-items-1')).toBeNull();
  });
});

describe('進貨單列表', () => {
  const ORDERS = [
    { id: 11, order_no: 'IN-20261106-01', status: 'COMPLETED', created_at: '2026-11-06T02:00:00Z', effective_date: '2026-11-06', partner_name: 'TRAVLA', item_count: 1, attachments: '[]',
      item_lines: [{ type: 'SERVER CASE', brand: 'TRAVLA', model: 'T7445 2U CASE', spec: '', sn: '', qty: 25 }] },
    { id: 12, order_no: 'IN-20261107-01', status: 'COMPLETED', created_at: '2026-11-07T02:00:00Z', effective_date: '2026-11-07', partner_name: 'DELL', item_count: 1, attachments: '[]',
      item_lines: [DELL_SERVER] },
  ];

  it('打類型＋型號列出進過貨的單號，並標出數量', async () => {
    mockList('fetchInboundList', ORDERS);
    renderInboundHistory();
    await screen.findByText('IN-20261106-01', {}, PAGE_LOAD);
    search('server case t7445', 'items');
    await waitFor(() => expect(screen.queryByText('IN-20261107-01')).toBeNull());
    expect(screen.getByTestId('inbound-matched-items-11')).toHaveTextContent('符合：SERVER CASE TRAVLA T7445 2U CASE ×25');
  });
});
