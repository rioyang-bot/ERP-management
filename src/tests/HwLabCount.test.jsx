import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HwList from '../pages/HwList';
import { aggregateCards, isInLab, getMountedServerSn } from '../utils/cardAggregation';

/**
 * 硬體卡片的 LAB 數量
 *
 * 已經掛上某台設備、但還沒出貨的硬體，實體在實驗室的機器裡，
 * 不是可以拿去用的在庫。先前這些全部算進「在庫」，看起來手上還有很多，
 * 實際上大半已經裝在機器上了。現在獨立計為 LAB，並從在庫扣掉。
 */
const HW = [
  // 已掛載、未出貨 → LAB
  { id: 1, sn: 'A1', brand: 'MELLANOX', type: 'NIC', model: 'CX556A', specification: '100G', status: 'ACTIVE', server_sn: 'SRV-001', custom_attributes: {} },
  { id: 2, sn: 'A2', brand: 'MELLANOX', type: 'NIC', model: 'CX556A', specification: '100G', status: 'ACTIVE', server_sn: 'SRV-002', custom_attributes: {} },
  // 未掛載、未出貨 → 在庫
  { id: 3, sn: 'A3', brand: 'MELLANOX', type: 'NIC', model: 'CX556A', specification: '100G', status: 'ACTIVE', server_sn: null, custom_attributes: {} },
  // 已掛載但已出貨 → 出貨，不算 LAB
  { id: 4, sn: 'A4', brand: 'MELLANOX', type: 'NIC', model: 'CX556A', specification: '100G', status: 'SHIPPED', server_sn: 'SRV-003', custom_attributes: {} },
];

describe('硬體列表：LAB 計數', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.electronAPI = {
      namedQuery: vi.fn((query) => {
        if (query === 'fetchNicList' || query === 'fetchNicListByType') {
          return Promise.resolve({ success: true, rows: HW });
        }
        return Promise.resolve({ success: true, rows: [] });
      }),
      runTransaction: vi.fn(),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  it('卡片上出現 LAB，數字是已掛載且未出貨的筆數', async () => {
    render(<MemoryRouter><HwList /></MemoryRouter>);
    await userEvent.type(await screen.findByPlaceholderText('搜尋...'), 'CX556A');

    const card = await waitFor(() => {
      const el = [...document.querySelectorAll('div')].find((d) => d.textContent?.includes('LAB'));
      expect(el).toBeTruthy();
      return el;
    });
    // 4 筆中有 2 筆已掛載且未出貨
    expect(card.textContent).toMatch(/LAB2/);
  });
});

describe('LAB 的計算', () => {
  const statsOf = (rows) => {
    const { activeStatsMap } = aggregateCards(rows, 'SPEC', []);
    return Object.values(activeStatsMap)[0];
  };

  it('已掛載且未出貨的算 LAB', () => {
    expect(statsOf(HW).lab).toBe(2);
  });

  it('在庫扣掉了掛載中的，兩者不重複計算', () => {
    const st = statsOf(HW);
    expect(st.active).toBe(1);
    // 狀態為 ACTIVE 的共 3 筆，拆成 LAB 2 + 在庫 1
    expect(st.active + st.lab).toBe(3);
  });

  it('已出貨的不受影響，總數也不變', () => {
    const st = statsOf(HW);
    expect(st.shipped).toBe(1);
    expect(st.total).toBe(4);
  });

  it('沒有任何掛載時 LAB 為 0，不是 undefined', () => {
    const st = statsOf([{ ...HW[2] }]);
    expect(st.lab).toBe(0);
  });

  it.each([
    ['已掛載且在庫', { status: 'ACTIVE', server_sn: 'X1' }, true],
    ['已掛載但已出貨', { status: 'SHIPPED', server_sn: 'X1' }, false],
    ['沒掛載', { status: 'ACTIVE' }, false],
    ['序號只有空白', { status: 'ACTIVE', server_sn: '   ' }, false],
    ['沒填狀態時視為在庫', { server_sn: 'X1' }, true],
  ])('%s → %s', (_label, item, expected) => {
    expect(isInLab(item)).toBe(expected);
  });

  it('掛載序號從 custom_attributes 取得，字串或物件都可以', () => {
    expect(getMountedServerSn({ custom_attributes: { server_sn: 'X9' } })).toBe('X9');
    expect(getMountedServerSn({ custom_attributes: '{"server_sn":"X9"}' })).toBe('X9');
    expect(getMountedServerSn({ custom_attributes: ' not json ' })).toBe('');
    expect(getMountedServerSn(null)).toBe('');
  });

  it('設備沒有掛載序號，計數維持原樣', () => {
    const devices = [
      { id: 1, brand: 'DELL', type: 'SERVER', model: 'R760', status: 'ACTIVE', custom_attributes: { mounted_hw_sns: 'A1, A2' } },
    ];
    const st = statsOf(devices);
    expect(st.lab).toBe(0);
    expect(st.active).toBe(1);
  });
});
