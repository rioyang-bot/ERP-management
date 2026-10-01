import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InboundList from '../pages/InboundList';
import DNList from '../pages/DNList';

/**
 * 進貨單列表的邊界距離與出貨單列表相同
 *
 * 進貨單列表原本的外框沒有 page-container，少了頁面內距，
 * 副標題的下邊距、右上角數量卡片與表格卡片的樣式也不一樣，
 * 兩頁切換時整個版面會明顯跳一下。
 */
beforeEach(() => {
  window.alert = vi.fn();
  window.electronAPI = {
    namedQuery: vi.fn().mockResolvedValue({ success: true, rows: [] }),
    runTransaction: vi.fn(),
    getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
});

/** 外框、標題列、副標題、數量卡片、表格卡片 */
const layoutOf = async (Page, title) => {
  const { container, unmount } = render(<MemoryRouter><Page /></MemoryRouter>);
  const h1 = await screen.findByRole('heading', { level: 1, name: title });
  const root = container.firstElementChild;
  const header = root.firstElementChild;
  const subtitle = h1.nextElementSibling;
  const statCard = header.lastElementChild.firstElementChild;
  const card = header.nextElementSibling;
  const result = {
    root: root.className,
    rootStyle: root.getAttribute('style'),
    header: header.className,
    headerStyle: header.getAttribute('style'),
    subtitleStyle: subtitle.getAttribute('style'),
    statCardStyle: statCard.getAttribute('style'),
    statCardShape: [...statCard.querySelectorAll('div')].length,
    card: card.className,
    cardStyle: card.getAttribute('style'),
  };
  unmount();
  return result;
};

describe('進貨單列表與出貨單列表的版面', () => {
  it('外框、標題列、卡片的間距完全相同', async () => {
    const dn = await layoutOf(DNList, /出貨單列表/);
    const inbound = await layoutOf(InboundList, /進貨單列表/);
    expect(inbound).toEqual(dn);
    expect(inbound.root).toBe('page-container');
  });
});
