import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RepairList from '../pages/RepairList';
import LentList from '../pages/LentList';
import { RoleContext } from '../context/RoleContext';

/**
 * 維修單列表與借用列表：邊界距離、頁籤、搜尋框一致
 *
 * 維修單列表原本自己設 padding 24px、最寬 1600px 置中、標題列下方 24px，
 * 和借用列表（page-container / page-header）不同，兩頁切換時版面會跳。
 * 借用列表的三個頁籤原本大小不一（借出中字較大、已結案左右較寬），
 * 統一成「已建立」的樣式；維修單列表的頁籤與搜尋框字級也與借用列表相同。
 */
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T10:00:00')); });
afterAll(() => { vi.useRealTimers(); });

beforeEach(() => {
  window.alert = vi.fn();
  window.electronAPI = {
    namedQuery: vi.fn().mockResolvedValue({ success: true, rows: [] }),
    runTransaction: vi.fn(),
    saveFile: vi.fn(),
    getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
});

const renderPage = (Page) => render(
  <MemoryRouter>
    <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1 }, setAuthUser: vi.fn() }}>
      {React.createElement(Page)}
    </RoleContext.Provider>
  </MemoryRouter>
);

/** 頁籤的樣式，去掉依狀態而變的顏色 */
const tabShape = (b) => ({
  padding: b.style.padding,
  fontSize: b.style.fontSize,
  gap: b.style.gap,
  icon: b.querySelector('svg')?.getAttribute('width'),
});

const layoutOf = async (Page, title, tabBarId, toolbarId) => {
  const { container, unmount } = renderPage(Page);
  await screen.findByRole('heading', { level: 1, name: title });
  const root = container.firstElementChild;
  const header = root.firstElementChild;
  const bar = screen.getByTestId(tabBarId);
  const tabs = [...bar.querySelectorAll('button')].filter((b) => !screen.getByTestId(toolbarId).contains(b));
  const search = screen.getByTestId(toolbarId).querySelector('input[type="text"]');
  const result = {
    root: root.className,
    padding: root.style.padding,
    maxWidth: root.style.maxWidth,
    header: header.className,
    headerStyle: header.getAttribute('style'),
    subtitleStyle: header.querySelector('p').getAttribute('style'),
    tabs: tabs.map(tabShape),
    toolbarPadding: screen.getByTestId(toolbarId).style.padding,
    searchStyle: search.getAttribute('style'),
  };
  unmount();
  return result;
};

describe('維修單列表與借用列表的版面', () => {
  it('借用列表三個頁籤與「已建立」同樣大小', async () => {
    const lent = await layoutOf(LentList, /借用列表/, 'lent-tab-bar', 'lent-toolbar');
    expect(lent.tabs).toHaveLength(3);
    for (const t of lent.tabs) expect(t).toEqual({ padding: '10px 18px', fontSize: '0.9rem', gap: '6px', icon: '16' });
  });

  it('外框、標題列、頁籤、搜尋框都與借用列表相同', async () => {
    const lent = await layoutOf(LentList, /借用列表/, 'lent-tab-bar', 'lent-toolbar');
    const repair = await layoutOf(RepairList, /維修單列表/, 'repair-tab-bar', 'repair-toolbar');

    expect(repair.root).toBe('page-container');
    expect(repair.padding).toBe('');
    expect(repair.maxWidth).toBe('');
    expect(repair.header).toBe(lent.header);
    expect(repair.headerStyle).toBe(lent.headerStyle);
    expect(repair.subtitleStyle).toBe(lent.subtitleStyle);
    expect(repair.toolbarPadding).toBe(lent.toolbarPadding);
    expect(repair.searchStyle).toBe(lent.searchStyle);
    for (const t of repair.tabs) expect(t).toEqual(lent.tabs[0]);
  });
});
