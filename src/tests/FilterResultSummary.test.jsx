import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FilterResultSummary from '../components/common/FilterResultSummary';
import { summariseByStatus, describeFilters, STATUS_SUMMARY_GROUPS } from '../utils/filterSummary';

/**
 * 篩選結果統計
 *
 * 查詢某位客戶時，表格底下只有「第 X 頁 / 共 Y 頁」，要知道這位客戶有幾台
 * 只能把每頁筆數調到最大再自己數；上方的統計卡片又比對不到客戶名稱
 * （卡片只比對類型／廠牌／型號／規格），整排會消失。因此補這一行。
 */
const items = (...statuses) => statuses.map((status, i) => ({ id: i + 1, status }));

describe('依狀態統計', () => {
  it('算出總數與各狀態數量', () => {
    const { total, groups } = summariseByStatus(
      items('SHIPPED', 'ACTIVE', 'SHIPPED', 'REPAIRING', 'ACTIVE', 'ACTIVE')
    );
    expect(total).toBe(6);
    expect(groups).toEqual([
      { key: 'ACTIVE', label: '在庫', color: '#047857', count: 3 },
      { key: 'SHIPPED', label: '已出貨', color: '#1d4ed8', count: 2 },
      { key: 'REPAIRING', label: '維修中', color: '#d97706', count: 1 },
    ]);
  });

  it('沒有數量的狀態不列出來', () => {
    const { groups } = summariseByStatus(items('ACTIVE', 'ACTIVE'));
    expect(groups.map((g) => g.key)).toEqual(['ACTIVE']);
  });

  /** 硬體的舊資料有用 REPAIR 的，和 REPAIRING 算同一組 */
  it('REPAIR 與 REPAIRING 合併計算', () => {
    const { groups } = summariseByStatus(items('REPAIR', 'REPAIRING'));
    expect(groups).toEqual([{ key: 'REPAIRING', label: '維修中', color: '#d97706', count: 2 }]);
  });

  /**
   * 各組加起來一定要等於總數 —— 不然這行字反而讓人算不清楚。
   * 認不得的狀態歸到「其他」，不是默默丟掉。
   */
  it('認不得的狀態歸到「其他」，加總仍等於總數', () => {
    const { total, groups } = summariseByStatus(items('ACTIVE', 'WEIRD', null, undefined, ''));
    expect(total).toBe(5);
    expect(groups.find((g) => g.key === 'OTHER').count).toBe(4);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(total);
  });

  it('狀態大小寫與前後空白不影響歸類', () => {
    const { groups } = summariseByStatus(items(' active ', 'Shipped'));
    expect(groups.map((g) => g.key)).toEqual(['ACTIVE', 'SHIPPED']);
  });

  it('空清單不會壞掉', () => {
    expect(summariseByStatus([])).toEqual({ total: 0, groups: [] });
    expect(summariseByStatus(null)).toEqual({ total: 0, groups: [] });
  });

  it('顯示順序固定：在庫、已出貨、借出、維修中、待報廢、報廢', () => {
    const { groups } = summariseByStatus(
      items('SCRAPPED', 'REPAIRING', 'SHIPPED', 'PENDING_SCRAP', 'LENT', 'ACTIVE')
    );
    expect(groups.map((g) => g.label)).toEqual(
      STATUS_SUMMARY_GROUPS.map((g) => g.label)
    );
  });
});

describe('篩選條件的敘述', () => {
  it('多個條件串起來', () => {
    expect(describeFilters({ searchTerm: '元大', brandFilter: 'INTEL' })).toBe('元大、INTEL');
  });

  it('沒有條件就是空字串', () => {
    expect(describeFilters({})).toBe('');
    expect(describeFilters()).toBe('');
    expect(describeFilters({ searchTerm: '  ' })).toBe('');
  });
});

describe('統計列的呈現', () => {
  const LIST = items('SHIPPED', 'SHIPPED', 'ACTIVE');

  it('印出搜尋條件、總數與各狀態', () => {
    render(<FilterResultSummary items={LIST} unit="台" searchTerm="元大證券" />);
    const bar = screen.getByTestId('filter-result-summary');
    expect(bar).toHaveTextContent('元大證券');
    expect(bar).toHaveTextContent('共 3 台');
    // 標籤與數字之間是 flex 間距，不是空白字元
    expect(bar).toHaveTextContent('在庫1');
    expect(bar).toHaveTextContent('已出貨2');
    // 在庫排在已出貨前面
    expect(bar.textContent.indexOf('在庫')).toBeLessThan(bar.textContent.indexOf('已出貨'));
  });

  it('硬體用「個」，設備用「台」', () => {
    const { unmount } = render(<FilterResultSummary items={LIST} unit="個" searchTerm="元大" />);
    expect(screen.getByTestId('filter-result-summary')).toHaveTextContent('共 3 個');
    unmount();

    render(<FilterResultSummary items={LIST} unit="台" searchTerm="元大" />);
    expect(screen.getByTestId('filter-result-summary')).toHaveTextContent('共 3 台');
  });

  it('沒有搜尋條件時只說「篩選結果」', () => {
    render(<FilterResultSummary items={LIST} unit="台" />);
    const bar = screen.getByTestId('filter-result-summary');
    expect(bar).toHaveTextContent('篩選結果');
    expect(bar).toHaveTextContent('共 3 台');
  });
});
