import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeviceList from '../pages/DeviceList';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { RoleContext } from '../context/RoleContext';
import { createRunTransactionMock } from './helpers/mockTransaction';
import { groupMountedHwByType, groupMountedConsumablesByType, UNTYPED, UNREGISTERED } from '../utils/mountedHwGroups';

/**
 * 設備編輯：搭載硬體 SN「已設定」清單依類型分組
 *
 * 原本所有序號擠成一排，掛了好幾張網卡、記憶體、硬碟時看不出各類型有幾個。
 * 改成一個類型一行、類型寫在最前面；找不到建檔資料的放最後。
 */
const HW = [
  { id: 11, sn: 'CPU-1', brand: 'INTEL', model: 'ULTRA9 285K', type: 'CPU', server_sn: null },
  { id: 12, sn: 'RAM-1', brand: 'V-COLOR', model: 'PC5', type: 'RAM', server_sn: null },
  { id: 13, sn: 'RAM-2', brand: 'V-COLOR', model: 'PC5', type: 'RAM', server_sn: null },
  { id: 14, sn: 'NIC-1', brand: 'MELLANOX', model: 'CX5', type: 'NIC', server_sn: null },
  { id: 15, sn: 'X-1', brand: 'ACME', model: 'X', type: '', server_sn: null },
];
const find = (sn) => HW.find((h) => h.sn.toLowerCase() === sn.toLowerCase());

describe('分組規則', () => {
  it('依類型分組並排序，同類型維持輸入順序', () => {
    const groups = groupMountedHwByType(['RAM-2', 'NIC-1', 'CPU-1', 'RAM-1'], find);
    expect(groups.map((g) => g.type)).toEqual(['CPU', 'NIC', 'RAM']);
    expect(groups[2].items.map((i) => i.sn)).toEqual(['RAM-2', 'RAM-1']);
  });

  it('沒有類型的放「未分類」，找不到建檔資料的放最後', () => {
    const groups = groupMountedHwByType(['NOPE-1', 'X-1', 'CPU-1'], find);
    expect(groups.map((g) => g.type)).toEqual(['CPU', UNTYPED, UNREGISTERED]);
    expect(groups[2].items[0]).toMatchObject({ sn: 'NOPE-1', hw: null, registered: false });
  });

  it('只知道序號（舊資料）也算已建檔，放在未分類', () => {
    expect(groupMountedHwByType(['OLD-1'], () => 'OLD-1').map((g) => g.type)).toEqual([UNTYPED]);
  });
});

describe('設備編輯視窗', () => {
  const DEVICE = {
    id: 1, sn: 'DEV-1', status: 'ACTIVE', ownership: 'FOR_SALE', item_master_id: 5,
    brand: 'BLACKCORE', type: 'SERVER', model: '3122-SM', specification: '26C',
    unit: '台', custom_attributes: {}, components: [],
  };
  const namedQueryMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    namedQueryMock.mockImplementation((query) => {
      if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') return Promise.resolve({ success: true, rows: [{ ...DEVICE }] });
      if (query === 'fetchAvailableHardwares') return Promise.resolve({ success: true, rows: HW });
      if (query === 'fetchDeviceBrands') return Promise.resolve({ success: true, rows: [{ id: 1, name: 'BLACKCORE' }] });
      if (query === 'fetchDeviceTypes') return Promise.resolve({ success: true, rows: [{ id: 1, name: 'SERVER' }] });
      return Promise.resolve({ success: true, rows: [], rowCount: 1 });
    });
    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const openEditor = async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, role: 'ADMIN' }, setAuthUser: vi.fn() }}>
            <DeviceList />
          </RoleContext.Provider>
        </MemoryRouter>
      </ThemeProvider>
    );
    await userEvent.type(await screen.findByPlaceholderText(/快速搜尋/), 'DEV-1');
    await waitFor(() => expect(within(document.querySelector('table')).getByText('DEV-1')).toBeInTheDocument());
    const menuBtn = screen.getAllByRole('button').find((b) => b.className?.includes('action-menu-btn'));
    await userEvent.click(menuBtn);
    await userEvent.click(await screen.findByText(/編輯詳細資訊/));
    return screen.findByPlaceholderText(/輸入或貼上硬體序號/);
  };

  it('一個類型一行，類型寫在最前面並標出幾個', async () => {
    const input = await openEditor();
    // 等可掛載清單讀進來，序號才查得到類型
    await waitFor(() => expect(namedQueryMock).toHaveBeenCalledWith('fetchAvailableHardwares'));
    fireEvent.change(input, { target: { value: 'RAM-2, NIC-1, CPU-1, RAM-1, NOPE-1' } });

    const box = await screen.findByTestId('mounted-hw-groups');
    expect(box).toHaveTextContent('已設定 (5):');
    const rows = [...box.querySelectorAll('[data-testid^="mounted-hw-group-"]')];
    expect(rows.map((r) => r.getAttribute('data-testid').replace('mounted-hw-group-', ''))).toEqual(['CPU', 'NIC', 'RAM', UNREGISTERED]);

    const ram = screen.getByTestId('mounted-hw-group-RAM');
    expect(ram.firstElementChild).toHaveTextContent('RAM ×2');
    expect(ram).toHaveTextContent('RAM-2');
    expect(ram).toHaveTextContent('RAM-1');
    expect(ram).not.toHaveTextContent('NIC-1');
    expect(screen.getByTestId(`mounted-hw-group-${UNREGISTERED}`)).toHaveTextContent('NOPE-1');
  });

  it('按序號旁的 ✕ 移除後，那一類型少一個', async () => {
    const input = await openEditor();
    await waitFor(() => expect(namedQueryMock).toHaveBeenCalledWith('fetchAvailableHardwares'));
    fireEvent.change(input, { target: { value: 'RAM-1, RAM-2' } });
    const ram = await screen.findByTestId('mounted-hw-group-RAM');
    // 標籤裡第一個圖示是硬體圖示，最後一個是 ✕
    const chip = within(ram).getByText('RAM-1').parentElement;
    const icons = chip.querySelectorAll('svg');
    fireEvent.click(icons[icons.length - 1]);
    await waitFor(() => expect(screen.getByTestId('mounted-hw-group-RAM').firstElementChild).toHaveTextContent('RAM ×1'));
    expect(input).toHaveValue('RAM-2');
  });
});

describe('設備列表的搭載硬體欄', () => {
  const DEVICE = {
    id: 1, sn: 'DEV-1', status: 'ACTIVE', ownership: 'FOR_SALE', item_master_id: 5,
    brand: 'BLACKCORE', type: 'SERVER', model: '3122-SM', specification: '26C', unit: '台', custom_attributes: {},
    components: [
      { sn: 'NIC-1', brand: 'AMD', model: 'X2522', type: 'NIC' },
      { sn: 'RAM-1', brand: 'V-COLOR', model: 'PC5', type: 'RAM' },
      { sn: 'NIC-2', brand: 'AMD', model: 'X2522', type: 'NIC' },
      { sn: 'CPU-1', brand: 'INTEL', model: '285K', type: 'CPU' },
      { sn: 'ODD-1', brand: '', model: '', type: '' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    const namedQuery = vi.fn(async (query) => {
      if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') return { success: true, rows: [{ ...DEVICE }] };
      return { success: true, rows: [], rowCount: 1 };
    });
    window.electronAPI = {
      namedQuery, runTransaction: createRunTransactionMock(namedQuery), getDashboardStats: vi.fn(), saveFile: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  it('展開後一個類型一行，類型與數量在最前面', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, role: 'ADMIN' }, setAuthUser: vi.fn() }}>
            <DeviceList />
          </RoleContext.Provider>
        </MemoryRouter>
      </ThemeProvider>
    );
    // 列表要先搜尋才會列出這台
    await userEvent.type(await screen.findByPlaceholderText(/快速搜尋/), 'DEV-1');
    await waitFor(() => expect(within(document.querySelector('table')).getByText('DEV-1')).toBeInTheDocument());
    await userEvent.click(await screen.findByRole('button', { name: /搭載硬體 \(5\)/ }));
    const box = await screen.findByTestId('device-components-1');
    const rows = [...box.children].map((r) => r.textContent);
    expect(rows).toEqual([
      'CPU ×1INTEL 285K (CPU-1)',
      'NIC ×2AMD X2522 (NIC-1)AMD X2522 (NIC-2)',
      'RAM ×1V-COLOR PC5 (RAM-1)',
      `${UNREGISTERED} ×1ODD-1`,
    ]);
    // 同類型的第二個放在第一個底下，不接在同一行，欄位才不會被撐得很寬
    const list = screen.getByTestId('device-components-1-NIC').lastElementChild;
    expect(list.style.flexDirection).toBe('column');
    expect([...list.children].map((c) => c.textContent)).toEqual(['AMD X2522 (NIC-1)', 'AMD X2522 (NIC-2)']);
  });
});

describe('設備列表的搭載耗材：跟搭載硬體一樣可以展開', () => {
  const CONSUMABLES = [
    { type: 'POWER CABLE', brand: '元景資訊', model: 'C13 CABLE', quantity: 1 },
    { type: 'GBIC', brand: 'METECH', model: '10G-LR', quantity: 2 },
    { type: 'GBIC', brand: 'ARISTA', model: '10G-SR', quantity: 3 },
    { type: '', brand: 'ACME', model: 'CLIP', quantity: 1 },
  ];

  it('依類型分組，類型後面是數量加總；沒有類型的放未分類', () => {
    const groups = groupMountedConsumablesByType(CONSUMABLES);
    expect(groups.map((g) => [g.type, g.total, g.items.length])).toEqual([
      ['GBIC', 5, 2], ['POWER CABLE', 1, 1], [UNTYPED, 1, 1],
    ]);
    expect(groupMountedConsumablesByType(null)).toEqual([]);
  });

  const renderWith = async (device) => {
    const namedQuery = vi.fn(async (query) => {
      if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') return { success: true, rows: [device] };
      return { success: true, rows: [], rowCount: 1 };
    });
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery, runTransaction: createRunTransactionMock(namedQuery), getDashboardStats: vi.fn(), saveFile: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
    render(
      <ThemeProvider>
        <MemoryRouter>
          <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, role: 'ADMIN' }, setAuthUser: vi.fn() }}>
            <DeviceList />
          </RoleContext.Provider>
        </MemoryRouter>
      </ThemeProvider>
    );
    await userEvent.type(await screen.findByPlaceholderText(/快速搜尋/, {}, { timeout: 5000 }), device.sn);
    await waitFor(() => expect(within(document.querySelector('table')).getByText(device.sn)).toBeInTheDocument());
  };
  const BASE = {
    id: 2, sn: 'DEV-2', status: 'ACTIVE', ownership: 'FOR_SALE', item_master_id: 5,
    brand: 'BLACKCORE', type: 'SERVER', model: '3122-SM', specification: '26C', unit: '台', custom_attributes: {},
  };

  it('欄位名稱改成「搭載硬體/耗材」', async () => {
    await renderWith({ ...BASE, components: [], lab_consumables: CONSUMABLES });
    expect(screen.getByRole('columnheader', { name: '搭載硬體/耗材' })).toBeInTheDocument();
  });

  it('先只顯示件數（數量加總），點了才展開，一個類型一行', async () => {
    await renderWith({ ...BASE, components: [{ sn: 'NIC-1', brand: 'AMD', model: 'X2522', type: 'NIC' }], lab_consumables: CONSUMABLES });
    expect(screen.getByRole('button', { name: /搭載硬體 \(1\)/ })).toBeInTheDocument();
    const chip = screen.getByRole('button', { name: /搭載耗材 \(7\)/ });
    // 預設收合
    expect(screen.queryByTestId('device-mounted-consumables-2')).toBeNull();

    await userEvent.click(chip);
    const box = await screen.findByTestId('device-mounted-consumables-2');
    expect([...box.children].map((r) => r.textContent)).toEqual([
      'GBIC ×5METECH 10G-LR ×2ARISTA 10G-SR ×3',
      'POWER CABLE ×1元景資訊 C13 CABLE ×1',
      `${UNTYPED} ×1ACME CLIP ×1`,
    ]);
    // 同類型好幾種時一種一行
    expect(screen.getByTestId('device-mounted-consumables-2-GBIC').lastElementChild.style.flexDirection).toBe('column');
    // 展開耗材不會連搭載硬體一起展開
    expect(screen.queryByTestId('device-components-2')).toBeNull();

    await userEvent.click(chip);
    expect(screen.queryByTestId('device-mounted-consumables-2')).toBeNull();
  });

  it('只有耗材、沒有搭載硬體：只顯示搭載耗材，不顯示「-」', async () => {
    await renderWith({ ...BASE, components: [], lab_consumables: [CONSUMABLES[0]] });
    const cell = screen.getByRole('button', { name: /搭載耗材 \(1\)/ }).closest('td');
    expect(within(cell).queryByText('-')).toBeNull();
    expect(within(cell).queryByRole('button', { name: /搭載硬體/ })).toBeNull();
  });
});
