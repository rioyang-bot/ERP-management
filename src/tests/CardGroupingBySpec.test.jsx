import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeviceList from '../pages/DeviceList';
import HwList from '../pages/HwList';

describe('設備與硬體卡片依「廠牌+類型+型號+規格」聚合測試', () => {
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

  it('DeviceList 相同型號但不同規格應獨立生成不同卡片，相同規格則合併統計', async () => {
    render(
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('設備列表 (Device List)')).toBeInTheDocument();
    });

    // 驗證規格出現在卡片上
    expect(screen.getByText('64G RAM / 2TB SSD')).toBeInTheDocument();
    expect(screen.getByText('128G RAM / 4TB SSD')).toBeInTheDocument();
    expect(screen.getByText('32G RAM')).toBeInTheDocument();

    // 總共應有 3 張卡片 (Dell R750 64G, Dell R750 128G, HP DL380 32G)
    const dellR750Titles = screen.getAllByText('伺服器 - R750');
    expect(dellR750Titles.length).toBe(2);
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
});
