import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeviceList from '../pages/DeviceList';
import HwList from '../pages/HwList';

describe('設備與硬體列表編輯詳細資訊中型號與規格欄位可自由修改測試', () => {
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

  it('DeviceList 編輯詳細資訊時，型號與規格欄位可編輯，儲存時能同步更新品項主檔', async () => {
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
      if (query === 'findItemMaster') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'countAssetsByMasterId') {
        return Promise.resolve({ success: true, rows: [{ count: 1 }] });
      }
      if (query === 'updateItemMasterSpecs') {
        return Promise.resolve({ success: true });
      }
      if (query === 'insertDeviceModel') {
        return Promise.resolve({ success: true });
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

    // 驗證彈窗中標題與型號/規格可編輯
    expect(screen.getByText('修改詳細設備資訊')).toBeInTheDocument();
    expect(screen.getByText(/^型號 \(Model\) \*/i)).toBeInTheDocument();
    expect(screen.getByText(/規格 \(Specification\)/i)).toBeInTheDocument();

    const specInput = screen.getByDisplayValue('Fixed Device Specification 64G');
    expect(specInput).toBeInTheDocument();
    expect(specInput).not.toBeDisabled();

    const modelInput = screen.getByDisplayValue('BCHFT-1PC');
    expect(modelInput).toBeInTheDocument();
    expect(modelInput).not.toBeDisabled();

    // 變更規格與型號
    fireEvent.change(specInput, { target: { value: 'Updated Spec 128G' } });
    fireEvent.change(modelInput, { target: { value: 'BCHFT-2PC' } });

    // 點擊儲存變更
    const saveBtn = screen.getByText(/儲存變更/i);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(namedQueryMock).toHaveBeenCalledWith('updateItemMasterSpecs', ['Updated Spec 128G', 'BCHFT-2PC', 55]);
      expect(namedQueryMock).toHaveBeenCalledWith('updateAssetDetails', expect.any(Array));
    });
  });

  it('HwList 編輯詳細資訊時，型號與規格欄位可編輯，儲存時能同步更新品項主檔', async () => {
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
      if (query === 'findItemMaster') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'countAssetsByMasterId') {
        return Promise.resolve({ success: true, rows: [{ count: 1 }] });
      }
      if (query === 'updateItemMasterSpecs') {
        return Promise.resolve({ success: true });
      }
      if (query === 'insertDeviceModel') {
        return Promise.resolve({ success: true });
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

    // 驗證彈窗與型號/規格欄位可編輯
    expect(screen.getByText('修改硬體資訊')).toBeInTheDocument();
    expect(screen.getByText(/^型號 \(Model\) \*/i)).toBeInTheDocument();
    expect(screen.getByText(/規格 \(Specification\)/i)).toBeInTheDocument();

    const specInput = screen.getByDisplayValue('Dual Port 25GbE PCIe 4.0');
    expect(specInput).toBeInTheDocument();
    expect(specInput).not.toBeDisabled();

    const modelInput = screen.getByDisplayValue('E810-XXVDA2');
    expect(modelInput).toBeInTheDocument();
    expect(modelInput).not.toBeDisabled();

    // 變更規格與型號
    fireEvent.change(specInput, { target: { value: 'Quad Port 25GbE PCIe 4.0' } });
    fireEvent.change(modelInput, { target: { value: 'E810-CQDA2' } });

    // 點擊儲存變更
    const saveBtn = screen.getByText(/儲存變更/i);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(namedQueryMock).toHaveBeenCalledWith('updateItemMasterSpecs', ['Quad Port 25GbE PCIe 4.0', 'E810-CQDA2', 88]);
      expect(namedQueryMock).toHaveBeenCalledWith('updateNicDetails', expect.any(Array));
    });
  });
});
