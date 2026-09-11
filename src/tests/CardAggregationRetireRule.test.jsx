import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeviceList from '../pages/DeviceList';
import HwList from '../pages/HwList';

// Mock electronAPI
const mockElectronAPI = {
  namedQuery: vi.fn(),
  exportCustomerAssetsLedger: vi.fn(),
  exportMaintenanceBillingExcel: vi.fn(),
  exportMaintenanceLedgerExcel: vi.fn(),
  exportSingleAssetLedgerExcel: vi.fn(),
  exportComponentLedgerExcel: vi.fn(),
  exportExcel: vi.fn()
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.electronAPI = mockElectronAPI;
  window.alert = vi.fn();
  window.confirm = vi.fn(() => true);
});

describe('卡片聚合規則與汰舊區聯動測試 (Card Aggregation & Retire Rules)', () => {
  const mockDevices = [
    {
      id: 1,
      sn: 'ASUS-SN-001',
      brand: 'ASUS',
      type: '伺服器',
      model: 'RS720',
      specification: '24C 64G',
      status: 'ACTIVE',
      client: '客戶A',
      components: []
    },
    {
      id: 2,
      sn: 'ASUS-SN-002',
      brand: 'ASUS',
      type: '伺服器',
      model: 'RS720',
      specification: '32C 128G',
      status: 'ACTIVE',
      client: '客戶B',
      components: []
    },
    {
      id: 3,
      sn: 'DELL-SN-001',
      brand: 'DELL',
      type: '伺服器',
      model: 'R740',
      specification: '16C 32G',
      status: 'ACTIVE',
      client: '客戶C',
      components: []
    }
  ];

  it('DeviceList: 在規格或型號模式下將一項卡片移至汰舊區，改為依廠牌時，汰舊區項目不應被加入使用中卡片計算', async () => {
    mockElectronAPI.namedQuery.mockImplementation((queryName) => {
      if (queryName === 'fetchAssetsList' || queryName === 'fetchAssetsListByBrand') {
        return Promise.resolve({ success: true, rows: mockDevices });
      }
      if (queryName === 'fetchCustomers' || queryName === 'fetchActiveProjects') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (queryName === 'getSystemSetting') {
        return Promise.resolve({ success: true, rows: [] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    // 初始進入：依規格 (SPEC)
    localStorage.setItem('device_aggregation_mode', 'SPEC');
    // 先將 ASUS RS720 24C 64G 設為已汰舊
    localStorage.setItem('device_list_retired_keys', JSON.stringify(['ASUS - 伺服器 - RS720 - 24C 64G']));

    render(
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    );

    // 等待統計卡片載入完成（DeviceList 初始需點選卡片或篩選才會展開詳細清單）
    await waitFor(() => {
      expect(screen.getByText(/汰舊 \/ 停用區塊/i)).toBeInTheDocument();
    });

    // 切換為「依廠牌」模式
    const brandModeBtn = screen.getByRole('button', { name: /依廠牌/i });
    fireEvent.click(brandModeBtn);

    // 關鍵驗證：
    // ASUS 共有 2 台，但其中 1 台規格在汰舊區。
    // 在「依廠牌」聚合下，正常使用中的 ASUS 卡片應該只計算 1 台（在廠牌模式下不包含汰舊區的 1 台）
    // 汰舊區的 ASUS 卡片計算 1 台。
    // 兩張 ASUS 卡片各自顯示「共 1 台」，絕不可出現「共 2 台」！
    await waitFor(() => {
      expect(screen.queryByText('共 2 台')).not.toBeInTheDocument();
      const oneUnitBadges = screen.getAllByText('共 1 台');
      // ASUS active: 1, DELL active: 1, ASUS retired: 1 => 共有 3 張卡片顯示「共 1 台」
      expect(oneUnitBadges.length).toBe(3);
    });

    // 點擊使用中的 ASUS 卡片（點擊第一個「共 1 台」卡片，對應使用中的 ASUS），應過濾出使用中的 ASUS (ASUS-SN-002)，不包含已汰舊的 ASUS-SN-001
    const oneUnitBadges = screen.getAllByText('共 1 台');
    fireEvent.click(oneUnitBadges[0]);

    await waitFor(() => {
      expect(screen.getByText('ASUS-SN-002')).toBeInTheDocument();
      expect(screen.queryByText('ASUS-SN-001')).not.toBeInTheDocument();
      expect(screen.queryByText('DELL-SN-001')).not.toBeInTheDocument();
    });
  });

  it('HwList: 在依規格模式將卡片移至汰舊區，改為依廠牌時，汰舊區項目不應被加入使用中卡片計算', async () => {
    const mockHw = [
      {
        id: 101,
        sn: 'HW-001',
        brand: 'Intel',
        type: '網卡',
        model: 'X520',
        specification: '10GbE SFP+',
        status: 'ACTIVE'
      },
      {
        id: 102,
        sn: 'HW-002',
        brand: 'Intel',
        type: '網卡',
        model: 'X520',
        specification: '10GbE RJ45',
        status: 'ACTIVE'
      }
    ];

    mockElectronAPI.namedQuery.mockImplementation((queryName) => {
      if (queryName === 'fetchNicList' || queryName === 'fetchNicListByType') {
        return Promise.resolve({ success: true, rows: mockHw });
      }
      if (queryName === 'fetchCustomers' || queryName === 'fetchActiveProjects') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (queryName === 'getSystemSetting') {
        return Promise.resolve({ success: true, rows: [] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    localStorage.setItem('hw_aggregation_mode', 'SPEC');
    // 將 Intel X520 10GbE SFP+ 移至汰舊區
    localStorage.setItem('hw_list_retired_keys', JSON.stringify(['Intel - 網卡 - X520 - 10GbE SFP+']));

    render(
      <MemoryRouter>
        <HwList />
      </MemoryRouter>
    );

    // 檢查卡片出現
    await waitFor(() => {
      expect(screen.getByText(/汰舊 \/ 停用區塊/i)).toBeInTheDocument();
    });

    // 切換為「依廠牌」模式
    const brandModeBtn = screen.getByRole('button', { name: /依廠牌/i });
    fireEvent.click(brandModeBtn);

    // 關鍵驗證：使用中卡片與汰舊區卡片皆為 1 個，不可合併成「共 2 個」
    await waitFor(() => {
      expect(screen.queryByText('共 2 個')).not.toBeInTheDocument();
      const oneCountBadges = screen.getAllByText('共 1 個');
      expect(oneCountBadges.length).toBe(2);
    });

    // 點擊使用中 Intel 卡片（點擊第一個「共 1 個」統計徽章，對應使用中的 Intel 卡片）
    // 下方清單應只出現 HW-002 (active)，不出現 HW-001 (retired)
    const oneCountBadges = screen.getAllByText('共 1 個');
    fireEvent.click(oneCountBadges[0]);

    await waitFor(() => {
      expect(screen.getByText('HW-002')).toBeInTheDocument();
      expect(screen.queryByText('HW-001')).not.toBeInTheDocument();
    });
  });

  it('DeviceList & HwList: 點選卡片時其他卡片會被隱藏，再點選同一張卡片才會出現全部卡片', async () => {
    mockElectronAPI.namedQuery.mockImplementation((queryName) => {
      if (queryName === 'fetchAssetsList' || queryName === 'fetchAssetsListByBrand') {
        return Promise.resolve({ success: true, rows: mockDevices });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    localStorage.setItem('device_aggregation_mode', 'BRAND');
    localStorage.removeItem('device_list_retired_keys');

    const { unmount } = render(
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    );

    // 初始狀態：應同時看到 ASUS 與 DELL 卡片
    await waitFor(() => {
      expect(screen.getByText('ASUS')).toBeInTheDocument();
      expect(screen.getByText('DELL')).toBeInTheDocument();
    });

    // 點選 ASUS 卡片
    const asusCard = screen.getByText('ASUS');
    fireEvent.click(asusCard);

    // 驗證：ASUS 卡片仍存在，但 DELL 卡片應被隱藏
    await waitFor(() => {
      const dellEls = screen.queryAllByText((content, element) => {
        return content && content.includes('DELL') && element.tagName !== 'BUTTON';
      });
      expect(screen.getAllByText(/ASUS/).length).toBeGreaterThan(0);
      expect(dellEls.length).toBe(0);
    });

    // 再次點選 ASUS 卡片（點擊卡片頂部的 ASUS 文字）
    fireEvent.click(screen.getAllByText(/ASUS/)[0]);

    // 驗證：取消選取後，全部卡片（ASUS 與 DELL）重新出現
    await waitFor(() => {
      const dellEls = screen.queryAllByText((content, element) => {
        return content && content.includes('DELL') && element.tagName !== 'BUTTON';
      });
      expect(screen.getAllByText(/ASUS/).length).toBeGreaterThan(0);
      expect(dellEls.length).toBeGreaterThan(0);
    });

    unmount();
  });
});

