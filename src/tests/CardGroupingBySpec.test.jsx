import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeviceList from '../pages/DeviceList';
import HwList from '../pages/HwList';
import ConsumableList from '../pages/ConsumableList';

describe('設備、硬體與耗材卡片依「廠牌+類型+型號+規格」聚合測試', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      if (query === 'fetchAssetsList') {
        return Promise.resolve({
          success: true,
          rows: [
            { id: 1, sn: 'SN001', brand: 'Dell', type: '伺服器', model: 'R750', specification: '64G RAM / 2TB SSD', status: 'ACTIVE' },
            { id: 2, sn: 'SN002', brand: 'Dell', type: '伺服器', model: 'R750', specification: '64G RAM / 2TB SSD', status: 'ACTIVE' },
            { id: 3, sn: 'SN003', brand: 'Dell', type: '伺服器', model: 'R750', specification: '128G RAM / 4TB SSD', status: 'ACTIVE' },
            { id: 4, sn: 'SN004', brand: 'HP', type: '伺服器', model: 'DL380', specification: '32G RAM', status: 'ACTIVE' }
          ]
        });
      }
      if (query === 'fetchNicList') {
        return Promise.resolve({
          success: true,
          rows: [
            { id: 101, sn: 'HW001', brand: 'Intel', type: 'NIC 網卡', model: 'E810', specification: 'Dual Port 25GbE', status: 'ACTIVE' },
            { id: 102, sn: 'HW002', brand: 'Intel', type: 'NIC 網卡', model: 'E810', specification: 'Dual Port 25GbE', status: 'ACTIVE' },
            { id: 103, sn: 'HW003', brand: 'Intel', type: 'NIC 網卡', model: 'E810', specification: 'Quad Port 25GbE', status: 'ACTIVE' }
          ]
        });
      }
      if (query === 'fetchCustomers' || query === 'fetchActiveProjects') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'getSystemSetting') {
        return Promise.resolve({ success: true, rows: [] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  });

  it('DeviceList 相同廠牌、類型、型號底下，只要規格不同應獨立生成不同卡片，相同規格則合併統計', async () => {
    render(
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('設備列表 (Device List)')).toBeInTheDocument();
    });

    // 驗證規格出現在設備卡片上
    expect(screen.getByText('64G RAM / 2TB SSD')).toBeInTheDocument();
    expect(screen.getByText('128G RAM / 4TB SSD')).toBeInTheDocument();
    expect(screen.getByText('32G RAM')).toBeInTheDocument();

    // Dell R750 應產生 2 張卡片 (64G 共 2 台, 128G 共 1 台)
    expect(screen.getByText('共 2 台')).toBeInTheDocument();
    const countOne = screen.getAllByText('共 1 台');
    expect(countOne.length).toBe(2); // Dell 128G 與 HP 32G 各 1 台
  });

  it('HwList 相同型號但不同規格應獨立生成不同卡片，相同規格則合併統計', async () => {
    render(
      <MemoryRouter>
        <HwList />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('硬體列表 (Hardware List)')).toBeInTheDocument();
    });

    // 驗證規格出現在硬體卡片上
    expect(screen.getByText('Dual Port 25GbE')).toBeInTheDocument();
    expect(screen.getByText('Quad Port 25GbE')).toBeInTheDocument();

    // Intel E810 應產生 2 張卡片 (Dual Port 與 Quad Port)
    const intelE810Titles = screen.getAllByText('NIC 網卡 - E810');
    expect(intelE810Titles.length).toBe(2);
  });

  it('DeviceList 點擊「依型號」切換時，同一型號應合併為單一卡片', async () => {
    render(
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('設備列表 (Device List)')).toBeInTheDocument();
    });

    const modelBtn = screen.getByRole('button', { name: /依型號/ });
    await userEvent.click(modelBtn);

    // 切換為型號聚合後，Dell R750 應合併為 1 張卡片，共 3 台
    expect(screen.getByText('共 3 台')).toBeInTheDocument();
    expect(localStorage.getItem('device_aggregation_mode')).toBe('MODEL');
  });

  it('HwList 點擊「依廠牌」切換時，同一廠牌應合併為單一卡片', async () => {
    render(
      <MemoryRouter>
        <HwList />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('硬體列表 (Hardware List)')).toBeInTheDocument();
    });

    const brandBtn = screen.getByRole('button', { name: /依廠牌/ });
    await userEvent.click(brandBtn);

    // 切換為廠牌聚合後，Intel 應合併為 1 張卡片，共 3 個
    expect(screen.getByText('共 3 個')).toBeInTheDocument();
    expect(localStorage.getItem('hw_aggregation_mode')).toBe('BRAND');
  });

  it('ConsumableList 依「類型 (Type)」聚合卡片，統計各類型的廠牌數、型號數與庫存指標', async () => {
    window.electronAPI.namedQuery.mockImplementation((query) => {
      if (query === 'fetchConsumablesList') {
        return Promise.resolve({
          success: true,
          rows: [
            { id: 201, brand: 'Cisco', type: '線材', model: 'SFP-10G-SR', specification: '3M 光纖', stock_qty: 10, lab_qty: 2, safety_stock: 5 },
            { id: 202, brand: 'Cisco', type: '線材', model: 'SFP-10G-SR', specification: '5M 光纖', stock_qty: 5, lab_qty: 0, safety_stock: 2 },
            { id: 203, brand: 'Cisco', type: '模組', model: 'GLC-TE', specification: 'RJ-45 1G', stock_qty: 20, lab_qty: 4, safety_stock: 5 },
            { id: 204, brand: 'Mellanox', type: '線材', model: 'MCP1600', specification: '100G 2M', stock_qty: 8, lab_qty: 1, safety_stock: 10 }
          ]
        });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    render(
      <MemoryRouter>
        <ConsumableList />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('耗材列表 (Consumable List)')).toBeInTheDocument();
    });

    // 驗證類型聚合卡片
    expect(screen.getByText('線材')).toBeInTheDocument();
    expect(screen.getByText('模組')).toBeInTheDocument();

    // 驗證統計數字 (線材共 26 個，模組共 24 個)
    expect(screen.getByText('共 26 個')).toBeInTheDocument(); // 12 + 5 + 9
    expect(screen.getByText('共 24 個')).toBeInTheDocument(); // 24
    expect(screen.getByText('2 個廠牌 · 2 款型號')).toBeInTheDocument();
    expect(screen.getByText('1 個廠牌 · 1 款型號')).toBeInTheDocument();
  });

  it('ConsumableList 點擊類型卡片鎖定過濾清單，再次點擊取消鎖定，並支援清除類型篩選按鈕', async () => {
    window.electronAPI.namedQuery.mockImplementation((query) => {
      if (query === 'fetchConsumablesList') {
        return Promise.resolve({
          success: true,
          rows: [
            { id: 201, brand: 'Cisco', type: '線材', model: 'SFP-10G-SR', specification: '3M 光纖', stock_qty: 10, lab_qty: 2, safety_stock: 5 },
            { id: 202, brand: 'Cisco', type: '模組', model: 'GLC-TE', specification: 'RJ-45 1G', stock_qty: 20, lab_qty: 4, safety_stock: 5 }
          ]
        });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    render(
      <MemoryRouter>
        <ConsumableList />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('耗材列表 (Consumable List)')).toBeInTheDocument();
    });

    // 點擊「線材」卡片
    const wireCard = screen.getByText('線材').closest('div[draggable="true"]');
    await userEvent.click(wireCard);

    // 出現鎖定類型橫條
    await waitFor(() => {
      expect(screen.getByText(/目前鎖定類型：/)).toBeInTheDocument();
      const lockedLabels = screen.getAllByText('線材');
      expect(lockedLabels.length).toBeGreaterThan(0);
    });

    // 清單只出現 3M 光纖，不出現 模組 (GLC-TE)
    expect(screen.getByRole('cell', { name: '3M 光纖' })).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'RJ-45 1G' })).not.toBeInTheDocument();

    // 點選「清除類型篩選」按鈕
    const clearBtn = screen.getByRole('button', { name: /清除類型篩選/ });
    await userEvent.click(clearBtn);

    // 鎖定類型橫條消失
    expect(screen.queryByText(/目前鎖定類型：/)).not.toBeInTheDocument();
  });
});
