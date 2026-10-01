import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RepairList from '../pages/RepairList';
import { periodRange, inPeriod, closedDateOf, periodLabel } from '../utils/repairPeriod';

/**
 * 維修單列表：已結案的單只看一段期間
 *
 * 完工結案的單會一直累積，幾年下來卡片數字與列表只會越來越大。
 * 未結案的一律全部顯示；已結案的預設只看近 3 個月，搜尋時查全部歷史。
 * 「總維修單數」卡片拿掉。
 */
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T10:00:00')); });
afterAll(() => { vi.useRealTimers(); });

const order = (id, no, status, completion, extra = {}) => ({
  id, repair_no: no, customer_name: '元大', status, completion_date: completion,
  created_at: '2025-01-01T00:00:00.000Z', item_count: 1, items: [{ id, sn: `SN-${id}` }], ...extra,
});
const ORDERS = [
  order(1, 'RMA-OPEN-OLD', 'SENT_OEM', null, { created_at: '2024-03-01T00:00:00.000Z' }),
  order(2, 'RMA-DONE-RECENT', 'COMPLETED', '2026-09-20'),
  order(3, 'RMA-DONE-JULY', 'COMPLETED', '2026-07-15'),
  order(4, 'RMA-DONE-2025', 'COMPLETED', '2025-11-03', { item_summary: 'BLACKCORE 3122-SM (BC0099)' }),
];

describe('期間的計算', () => {
  const now = new Date('2026-10-01T10:00:00');
  it('近 3 個月、本月、今年、全部', () => {
    expect(periodRange('3M', {}, now)).toEqual({ from: '2026-07-01', to: '2026-10-01' });
    expect(periodRange('MONTH', {}, now)).toEqual({ from: '2026-10-01', to: '2026-10-01' });
    expect(periodRange('YEAR', {}, now)).toEqual({ from: '2026-01-01', to: '2026-10-01' });
    expect(periodRange('ALL', {}, now)).toEqual({ from: null, to: null });
  });

  it('未結案的不管多舊都算在期間內', () => {
    expect(inPeriod(ORDERS[0], periodRange('MONTH', {}, now))).toBe(true);
  });

  it('結案日看完工出貨日，舊資料沒填就看建立日', () => {
    expect(closedDateOf(ORDERS[1])).toBe('2026-09-20');
    expect(closedDateOf({ status: 'COMPLETED', created_at: '2025-05-05T08:00:00' })).toBe('2025-05-05');
  });

  it('自訂期間的說明文字', () => {
    expect(periodLabel('CUSTOM', { from: '2026-01-01', to: '2026-03-31' })).toBe('2026-01-01 ～ 2026-03-31');
    expect(periodLabel('3M')).toBe('近 3 個月');
  });
});

describe('維修單列表', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn((query) => Promise.resolve({ success: true, rows: query === 'fetchRepairOrders' ? ORDERS : [] })),
      runTransaction: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const open = async () => {
    render(<MemoryRouter><RepairList /></MemoryRouter>);
    await screen.findByText('RMA-OPEN-OLD');
  };

  it('預設只列近 3 個月結案的，未結案的不管多舊都列出', async () => {
    await open();
    expect(screen.getByText('RMA-DONE-RECENT')).toBeInTheDocument();
    expect(screen.getByText('RMA-DONE-JULY')).toBeInTheDocument();
    expect(screen.queryByText('RMA-DONE-2025')).not.toBeInTheDocument();
  });

  it('完工卡片只算期間內的，並標示期間', async () => {
    await open();
    expect(screen.getByTestId('completed-period').textContent).toBe('近 3 個月');
    expect(screen.getByTestId('stat-3').textContent).toBe('2');
  });

  it('沒有累積的總維修單數卡片', async () => {
    await open();
    expect(screen.queryByText('總維修單數')).not.toBeInTheDocument();
  });

  it('講清楚有幾張較早結案的沒列出，並可一鍵顯示全部', async () => {
    await open();
    expect(screen.getByTestId('hidden-closed-hint').textContent).toContain('另有 1 張較早結案的維修單未列出');
    await userEvent.click(screen.getByRole('button', { name: '顯示全部' }));
    expect(await screen.findByText('RMA-DONE-2025')).toBeInTheDocument();
    expect(screen.queryByTestId('hidden-closed-hint')).not.toBeInTheDocument();
  });

  it('切到本月，完工數跟著變', async () => {
    await open();
    await userEvent.selectOptions(screen.getByLabelText('已結案顯示期間'), 'MONTH');
    expect(screen.getByTestId('completed-period').textContent).toBe('本月');
    expect(screen.getByTestId('stat-3').textContent).toBe('0');
    expect(screen.queryByText('RMA-DONE-RECENT')).not.toBeInTheDocument();
    // 未結案的照樣在
    expect(screen.getByText('RMA-OPEN-OLD')).toBeInTheDocument();
  });

  it('自訂起訖日', async () => {
    await open();
    await userEvent.selectOptions(screen.getByLabelText('已結案顯示期間'), 'CUSTOM');
    await userEvent.type(screen.getByLabelText('結案起日'), '2025-11-01');
    await userEvent.type(screen.getByLabelText('結案迄日'), '2025-11-30');
    await waitFor(() => expect(screen.getByText('RMA-DONE-2025')).toBeInTheDocument());
    expect(screen.queryByText('RMA-DONE-RECENT')).not.toBeInTheDocument();
  });

  it('搜尋查全部歷史，不受期間限制', async () => {
    await open();
    await userEvent.type(screen.getByPlaceholderText(/搜尋單號/), 'BC0099');
    expect(await screen.findByText('RMA-DONE-2025')).toBeInTheDocument();
    expect(screen.getByTestId('search-all-history-hint')).toBeInTheDocument();
  });

  it('看未結案的頁籤時不提示較早結案的單', async () => {
    await open();
    await userEvent.click(screen.getByTestId('repair-tab-SENT_OEM'));
    expect(screen.queryByTestId('hidden-closed-hint')).not.toBeInTheDocument();
  });
});
