import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RepairList from '../pages/RepairList';

/**
 * 維修單列表的頁籤比照借用列表
 *
 * 原本是搜尋列裡的一排小膠囊按鈕，與借用列表、出貨單列表的頁籤長得不一樣。
 * 改成貼在卡片頂端的一整排頁籤：圖示＋名稱，選取的底線加粗、背景變亮，
 * 未結案的三種帶數量徽章。
 *
 * 「全部維修單」頁籤拿掉（總數卡片先前就拿掉了），預設停在「現場處理」；
 * 期間與搜尋放在頁籤列的右側，不另佔一列。要跨狀態找單直接搜尋。
 */
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T10:00:00')); });
afterAll(() => { vi.useRealTimers(); });

const order = (id, status) => ({
  id, repair_no: `RMA-${id}`, customer_name: '元大', status, completion_date: status === 'COMPLETED' ? '2026-09-20' : null,
  created_at: '2026-09-01T00:00:00.000Z', item_count: 1, items: [{ id, sn: `SN-${id}` }],
});
const ORDERS = [order(1, 'ON_SITE_HANDLING'), order(2, 'SENT_OEM'), order(3, 'SENT_OEM'), order(4, 'COMPLETED')];

beforeEach(() => {
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
  await screen.findByText('RMA-1');
};
const tab = (key) => screen.getByTestId(`repair-tab-${key}`);

describe('維修單列表的頁籤', () => {
  it('四個頁籤依序排在卡片頂端，沒有「全部維修單」', async () => {
    await open();
    const bar = screen.getByTestId('repair-tab-bar');
    expect(bar.parentElement.className).toBe('card-surface');
    expect(bar.parentElement.children).toHaveLength(1);
    const strip = screen.getByTestId('repair-tabs');
    expect([...strip.children].map((b) => b.textContent.replace(/\d+$/, '').trim()))
      .toEqual(['現場處理', '送修原廠', '原廠返還', '完工結案']);
    expect(screen.queryByText('全部維修單')).not.toBeInTheDocument();
  });

  it('預設停在現場處理', async () => {
    await open();
    expect(tab('ON_SITE_HANDLING').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('RMA-1')).toBeInTheDocument();
    expect(screen.queryByText('RMA-2')).not.toBeInTheDocument();
  });

  it('與借用列表同樣式：圖示、底線、字級', async () => {
    await open();
    for (const b of within(screen.getByTestId('repair-tabs')).getAllByRole('button')) {
      expect(b.querySelector('svg')).not.toBeNull();
      expect(b.style.padding).toBe('10px 18px');
      expect(b.style.fontSize).toBe('0.9rem');
      expect(b.style.borderRadius).toBe('');
    }
    // 選取的那一個底線加粗，用該狀態的顏色
    expect(tab('ON_SITE_HANDLING').style.borderBottom).toBe('3px solid rgb(16, 185, 129)');
    expect(tab('SENT_OEM').style.borderBottom).toBe('3px solid transparent');
  });

  it('點選後底線換成該狀態的顏色', async () => {
    await open();
    fireEvent.click(tab('SENT_OEM'));
    expect(tab('SENT_OEM').getAttribute('aria-pressed')).toBe('true');
    expect(tab('SENT_OEM').style.borderBottom).toBe('3px solid rgb(217, 119, 6)');
    expect(tab('ON_SITE_HANDLING').style.borderBottom).toBe('3px solid transparent');
    expect(screen.queryByText('RMA-1')).not.toBeInTheDocument();
    expect(screen.getByText('RMA-2')).toBeInTheDocument();
  });

  it('未結案的頁籤帶數量徽章，沒有的不顯示；完工不帶', async () => {
    await open();
    expect(tab('ON_SITE_HANDLING')).toHaveTextContent('現場處理1');
    expect(tab('SENT_OEM')).toHaveTextContent('送修原廠2');
    expect(tab('OEM_RETURNED').textContent.trim()).toBe('原廠返還');
    expect(tab('COMPLETED').textContent.trim()).toBe('完工結案');
  });

  it('期間與搜尋放在頁籤列右側，不另佔一列', async () => {
    await open();
    const bar = screen.getByTestId('repair-tab-bar');
    const toolbar = screen.getByTestId('repair-toolbar');
    expect(bar.lastElementChild).toBe(toolbar);
    expect(toolbar.style.marginLeft).toBe('auto');
    expect(toolbar.contains(screen.getByLabelText('已結案顯示期間'))).toBe(true);
    expect(toolbar.contains(screen.getByPlaceholderText(/搜尋單號/))).toBe(true);
    expect(screen.getByTestId('repair-tabs').contains(toolbar)).toBe(false);
  });
});
