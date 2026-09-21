import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ConsumableList from '../pages/ConsumableList';
import DeviceList from '../pages/DeviceList';
import {
  ASSET_AGGREGATION_MODES,
  CONSUMABLE_AGGREGATION_MODES,
  getConsumableGroupField,
} from '../utils/cardAggregation';

/**
 * 卡片聚合規則改用下拉選單，耗材新增「依廠牌」
 *
 * 原本是一排按鈕，選項一多就把工具列擠滿，目前生效的是哪一個還得靠底色分辨。
 * 耗材則是寫死依類型，同一個廠牌的耗材散在各個類型卡片裡，看不出總量。
 */
const CONSUMABLES = [
  { id: 1, type: '網路線', brand: 'PANDUIT', model: 'CAT6', specification: '3M', stock_qty: 10, lab_qty: 0, lent_qty: 0, safety_stock: 0 },
  { id: 2, type: '光纖模組', brand: 'PANDUIT', model: 'SFP28', specification: '25G', stock_qty: 4, lab_qty: 0, lent_qty: 0, safety_stock: 0 },
  { id: 3, type: '網路線', brand: 'METECH', model: 'CAT6A', specification: '5M', stock_qty: 7, lab_qty: 0, lent_qty: 0, safety_stock: 0 },
];

describe('耗材卡片：依廠牌聚合', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn((query) => {
        if (query === 'fetchConsumablesList' || query === 'fetchConsumablesListByType') {
          return Promise.resolve({ success: true, rows: CONSUMABLES });
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

  const show = async () => {
    render(<MemoryRouter><ConsumableList /></MemoryRouter>);
    await screen.findByLabelText('聚合規則:');
  };
  const selector = () => screen.getByLabelText('聚合規則:');

  it('提供依類型與依廠牌兩種規則', async () => {
    await show();
    const options = [...selector().options].map((o) => o.textContent);
    expect(options).toEqual(['🔧 依類型', '🏢 依廠牌']);
  });

  it('預設依類型', async () => {
    await show();
    expect(selector()).toHaveValue('TYPE');
    await waitFor(() => expect(screen.getByText('網路線')).toBeInTheDocument());
    expect(screen.getByText('光纖模組')).toBeInTheDocument();
  });

  it('切換到依廠牌後，卡片改以廠牌呈現', async () => {
    await show();
    await userEvent.selectOptions(selector(), 'BRAND');

    await waitFor(() => expect(screen.getByText('PANDUIT')).toBeInTheDocument());
    expect(screen.getByText('METECH')).toBeInTheDocument();
    // 類型卡片應該消失，否則兩種分法會同時出現
    expect(screen.queryByText('光纖模組')).not.toBeInTheDocument();
  });

  it('依廠牌時副標題改講有幾種類型（廠牌數恆為 1，講了沒意義）', async () => {
    await show();
    await userEvent.selectOptions(selector(), 'BRAND');

    // PANDUIT 有網路線與光纖模組兩種類型、兩款型號
    await waitFor(() => expect(screen.getByText('2 種類型 · 2 款型號')).toBeInTheDocument());
  });

  it('依廠牌時點卡片是以廠牌篩選明細', async () => {
    await show();
    await userEvent.selectOptions(selector(), 'BRAND');
    await userEvent.click(await screen.findByText('METECH'));

    expect(await screen.findByText(/目前鎖定廠牌/)).toBeInTheDocument();
  });

  it('切換規則會清掉選取的卡片 —— 兩種規則的卡片值不同，沿用會篩不到東西', async () => {
    await show();
    await userEvent.click(await screen.findByText('網路線'));
    expect(await screen.findByText(/目前鎖定類型/)).toBeInTheDocument();

    await userEvent.selectOptions(selector(), 'BRAND');
    expect(screen.queryByText(/目前鎖定/)).not.toBeInTheDocument();
  });

  it('選擇會記住，重新進入頁面仍是上次的規則', async () => {
    await show();
    await userEvent.selectOptions(selector(), 'BRAND');
    expect(localStorage.getItem('consumable_aggregation_mode')).toBe('BRAND');
  });

  it('說明區塊只列出耗材真的有的兩種規則', async () => {
    await show();
    const legend = screen.getByText('耗材卡片聚合規則說明').closest('div').parentElement;
    expect(legend).toHaveTextContent('依類型');
    expect(legend).toHaveTextContent('依廠牌');
    expect(legend).not.toHaveTextContent('依規格');
  });
});

describe('設備卡片：聚合規則下拉選單', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.electronAPI = {
      namedQuery: vi.fn(() => Promise.resolve({ success: true, rows: [] })),
      runTransaction: vi.fn(),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  it('四種規則都在同一個下拉選單裡，不再是一排按鈕', async () => {
    render(<MemoryRouter><DeviceList /></MemoryRouter>);
    const select = await screen.findByLabelText('聚合規則:');

    expect([...select.options].map((o) => o.value)).toEqual(['SPEC', 'MODEL', 'TYPE', 'BRAND']);
    expect(screen.queryByRole('button', { name: /依規格/ })).not.toBeInTheDocument();
  });

  it('切換後記住選擇', async () => {
    render(<MemoryRouter><DeviceList /></MemoryRouter>);
    await userEvent.selectOptions(await screen.findByLabelText('聚合規則:'), 'BRAND');

    expect(localStorage.getItem('device_aggregation_mode')).toBe('BRAND');
  });
});

describe('聚合規則的定義', () => {
  it('設備與硬體四種、耗材兩種', () => {
    expect(ASSET_AGGREGATION_MODES.map((m) => m.value)).toEqual(['SPEC', 'MODEL', 'TYPE', 'BRAND']);
    expect(CONSUMABLE_AGGREGATION_MODES.map((m) => m.value)).toEqual(['TYPE', 'BRAND']);
  });

  it('耗材的選項是設備選項的子集，名稱與說明不會兩邊各寫一套', () => {
    CONSUMABLE_AGGREGATION_MODES.forEach((m) => {
      expect(ASSET_AGGREGATION_MODES.some((a) => a.value === m.value)).toBe(true);
    });
  });

  it('每個選項都有說明文字', () => {
    [...ASSET_AGGREGATION_MODES, ...CONSUMABLE_AGGREGATION_MODES].forEach((m) => {
      expect(m.title).toBeTruthy();
      expect(m.label).toBeTruthy();
    });
  });

  it('耗材依規則對到正確的欄位', () => {
    expect(getConsumableGroupField('BRAND')).toBe('brand');
    expect(getConsumableGroupField('TYPE')).toBe('type');
    // 未知值一律回到類型，不會變成 undefined 而把所有卡片併成一張
    expect(getConsumableGroupField(undefined)).toBe('type');
    expect(getConsumableGroupField('SPEC')).toBe('type');
  });
});

/**
 * 工具列的編排
 *
 * 聚合規則決定上方卡片怎麼分，是先看的東西，位置排在搜尋框左邊。
 * 耗材的「自訂標籤」已移除 —— 那是另一套只存在瀏覽器本機的篩選方式，
 * 與搜尋框功能重疊，換一台電腦就不見，維護成本大於用處。
 */
describe('耗材工具列', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn((query) => {
        if (query === 'fetchConsumablesList' || query === 'fetchConsumablesListByType') {
          return Promise.resolve({ success: true, rows: CONSUMABLES });
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

  const show = async () => {
    render(<MemoryRouter><ConsumableList /></MemoryRouter>);
    await screen.findByLabelText('聚合規則:');
  };

  it('聚合規則排在搜尋框左邊', async () => {
    await show();
    const select = screen.getByLabelText('聚合規則:');
    const search = screen.getByPlaceholderText(/快速搜尋/);

    // compareDocumentPosition：FOLLOWING 代表 search 在 select 之後
    expect(select.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('自訂標籤功能已移除', async () => {
    await show();
    expect(screen.queryByText('自訂標籤')).not.toBeInTheDocument();
    expect(document.querySelector('[data-testid="open-custom-tags-btn"]')).toBeNull();
    expect(document.querySelector('[data-testid="custom-tags-container"]')).toBeNull();
  });

  it('搜尋框仍然可用 —— 標籤原本做的事，搜尋框本來就做得到', async () => {
    await show();
    await userEvent.type(screen.getByPlaceholderText(/快速搜尋/), 'PANDUIT');

    await waitFor(() => expect(screen.getByPlaceholderText(/快速搜尋/)).toHaveValue('PANDUIT'));
  });
});

describe('設備與硬體工具列', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.electronAPI = {
      namedQuery: vi.fn(() => Promise.resolve({ success: true, rows: [] })),
      runTransaction: vi.fn(),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  it('設備列表的聚合規則同樣排在搜尋框左邊', async () => {
    render(<MemoryRouter><DeviceList /></MemoryRouter>);
    const select = await screen.findByLabelText('聚合規則:');
    const search = screen.getByPlaceholderText('快速搜尋...');

    expect(select.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
