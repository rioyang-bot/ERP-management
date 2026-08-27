import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeviceList from '../pages/DeviceList';
import HwList from '../pages/HwList';

describe('設備與硬體列表資產歸屬 (公司資產 ↔ 一般銷售) 切換測試', () => {
  const namedQueryMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    namedQueryMock.mockClear();
    window.confirm = vi.fn(() => true);

    window.electronAPI = {
      namedQuery: namedQueryMock,
      authLogin: vi.fn(),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn()
    };
  });

  it('DeviceList 應支援從「公司資產」轉為「一般銷售」之操作選單與更新', async () => {
    const mockDevice = {
      id: 101,
      item_master_id: 1,
      brand: 'BlackCore',
      type: '24C',
      model: 'BCHFT-1PC',
      sn: 'BC-TEST-001',
      ownership: 'COMPANY',
      status: 'ACTIVE',
      specification: 'Test Spec',
      client: 'METECH',
      location: 'HQ',
      installed_date: null,
      customer_warranty_expire: null,
      system_date: null,
      warranty_expire: null,
      custom_attributes: {}
    };

    namedQueryMock.mockImplementation((query, params) => {
      if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') {
        return Promise.resolve({ success: true, rows: [mockDevice] });
      }
      if (query === 'fetchPartners') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: 'METECH' }] });
      }
      if (query === 'fetchAllProjects') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'fetchSystemSetting') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'updateAssetOwnership') {
        return Promise.resolve({ success: true, rowCount: 1 });
      }
      if (query === 'insertAuditLog') {
        return Promise.resolve({ success: true, rows: [] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    render(
      <MemoryRouter initialEntries={['/devices/list?brand=BlackCore']}>
        <DeviceList />
      </MemoryRouter>
    );

    // 等待資料載入完成，確認顯示公司資產標籤
    await waitFor(() => {
      expect(screen.getByText('BC-TEST-001')).toBeInTheDocument();
      expect(screen.getByText('公司資產')).toBeInTheDocument();
    });

    // 點擊該列的操作選單按鈕
    const row = screen.getByText('BC-TEST-001').closest('tr');
    const moreBtn = row.querySelector('td:last-child button');
    expect(moreBtn).not.toBeNull();
    fireEvent.click(moreBtn);

    // 確認選單內有「轉為一般銷售」按鈕
    await waitFor(() => {
      expect(screen.getByText('轉為一般銷售')).toBeInTheDocument();
    });

    // 點擊「轉為一般銷售」
    fireEvent.click(screen.getByText('轉為一般銷售'));

    // 驗證呼叫 updateAssetOwnership 且傳入 FOR_SALE 與資產 id 101
    await waitFor(() => {
      expect(namedQueryMock).toHaveBeenCalledWith('updateAssetOwnership', ['FOR_SALE', 101]);
    });
  });

  it('HwList 應支援從「公司資產」轉為「一般銷售」之操作選單與更新', async () => {
    const mockHw = {
      id: 202,
      item_master_id: 2,
      brand: 'Mellanox',
      type: 'NIC',
      model: 'ConnectX-5',
      sn: 'MLX-TEST-002',
      ownership: 'COMPANY',
      status: 'ACTIVE',
      specification: '25GbE Dual Port',
      client: 'METECH',
      location: 'Lab',
      custom_attributes: {}
    };

    namedQueryMock.mockImplementation((query, params) => {
      if (query === 'fetchNicList' || query === 'fetchNicListByType') {
        return Promise.resolve({ success: true, rows: [mockHw] });
      }
      if (query === 'fetchPartners') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: 'METECH' }] });
      }
      if (query === 'fetchAllProjects') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'fetchSystemSetting') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'updateAssetOwnership') {
        return Promise.resolve({ success: true, rowCount: 1 });
      }
      if (query === 'insertAuditLog') {
        return Promise.resolve({ success: true, rows: [] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    render(
      <MemoryRouter initialEntries={['/hardware/list?type=NIC']}>
        <HwList />
      </MemoryRouter>
    );

    // 等待硬體資料載入完成，確認顯示公司資產標籤
    await waitFor(() => {
      expect(screen.getByText('MLX-TEST-002')).toBeInTheDocument();
      expect(screen.getByText('公司資產')).toBeInTheDocument();
    });

    // 點擊該列的操作選單按鈕
    const row = screen.getByText('MLX-TEST-002').closest('tr');
    const moreBtn = row.querySelector('td:last-child button');
    expect(moreBtn).not.toBeNull();
    fireEvent.click(moreBtn);

    // 確認選單內有「轉為一般銷售」按鈕
    await waitFor(() => {
      expect(screen.getByText('轉為一般銷售')).toBeInTheDocument();
    });

    // 點擊「轉為一般銷售」
    fireEvent.click(screen.getByText('轉為一般銷售'));

    // 驗證呼叫 updateAssetOwnership 且傳入 FOR_SALE 與資產 id 202
    await waitFor(() => {
      expect(namedQueryMock).toHaveBeenCalledWith('updateAssetOwnership', ['FOR_SALE', 202]);
    });
  });
});
