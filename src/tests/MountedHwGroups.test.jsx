import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeviceList from '../pages/DeviceList';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { RoleContext } from '../context/RoleContext';
import { createRunTransactionMock } from './helpers/mockTransaction';
import { groupMountedHwByType, UNTYPED, UNREGISTERED } from '../utils/mountedHwGroups';

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
