import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeviceList from '../pages/DeviceList';
import HwList from '../pages/HwList';

describe('設備與硬體列表編輯詳細資訊中規格欄位不可變動 (Specification Locked) 測試', () => {
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

  it('DeviceList 編輯詳細資訊時，規格欄位應呈現鎖定/唯讀狀態，且儲存時不覆寫主檔規格', async () => {
    const mockDevice = {
      id: 101,
      item_master_id: 55,
      brand: 'BlackCore',
      type: '24C',
      model: 'BCHFT-1PC',
      sn: 'BC-TEST-SPEC-001',
      ownership: 'FOR_SALE',
      status: 'ACTIVE',
      specification: 'Fixed Device Specification 64G',
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
      if (query === 'fetchCustomers' || query === 'fetchPartners') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: 'METECH' }] });
      }
      if (query === 'fetchAllProjects' || query === 'fetchActiveProjects') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'fetchSystemSetting' || query === 'getSystemSetting') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'updateAssetDetails') {
        return Promise.resolve({ success: true });
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

    await waitFor(() => {
      expect(screen.getByText('BC-TEST-SPEC-001')).toBeInTheDocument();
    });

    // 展開操作選單並點擊「編輯詳細資訊」
    const row = screen.getByText('BC-TEST-SPEC-001').closest('tr');
    const moreBtn = row.querySelector('td:last-child button');
    fireEvent.click(moreBtn);

    const editBtn = await screen.findByText(/編輯詳細資訊/i);
    fireEvent.click(editBtn);

    // 驗證彈窗中標題與規格鎖定狀態
    expect(screen.getByText('修改詳細設備資訊')).toBeInTheDocument();
    expect(screen.getByText(/規格 \(Specification\) \(鎖定\)/i)).toBeInTheDocument();

    const specInput = screen.getByDisplayValue('Fixed Device Specification 64G');
    expect(specInput).toBeInTheDocument();
    expect(specInput).toBeDisabled();
    expect(specInput).toHaveAttribute('readonly');

    // 點擊儲存變更
    const saveBtn = screen.getByText(/儲存變更/i);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(namedQueryMock).toHaveBeenCalledWith('updateAssetDetails', expect.any(Array));
    });

    // 驗證並未呼叫 updateItemMasterSpecs
    const calls = namedQueryMock.mock.calls.map(c => c[0]);
    expect(calls).not.toContain('updateItemMasterSpecs');
  });

  it('HwList 編輯詳細資訊時，硬體規格欄位應呈現鎖定/唯讀狀態，且儲存時不覆寫主檔規格', async () => {
    const mockHw = {
      id: 202,
      item_master_id: 88,
      brand: 'Intel',
      type: 'NIC 網卡',
      model: 'E810-XXVDA2',
      sn: 'HW-TEST-SPEC-001',
      ownership: 'FOR_SALE',
      status: 'ACTIVE',
      specification: 'Dual Port 25GbE PCIe 4.0',
      client: 'METECH',
      location: 'LAB1',
      hostname: '',
      custom_attributes: {}
    };

    namedQueryMock.mockImplementation((query, params) => {
      if (query === 'fetchNicList' || query === 'fetchNicListByType') {
        return Promise.resolve({ success: true, rows: [mockHw] });
      }
      if (query === 'fetchCustomers') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: 'METECH' }] });
      }
      if (query === 'fetchActiveProjects') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'getSystemSetting') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'updateNicDetails') {
        return Promise.resolve({ success: true });
      }
      if (query === 'insertAuditLog') {
        return Promise.resolve({ success: true, rows: [] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    render(
      <MemoryRouter initialEntries={['/hardware/list?type=NIC 網卡']}>
        <HwList />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('HW-TEST-SPEC-001')).toBeInTheDocument();
    });

    // 點擊操作選單按鈕
    const row = screen.getByText('HW-TEST-SPEC-001').closest('tr');
    const moreBtn = row.querySelector('td:last-child button');
    fireEvent.click(moreBtn);

    const editBtn = await screen.findByText(/編輯詳細資訊/i);
    fireEvent.click(editBtn);

    // 驗證彈窗與硬體規格鎖定狀態
    expect(screen.getByText('修改硬體資訊')).toBeInTheDocument();
    expect(screen.getByText(/規格 \(Specification\) \(鎖定\)/i)).toBeInTheDocument();

    const specInput = screen.getByDisplayValue('Dual Port 25GbE PCIe 4.0');
    expect(specInput).toBeInTheDocument();
    expect(specInput).toBeDisabled();
    expect(specInput).toHaveAttribute('readonly');

    // 點擊儲存變更
    const saveBtn = screen.getByText(/儲存變更/i);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(namedQueryMock).toHaveBeenCalledWith('updateNicDetails', expect.any(Array));
    });

    // 驗證並未呼叫 updateItemMasterSpecs
    const calls = namedQueryMock.mock.calls.map(c => c[0]);
    expect(calls).not.toContain('updateItemMasterSpecs');
  });
});
