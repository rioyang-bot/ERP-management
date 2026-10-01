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
 * 未結案的三種帶數量徽章。期間與搜尋放在頁籤下方那一列。
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
  it('五個頁籤依序排在卡片頂端', async () => {
    await open();
    const strip = screen.getByTestId('repair-tabs');
    expect(strip.parentElement.className).toBe('card-surface');
    expect(strip.parentElement.firstElementChild).toBe(strip);
    expect([...strip.children].map((b) => b.textContent.replace(/\d+$/, '').trim()))
      .toEqual(['全部維修單', '現場處理', '送修原廠', '原廠返還', '完工結案']);
  });

  it('與借用列表同樣式：圖示、底線、字級', async () => {
    await open();
    for (const b of within(screen.getByTestId('repair-tabs')).getAllByRole('button')) {
      expect(b.querySelector('svg')).not.toBeNull();
      expect(b.style.padding).toBe('10px 18px');
      expect(b.style.fontSize).toBe('0.9rem');
      expect(b.style.borderRadius).toBe('');
    }
    // 預設選「全部」：底線加粗
    expect(tab('ALL').style.borderBottom).toBe('3px solid rgb(59, 130, 246)');
    expect(tab('SENT_OEM').style.borderBottom).toBe('3px solid transparent');
  });

  it('點選後底線換成該狀態的顏色', async () => {
    await open();
    fireEvent.click(tab('SENT_OEM'));
    expect(tab('SENT_OEM').getAttribute('aria-pressed')).toBe('true');
    expect(tab('SENT_OEM').style.borderBottom).toBe('3px solid rgb(217, 119, 6)');
    expect(tab('ALL').style.borderBottom).toBe('3px solid transparent');
    expect(screen.queryByText('RMA-1')).not.toBeInTheDocument();
  });

  it('未結案的頁籤帶數量徽章，沒有的不顯示；全部與完工不帶', async () => {
    await open();
    expect(tab('ON_SITE_HANDLING')).toHaveTextContent('現場處理1');
    expect(tab('SENT_OEM')).toHaveTextContent('送修原廠2');
    expect(tab('OEM_RETURNED').textContent.trim()).toBe('原廠返還');
    expect(tab('ALL').textContent.trim()).toBe('全部維修單');
    expect(tab('COMPLETED').textContent.trim()).toBe('完工結案');
  });

  it('期間與搜尋放在頁籤下方，不跟頁籤擠在同一列', async () => {
    await open();
    const strip = screen.getByTestId('repair-tabs');
    expect(strip.contains(screen.getByLabelText('已結案顯示期間'))).toBe(false);
    expect(strip.nextElementSibling.contains(screen.getByPlaceholderText(/搜尋單號/))).toBe(true);
  });
});
