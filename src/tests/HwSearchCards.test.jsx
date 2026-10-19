import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HwList from '../pages/HwList';

/**
 * 硬體列表：搜尋時卡片依搜尋結果統計，篩選結果列也列出 LAB
 *
 * 先前搜 Z890 時，上面的 MOTHERBOARD 卡片仍然數全部的主機板（共 46 個），
 * 下面的篩選結果列把已掛載未出貨的（LAB）算進在庫。
 */
const hw = (id, model, status, serverSn = '') => ({
  id, sn: `MB-${id}`, brand: 'ASUS', type: 'MOTHERBOARD', model, specification: '', status,
  server_sn: serverSn, custom_attributes: serverSn ? { server_sn: serverSn } : {}, category_name: '硬體',
});
const NICS = [
  hw(1, 'Z890', 'ACTIVE'),
  hw(2, 'Z890', 'ACTIVE', 'SRV-1'),
  hw(3, 'Z890', 'ACTIVE', 'SRV-2'),
  hw(4, 'Z890', 'SHIPPED', 'SRV-3'),
  hw(5, 'Z790', 'ACTIVE'),
  hw(6, 'Z790', 'ACTIVE'),
  hw(7, 'Z790', 'ACTIVE', 'SRV-4'),
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // 依類型：所有主機板一張卡片
  localStorage.setItem('hw_aggregation_mode', 'TYPE');
  window.electronAPI = {
    namedQuery: vi.fn(async (query) => {
      if (query === 'fetchNicList' || query === 'fetchNicListByType') return { success: true, rows: NICS };
      return { success: true, rows: [] };
    }),
    runTransaction: vi.fn(),
    saveFile: vi.fn(),
    getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
});

/** 卡片上的數字：{ 在庫, LAB, 出貨, ... } */
const cardStats = (titleText) => {
  // 搜尋時下面的表格也有同樣的字，只在卡片區找
  const hint = screen.queryByTestId('hw-cards-search-hint');
  const scope = hint ? within(hint.parentElement) : screen;
  const card = scope.getAllByText(titleText)[0].closest('div[style*="border-radius: 12px"]');
  const stats = {};
  card.querySelectorAll('span + span').forEach((num) => { stats[num.previousSibling.textContent] = Number(num.textContent); });
  return { card, stats };
};

describe('硬體列表搜尋', () => {
  it('沒搜尋：卡片數全部', async () => {
    render(<MemoryRouter><HwList /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/共 7 個/)).toBeInTheDocument());
    const { stats } = cardStats('MOTHERBOARD');
    expect(stats).toMatchObject({ 在庫: 3, LAB: 3, 出貨: 1 });
    expect(screen.queryByTestId('hw-cards-search-hint')).not.toBeInTheDocument();
  });

  it('搜 Z890：卡片只數 Z890 的；篩選結果列另列 LAB', async () => {
    render(<MemoryRouter><HwList /></MemoryRouter>);
    await userEvent.type(await screen.findByPlaceholderText(/搜尋/), 'Z890');
    await waitFor(() => expect(screen.getByTestId('hw-cards-search-hint')).toHaveTextContent('卡片數量依搜尋「Z890」統計'));

    // 卡片：共 4 個（不是全部 7 個），在庫 1、LAB 2、出貨 1
    const { card, stats } = cardStats('MOTHERBOARD');
    expect(card).toHaveTextContent('共 4 個');
    expect(stats).toMatchObject({ 在庫: 1, LAB: 2, 出貨: 1 });

    // 篩選結果列與卡片一致
    const summary = screen.getByTestId('filter-result-summary');
    expect(summary).toHaveTextContent('共 4 個');
    expect(summary).toHaveTextContent('在庫1');
    expect(summary).toHaveTextContent('LAB2');
    expect(summary).toHaveTextContent('已出貨1');
  });

  it('搜類型也找得到（硬體本身也比對類型）', async () => {
    render(<MemoryRouter><HwList /></MemoryRouter>);
    await userEvent.type(await screen.findByPlaceholderText(/搜尋/), 'motherboard');
    await waitFor(() => expect(screen.getByTestId('filter-result-summary')).toHaveTextContent('共 7 個'));
    expect(cardStats('MOTHERBOARD').card).toHaveTextContent('共 7 個');
  });

  it('搜尋沒有符合的：沒有卡片', async () => {
    render(<MemoryRouter><HwList /></MemoryRouter>);
    await userEvent.type(await screen.findByPlaceholderText(/搜尋/), 'NOPE-123');
    await waitFor(() => expect(screen.getByTestId('filter-result-summary')).toHaveTextContent('共 0 個'));
    expect(screen.queryByText('MOTHERBOARD')).not.toBeInTheDocument();
  });
});
