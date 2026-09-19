import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stocktaking from '../pages/Stocktaking';
import { getBalanceMonths, indexBalances, getBalance } from '../utils/monthlyBalanceView';
import { monthsToGenerate, previousMonth, firstOfMonth, GRACE_DAYS } from '../../server/monthlyBalance';

/**
 * 實體庫存盤點表：近三個月結餘與出貨異動
 *
 * 這張表原本只看得到「此刻」的庫存，沒有任何歷史可以對照。
 * 系統裡沒有異動流水表，耗材的庫存有九條寫入路徑，其中調撥與匯入
 * 不留任何有日期的紀錄，所以過去的結餘推算不回去 ——
 * 只能從現在開始每月記一筆。
 */
const CONSUMABLES = [
  { id: 1, item_master_id: 1, category_name: '耗材', type: '網路線', brand: 'PANDUIT', model: 'CAT6', specification: '3M', stock_qty: 10, lab_qty: 2, has_recent_outbound: true },
  { id: 2, item_master_id: 2, category_name: '耗材', type: '光纖模組', brand: 'METECH', model: 'SFP28', specification: '25G', stock_qty: 4, lab_qty: 0, has_recent_outbound: false },
];

const BALANCES = [
  { item_master_id: 1, month: '2026-09', stock_qty: 12, lab_qty: 3, lent_qty: 0 },
  { item_master_id: 1, month: '2026-08', stock_qty: 20, lab_qty: 0, lent_qty: 0 },
  { item_master_id: 1, month: '2026-07', stock_qty: 25, lab_qty: 0, lent_qty: 0 },
  // 品項 2 只有一個月有紀錄，另外兩個月要顯示破折號
  { item_master_id: 2, month: '2026-09', stock_qty: 4, lab_qty: 0, lent_qty: 0 },
];

describe('盤點表的月結餘欄位', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn((query) => {
        if (query === 'fetchStocktakingConsumables') return Promise.resolve({ success: true, rows: CONSUMABLES });
        if (query === 'fetchRecentMonthlyBalances') return Promise.resolve({ success: true, rows: BALANCES });
        return Promise.resolve({ success: true, rows: [] });
      }),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
      saveFile: vi.fn(),
    };
  });

  const showConsumables = async () => {
    render(<Stocktaking />);
    // 頁籤是 div，不是按鈕，因此以文字點選
    await userEvent.click(screen.getByText('耗材盤點'));
    await screen.findByText('PANDUIT');
  };

  it('每個有紀錄的月份各一欄，由新到舊', async () => {
    await showConsumables();
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);

    expect(headers).toContain('2026-09 結餘');
    expect(headers).toContain('2026-08 結餘');
    expect(headers).toContain('2026-07 結餘');
    expect(headers.indexOf('2026-09 結餘')).toBeLessThan(headers.indexOf('2026-07 結餘'));
  });

  it('耗材的月結餘是庫存與實驗室暫存的總和', async () => {
    await showConsumables();
    const row = screen.getByText('PANDUIT').closest('tr');

    // 2026-09 是 12 + 3
    expect(row).toHaveTextContent('15');
  });

  it('還沒開始記錄的月份顯示破折號，不是 0', async () => {
    await showConsumables();
    const row = screen.getByText('METECH').closest('tr');

    // 顯示 0 會被讀成「當時庫存是零」
    expect(row.textContent).toContain('—');
  });

  it('近期有出貨的品項標示出來', async () => {
    await showConsumables();
    // 頁面說明裡也有「近期異動」這四個字，只看表格內的標記
    const tags = [...document.querySelectorAll('.st-recent-tag')];
    expect(tags).toHaveLength(1);
    expect(tags[0].closest('tr')).toHaveTextContent('PANDUIT');
  });

  it('可以只看近三個月有出貨異動的品項', async () => {
    await showConsumables();
    expect(screen.getByText('METECH')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/只看近三個月有出貨異動/));

    await waitFor(() => expect(screen.queryByText('METECH')).not.toBeInTheDocument());
    expect(screen.getByText('PANDUIT')).toBeInTheDocument();
  });

  it('實盤總數與盤點備註仍然是留白供手寫，畫面上不能輸入', async () => {
    await showConsumables();
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toContain('實盤總數');
    expect(headers).toContain('盤點備註');

    // 整張表除了篩選的勾選框之外沒有任何輸入欄位
    const row = screen.getByText('PANDUIT').closest('tr');
    expect(row.querySelectorAll('input, textarea')).toHaveLength(0);
  });

  it('頁面說明講清楚這兩欄不會儲存', async () => {
    await showConsumables();
    expect(screen.getByText('實體庫存盤點表說明')).toBeInTheDocument();
    expect(screen.getByText(/刻意留白，供列印後手寫/)).toBeInTheDocument();
  });
});

describe('月結餘的整理', () => {
  it('取最近三個月，由新到舊', () => {
    expect(getBalanceMonths(BALANCES)).toEqual(['2026-09', '2026-08', '2026-07']);
  });

  it('超過三個月只取最近三個', () => {
    const many = ['2026-09', '2026-08', '2026-07', '2026-06'].map((month) => ({ month, item_master_id: 1 }));
    expect(getBalanceMonths(many)).toEqual(['2026-09', '2026-08', '2026-07']);
  });

  it('沒有資料時回空陣列，不會爆掉', () => {
    expect(getBalanceMonths(undefined)).toEqual([]);
    expect(indexBalances(undefined)).toEqual({});
  });

  it('庫存與實驗室暫存相加為該月總持有量', () => {
    const map = indexBalances(BALANCES);
    expect(map[1]['2026-09']).toBe(15);
    expect(map[1]['2026-08']).toBe(20);
  });

  it('查無該月時回 null 而非 0', () => {
    const map = indexBalances(BALANCES);
    expect(getBalance(map, 2, '2026-08')).toBeNull();
    expect(getBalance(map, 999, '2026-09')).toBeNull();
    expect(getBalance(map, 2, '2026-09')).toBe(4);
  });
});

describe('該記哪一個月', () => {
  it('記的是上個月，跨年也對', () => {
    expect(previousMonth(new Date('2026-10-05'))).toBe('2026-09-01');
    expect(previousMonth(new Date('2026-01-15'))).toBe('2025-12-01');
    expect(firstOfMonth(new Date('2026-03-31'))).toBe('2026-03-01');
  });

  it('月初幾天內才補記', () => {
    expect(monthsToGenerate(null, new Date('2026-10-01'))).toEqual(['2026-09-01']);
    expect(monthsToGenerate(null, new Date(`2026-10-0${GRACE_DAYS}`))).toEqual(['2026-09-01']);
  });

  it('月中才安裝就不記 —— 上個月沒在看，寫今天的庫存是捏造', () => {
    expect(monthsToGenerate(null, new Date('2026-10-19'))).toEqual([]);
  });

  it('已經記過上個月就不再記一次', () => {
    expect(monthsToGenerate('2026-09-01', new Date('2026-10-03'))).toEqual([]);
  });

  it('中間漏掉的月份不回頭補 —— 那些數字無從得知', () => {
    // 6 月之後就沒記，現在是 10 月初：只記 9 月，7、8 月放棄
    expect(monthsToGenerate('2026-06-01', new Date('2026-10-02'))).toEqual(['2026-09-01']);
  });

  it('當月還沒過完不會先記', () => {
    expect(monthsToGenerate('2026-08-01', new Date('2026-09-20'))).toEqual([]);
  });
});
