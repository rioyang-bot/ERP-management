import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { RoleContext } from '../context/RoleContext';
import {
  getAssetDrilldown, buildDrilldownCards, matchesDrilldown, describeDrilldownKey,
  getDrilldownParentTitle, buildConsumableDrillCards, getConsumableDrillField,
} from '../utils/cardAggregation';

/**
 * 卡片往下展開：只列出當下那一層
 *
 *   依類型：點 SERVER → 卡片區只剩 SERVER 底下的各廠牌
 *   依廠牌：點 BLACKCORE → 只剩 BLACKCORE 底下的各型號
 *   依型號：點某型號 → 只剩它底下的各規格（依規格已是最細，維持原本點了只剩那張）
 *   耗材：依類型 → 各廠牌、依廠牌 → 各類型
 * 點子卡片：下方清單只剩那一組；「返回上一層」回到原本的卡片。
 */

const DEVICES = [
  { id: 1, sn: 'D-1', brand: 'DELL', type: 'SERVER', model: 'R760', specification: '32C', status: 'ACTIVE', custom_attributes: {}, components: [] },
  { id: 2, sn: 'D-2', brand: 'DELL', type: 'SERVER', model: 'R760', specification: '64C', status: 'SHIPPED', custom_attributes: {}, components: [] },
  { id: 3, sn: 'B-1', brand: 'BLACKCORE', type: 'SERVER', model: 'BCHFT-1PC', specification: '', status: 'ACTIVE', custom_attributes: {}, components: [] },
  { id: 4, sn: 'B-2', brand: 'BLACKCORE', type: 'SWITCH', model: 'BC-SW', specification: '', status: 'ACTIVE', custom_attributes: {}, components: [] },
  { id: 5, sn: 'A-1', brand: 'ARISTA', type: 'SWITCH', model: '7130', specification: '', status: 'ACTIVE', custom_attributes: {}, components: [] },
];

describe('展開規則', () => {
  it('依類型→廠牌、依廠牌→型號、依型號→規格；依規格不再展開', () => {
    expect(getAssetDrilldown('TYPE')).toMatchObject({ mode: 'BRAND', label: '廠牌' });
    expect(getAssetDrilldown('BRAND')).toMatchObject({ mode: 'MODEL', label: '型號' });
    expect(getAssetDrilldown('MODEL')).toMatchObject({ mode: 'SPEC', label: '規格' });
    expect(getAssetDrilldown('SPEC')).toBeNull();
  });

  it('SERVER 底下的廠牌：數量多的在前', () => {
    const cards = buildDrilldownCards(DEVICES.filter((d) => d.type === 'SERVER'), 'TYPE');
    expect(cards.map((c) => [c.title, c.total])).toEqual([['DELL', 2], ['BLACKCORE', 1]]);
    expect(cards[0]).toMatchObject({ active: 1, shipped: 1 });
  });

  it('BLACKCORE 底下的型號：副標題標出類型（一個廠牌可能跨類型）', () => {
    const cards = buildDrilldownCards(DEVICES.filter((d) => d.brand === 'BLACKCORE'), 'BRAND');
    expect(cards.map((c) => [c.title, c.subtitle])).toEqual([['BC-SW', 'SWITCH'], ['BCHFT-1PC', 'SERVER']]);
  });

  it('型號底下的規格；沒填規格的另成一張', () => {
    const items = [...DEVICES.filter((d) => d.model === 'R760'), { ...DEVICES[0], id: 9, specification: '' }];
    expect(buildDrilldownCards(items, 'MODEL').map((c) => c.title).sort()).toEqual(['32C', '64C', '（未填規格）'].sort());
  });

  it('子卡片的比對與名稱', () => {
    const [dell] = buildDrilldownCards(DEVICES.filter((d) => d.type === 'SERVER'), 'TYPE');
    expect(matchesDrilldown(DEVICES[0], 'TYPE', dell.key)).toBe(true);
    expect(matchesDrilldown(DEVICES[2], 'TYPE', dell.key)).toBe(false);
    expect(matchesDrilldown(DEVICES[2], 'TYPE', null)).toBe(true);
    expect(describeDrilldownKey('DELL', 'TYPE')).toBe('DELL');
    expect(describeDrilldownKey('BLACKCORE - SWITCH - BC-SW', 'BRAND')).toBe('BC-SW');
    expect(describeDrilldownKey('DELL - SERVER - R760 - 32C - A', 'MODEL')).toBe('32C - A');
    expect(describeDrilldownKey('DELL - SERVER - R760 - ', 'MODEL')).toBe('（未填規格）');
    expect(getDrilldownParentTitle({ brand: 'DELL', model: 'R760', type: 'SERVER' }, 'MODEL')).toBe('DELL R760');
    expect(getDrilldownParentTitle({ brand: 'DELL', type: 'SERVER' }, 'TYPE')).toBe('SERVER');
  });

  it('耗材：依類型展開廠牌、依廠牌展開類型；數量是在席 + 借測', () => {
    expect(getConsumableDrillField('TYPE')).toBe('brand');
    expect(getConsumableDrillField('BRAND')).toBe('type');
    const cards = buildConsumableDrillCards([
      { brand: 'CISCO', model: 'A', stock_qty: 5, lab_qty: 1, lent_qty: 0 },
      { brand: 'CISCO', model: 'B', stock_qty: 2, lab_qty: 0, lent_qty: 1 },
      { brand: '', model: 'C', stock_qty: 1, lab_qty: 0, lent_qty: 0 },
    ], 'brand');
    expect(cards.map((c) => [c.title, c.total, c.subtitle])).toEqual([['CISCO', 8, '2 款型號'], ['未知廠牌', 1, '1 款型號']]);
  });
});

const setupAssets = (rowsQueries, rows) => {
  window.electronAPI = {
    namedQuery: vi.fn((q) => Promise.resolve({ success: true, rows: rowsQueries.includes(q) ? rows : [] })),
    runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
};

const tableSns = () => screen.getAllByRole('row').slice(1).map((r) => r.textContent).join(' ');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.alert = vi.fn();
});

describe('設備列表', () => {
  const show = async (mode) => {
    localStorage.setItem('device_aggregation_mode', mode);
    setupAssets(['fetchAssetsList', 'fetchAssetsListByBrand'], DEVICES);
    const { default: DeviceList } = await import('../pages/DeviceList');
    render(<MemoryRouter><DeviceList /></MemoryRouter>);
    await screen.findByText('SERVER');
  };

  it('依類型：點 SERVER，卡片區只剩 SERVER 的各廠牌；點廠牌清單縮小；返回上一層', async () => {
    await show('TYPE');
    expect(screen.getByText('SWITCH')).toBeInTheDocument();
    fireEvent.click(screen.getByText('SERVER'));

    const drill = await screen.findByRole('region', { name: 'SERVER 的廠牌' });
    expect(within(drill).getByTestId('drilldown-card-DELL')).toHaveTextContent('共 2 台');
    expect(within(drill).getByTestId('drilldown-card-BLACKCORE')).toHaveTextContent('共 1 台');
    // 上一層的卡片（SERVER 本身與 SWITCH）不再顯示
    expect(screen.queryByText('SWITCH')).toBeNull();
    expect(screen.queryByTitle('將此卡片移至汰舊區')).toBeNull();
    // 清單是整個 SERVER
    await waitFor(() => expect(tableSns()).toContain('B-1'));
    expect(tableSns()).toContain('D-1');

    fireEvent.click(within(drill).getByTestId('drilldown-card-DELL'));
    await waitFor(() => expect(tableSns()).not.toContain('B-1'));
    expect(tableSns()).toContain('D-1');
    expect(tableSns()).toContain('D-2');
    // 篩選說明寫「SERVER › DELL」，不帶內部用的 TYPE:: 前綴
    expect(screen.getByText('SERVER › DELL')).toBeInTheDocument();
    expect(screen.queryByText(/TYPE::/)).toBeNull();

    // 再點一次取消：回到整個 SERVER
    fireEvent.click(within(drill).getByTestId('drilldown-card-DELL'));
    await waitFor(() => expect(tableSns()).toContain('B-1'));

    fireEvent.click(within(drill).getByRole('button', { name: /返回上一層/ }));
    await waitFor(() => expect(screen.getByText('SWITCH')).toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'SERVER 的廠牌' })).toBeNull();
  });

  it('依廠牌：點 BLACKCORE，只剩它的各型號', async () => {
    localStorage.setItem('device_aggregation_mode', 'BRAND');
    setupAssets(['fetchAssetsList', 'fetchAssetsListByBrand'], DEVICES);
    const { default: DeviceList } = await import('../pages/DeviceList');
    render(<MemoryRouter><DeviceList /></MemoryRouter>);
    fireEvent.click(await screen.findByText('BLACKCORE'));
    const drill = await screen.findByRole('region', { name: 'BLACKCORE 的型號' });
    expect(within(drill).getByText('BCHFT-1PC')).toBeInTheDocument();
    expect(within(drill).getByText('BC-SW')).toBeInTheDocument();
    expect(screen.queryByText('ARISTA')).toBeNull();
  });

  it('換別張卡片：上一張的子卡片選取不會帶過去', async () => {
    await show('TYPE');
    fireEvent.click(screen.getByText('SERVER'));
    let drill = await screen.findByRole('region', { name: 'SERVER 的廠牌' });
    fireEvent.click(within(drill).getByTestId('drilldown-card-BLACKCORE'));
    await waitFor(() => expect(tableSns()).not.toContain('D-1'));
    fireEvent.click(within(drill).getByRole('button', { name: /返回上一層/ }));
    fireEvent.click(await screen.findByText('SWITCH'));
    drill = await screen.findByRole('region', { name: 'SWITCH 的廠牌' });
    // BLACKCORE 在 SWITCH 底下也有，但不應該被當成已選
    expect(within(drill).getByTestId('drilldown-card-BLACKCORE')).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(tableSns()).toContain('A-1'));
  });
});

describe('硬體列表', () => {
  const HW = [
    { id: 11, sn: 'N-1', brand: 'Intel', type: 'NIC', model: 'X710', status: 'ACTIVE', custom_attributes: {} },
    { id: 12, sn: 'N-2', brand: 'Mellanox', type: 'NIC', model: 'CX4', status: 'ACTIVE', custom_attributes: { server_sn: 'SRV-1' }, server_sn: 'SRV-1' },
    { id: 13, sn: 'S-1', brand: 'Intel', type: 'SSD', model: 'P5520', status: 'ACTIVE', custom_attributes: {} },
  ];

  it('依類型：點 NIC，只剩 NIC 的各廠牌（含 LAB 數）；點廠牌清單縮小', async () => {
    localStorage.setItem('hw_aggregation_mode', 'TYPE');
    setupAssets(['fetchNicList', 'fetchNicListByType'], HW);
    const { default: HwList } = await import('../pages/HwList');
    render(<MemoryRouter><HwList /></MemoryRouter>);
    fireEvent.click(await screen.findByText('NIC'));
    const drill = await screen.findByRole('region', { name: 'NIC 的廠牌' });
    expect(within(drill).getByTestId('drilldown-card-Mellanox')).toHaveTextContent('LAB1');
    expect(screen.queryByText('SSD')).toBeNull();

    fireEvent.click(within(drill).getByTestId('drilldown-card-Intel'));
    await waitFor(() => expect(tableSns()).not.toContain('N-2'));
    expect(tableSns()).toContain('N-1');
    expect(tableSns()).not.toContain('S-1');
  });
});

describe('耗材列表', () => {
  const ITEMS = [
    { id: 1, item_id: 1, type: 'GBIC', brand: 'CISCO', model: '10G-SR', stock_qty: 5, lab_qty: 0, lent_qty: 0 },
    { id: 2, item_id: 2, type: 'GBIC', brand: 'FS', model: '10G-LR', stock_qty: 3, lab_qty: 1, lent_qty: 0 },
    { id: 3, item_id: 3, type: 'FIBER', brand: 'FS', model: '40G-SR4', stock_qty: 2, lab_qty: 0, lent_qty: 0 },
  ];

  const show = async () => {
    localStorage.setItem('consumable_aggregation_mode', 'TYPE');
    window.electronAPI = {
      namedQuery: vi.fn(async (q) => (q === 'fetchConsumablesList' ? { success: true, rows: ITEMS } : { success: true, rows: [] })),
      getUserPreference: vi.fn(async () => ({ success: true, value: null })),
      setUserPreference: vi.fn(async () => ({ success: true })),
      saveFile: vi.fn(),
    };
    const { default: ConsumableList } = await import('../pages/ConsumableList');
    render(
      <MemoryRouter>
        <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, username: 'alice' }, setAuthUser: vi.fn() }}>
          <ConsumableList />
        </RoleContext.Provider>
      </MemoryRouter>
    );
    await screen.findByTestId('consumable-card-GBIC');
  };

  it('依類型：點 GBIC，卡片區只剩 GBIC 的各廠牌；點廠牌清單縮小；返回上一層', async () => {
    await show();
    fireEvent.click(screen.getByTestId('consumable-card-GBIC'));
    const drill = await screen.findByRole('region', { name: 'GBIC 的廠牌' });
    expect(within(drill).getByTestId('drilldown-card-CISCO')).toHaveTextContent('共 5 個');
    expect(within(drill).getByTestId('drilldown-card-FS')).toHaveTextContent('共 4 個');
    expect(screen.queryByTestId('consumable-card-FIBER')).toBeNull();
    await waitFor(() => expect(tableSns()).toContain('10G-LR'));

    fireEvent.click(within(drill).getByTestId('drilldown-card-FS'));
    await waitFor(() => expect(tableSns()).not.toContain('10G-SR'));
    expect(tableSns()).toContain('10G-LR');
    expect(tableSns()).not.toContain('40G-SR4');
    expect(screen.getByText('GBIC › FS')).toBeInTheDocument();

    fireEvent.click(within(drill).getByRole('button', { name: /返回上一層/ }));
    expect(await screen.findByTestId('consumable-card-FIBER')).toBeInTheDocument();
  });
});
