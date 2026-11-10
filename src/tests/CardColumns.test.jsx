import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ConsumableList from '../pages/ConsumableList';
import { RoleContext } from '../context/RoleContext';
import { cardColumnsFor, useCardColumns } from '../utils/useCardColumns';

/**
 * 卡片區一列放幾張：依卡片區寬度決定（2～6 張）
 *
 * 筆電 1920×1200、縮放 150% 時畫面只有 1280 寬，扣掉左側選單後卡片區約 950，
 * 原本固定 6 張就擠不下、要左右捲動。每張至少 190 寬，放得下幾張排幾張。
 */
describe('一列幾張', () => {
  it('依寬度計算，最少 2 張、最多 6 張', () => {
    // 筆電 150%：卡片區內容約 918 寬
    expect(cardColumnsFor(918)).toBe(4);
    // 一般 1920 寬、100%：放得下 8 張也只排 6 張
    expect(cardColumnsFor(1600)).toBe(6);
    expect(cardColumnsFor(1006)).toBe(5);
    // 分割畫面很窄時至少 2 張
    expect(cardColumnsFor(300)).toBe(2);
    // 量不到寬度時維持 6 張
    expect(cardColumnsFor(0)).toBe(6);
  });
});

/** 假的 ResizeObserver：記下要通知誰，測試裡手動觸發 */
let observers;
class FakeResizeObserver {
  constructor(cb) { this.cb = cb; observers.push(this); }
  observe(el) { this.el = el; }
  disconnect() { this.disconnected = true; }
}
const resize = (el, width) => {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
  act(() => observers.filter((o) => o.el === el && !o.disconnected).forEach((o) => o.cb([])));
};

beforeEach(() => {
  observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('useCardColumns', () => {
  const Probe = () => {
    const [ref, cols] = useCardColumns();
    return <div ref={ref} data-testid="grid" style={{ padding: '16px' }}>{cols}</div>;
  };

  it('卡片區寬度變了就重算（扣掉左右內距）', () => {
    render(<Probe />);
    const grid = screen.getByTestId('grid');
    resize(grid, 950); // 內容 918
    expect(grid).toHaveTextContent('4');
    resize(grid, 1700);
    expect(grid).toHaveTextContent('6');
    resize(grid, 500);
    expect(grid).toHaveTextContent('2');
  });

  it('卸載時停止監聽', () => {
    const { unmount } = render(<Probe />);
    unmount();
    expect(observers.every((o) => o.disconnected)).toBe(true);
  });
});

describe('耗材列表：卡片區照寬度排', () => {
  const ITEMS = ['GBIC', 'DAC CABLE', 'FIBER', 'SFP', 'QSFP', 'AOC', 'PATCH CORD'].map((type, i) => ({
    id: i + 1, item_id: i + 1, type, brand: 'METECH', model: `M${i}`, stock_qty: 1, lab_qty: 0, lent_qty: 0,
  }));

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('consumable_aggregation_mode', 'TYPE');
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn(async (q) => (q === 'fetchConsumablesList' ? { success: true, rows: ITEMS } : { success: true, rows: [] })),
      getUserPreference: vi.fn(async () => ({ success: true, value: null })),
      setUserPreference: vi.fn(async () => ({ success: true })),
      saveFile: vi.fn(),
    };
  });

  it('寬度只放得下 4 張：一列 4 格，7 張卡片排成兩列（8 格），先後順序不變', async () => {
    render(
      <MemoryRouter>
        <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, username: 'alice' }, setAuthUser: vi.fn() }}>
          <ConsumableList />
        </RoleContext.Provider>
      </MemoryRouter>
    );
    const grid = await screen.findByTestId('consumable-card-grid', {}, { timeout: 5000 });
    // 還沒量到寬度：維持 6 格
    await waitFor(() => expect(grid.querySelectorAll('[data-testid^="consumable-slot-"]')).toHaveLength(12));
    resize(grid, 950);
    expect(grid).toHaveAttribute('data-card-columns', '4');
    expect(grid.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
    const slots = grid.querySelectorAll('[data-testid^="consumable-slot-"]');
    expect(slots).toHaveLength(8);
    expect(slots[0]).toHaveTextContent('GBIC');
    expect(slots[6]).toHaveTextContent('PATCH CORD');
  });
});
