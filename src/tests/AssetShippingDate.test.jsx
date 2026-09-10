import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import DNList from '../pages/DNList';
import DeviceList from '../pages/DeviceList';
import HwList from '../pages/HwList';

describe('設備與硬體出貨日期 (shipping_date) 欄位與確認出貨自動回寫測試', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('在 DNList 確認出貨時，應呼叫 updateAssetStatusLocationAndShippingDateBySn 與 updateMountedHardwareShippingDate 寫入出貨日期', async () => {
    const executedQueries = [];

    window.electronAPI = {
      namedQuery: vi.fn(async (query, params) => {
        executedQueries.push({ query, params });
        if (query === 'fetchDNList') {
          return {
            success: true,
            rows: [
              {
                id: 1,
                request_no: 'DN-20260910-01',
                request_type: 'SALE',
                customer: '兆豐證券',
                shipping_date: '2026-09-15',
                status: 'PENDING',
                item_count: 1,
                creator_name: 'Admin',
                location: '台北總行'
              }
            ]
          };
        }
        if (query === 'fetchDNItems') {
          return {
            success: true,
            rows: [
              {
                id: 101,
                category_name: '設備',
                brand: 'Supermicro',
                model: 'SYS-1029P',
                sn: 'SRV-TEST-999',
                quantity: 1,
                location: '台北總行'
              }
            ]
          };
        }
        if (query === 'checkAssetActive') {
          return { success: true, rows: [{ status: 'ACTIVE' }] };
        }
        if (query === 'updateAssetStatusLocationAndInstalledDateBySn') {
          return { success: true };
        }
        if (query === 'updateMountedHardwareInstalledAndShippingDate') {
          return { success: true };
        }
        if (query === 'updateOutboundRequestStatus') {
          return { success: true };
        }
        return { success: true, rows: [] };
      })
    };

    window.confirm = vi.fn().mockReturnValue(true);
    window.alert = vi.fn();

    render(
      <BrowserRouter>
        <DNList />
      </BrowserRouter>
    );

    // 1. 等待出貨單載入
    await waitFor(() => {
      expect(screen.getByText('DN-20260910-01')).toBeInTheDocument();
    });

    // 2. 點擊檢視按鈕以打開 Modal
    const detailBtn = screen.getByLabelText('檢視');
    fireEvent.click(detailBtn);

    // 3. 等待 Modal 打開並顯示「確認出貨」按鈕
    await waitFor(() => {
      expect(screen.getByText('確認出貨')).toBeInTheDocument();
    });

    // 4. 點擊確認出貨
    const confirmBtn = screen.getByText('確認出貨');
    fireEvent.click(confirmBtn);

    // 5. 驗證 updateAssetStatusLocationAndInstalledDateBySn 是否以正確出貨日期寫入 installed_date
    await waitFor(() => {
      const assetUpdateCall = executedQueries.find(
        (q) => q.query === 'updateAssetStatusLocationAndInstalledDateBySn'
      );
      expect(assetUpdateCall).toBeDefined();
      expect(assetUpdateCall.params).toEqual(['SHIPPED', '台北總行', '2026-09-15', 'SRV-TEST-999']);
    });

    // 6. 驗證 updateMountedHardwareInstalledAndShippingDate 是否將掛載硬體一併同步更新
    const mountedUpdateCall = executedQueries.find(
      (q) => q.query === 'updateMountedHardwareInstalledAndShippingDate'
    );
    expect(mountedUpdateCall).toBeDefined();
    expect(mountedUpdateCall.params).toEqual(['2026-09-15', 'SRV-TEST-999']);
  });

  it('DeviceList 應呈現保固資訊 (P/S/W/C) 與安裝日期，不顯示獨立出貨日標籤', async () => {
    window.electronAPI = {
      namedQuery: vi.fn(async (query, params) => {
        if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') {
          return {
            success: true,
            rows: [
              {
                id: 50,
                item_master_id: 1,
                sn: 'DEV-TEST-001',
                brand: 'Dell',
                model: 'R740',
                status: 'SHIPPED',
                installed_date: '2026-09-15',
                system_date: '2026-09-10',
                warranty_expire: '2029-09-10',
                customer_warranty_expire: '2029-09-10',
                ownership: 'FOR_SALE'
              }
            ]
          };
        }
        if (query === 'fetchPartners') return { success: true, rows: [] };
        if (query === 'fetchProjects') return { success: true, rows: [] };
        if (query === 'getSystemSetting') return { success: true, rows: [] };
        return { success: true, rows: [] };
      })
    };

    render(
      <MemoryRouter initialEntries={['/devices?brand=Dell']}>
        <DeviceList />
      </MemoryRouter>
    );

    // 驗證表格中顯示安裝日期 P: 且標頭為 保固資訊 (P/S/W/C)，不再有獨立「出:」出貨日標籤
    await waitFor(() => {
      expect(screen.getByText('DEV-TEST-001')).toBeInTheDocument();
      expect(screen.getByText('保固資訊 (P/S/W/C)')).toBeInTheDocument();
      expect(screen.queryByTitle('出貨日期')).not.toBeInTheDocument();
    });
  });

  it('HwList 應能在搜尋關鍵字時顯示出貨日期欄位與資料', async () => {
    window.electronAPI = {
      namedQuery: vi.fn(async (query) => {
        if (query === 'fetchNicList' || query === 'fetchNicListByType') {
          return {
            success: true,
            rows: [
              {
                id: 88,
                item_master_id: 2,
                sn: 'HW-NIC-888',
                brand: 'Mellanox',
                model: 'CX4121A',
                type: '網卡',
                status: 'SHIPPED',
                shipping_date: '2026-09-15',
                ownership: 'FOR_SALE',
                custom_attributes: { order_source: 'PO-2026' }
              }
            ]
          };
        }
        if (query === 'fetchPartners') return { success: true, rows: [] };
        if (query === 'fetchProjects') return { success: true, rows: [] };
        if (query === 'getSystemSetting') return { success: true, rows: [] };
        return { success: true, rows: [] };
      })
    };

    render(
      <MemoryRouter initialEntries={['/hardware']}>
        <HwList />
      </MemoryRouter>
    );

    // 輸入搜尋字詞以進入 table 檢視
    const searchInput = await screen.findByPlaceholderText('搜尋...');
    fireEvent.change(searchInput, { target: { value: 'HW-NIC' } });

    await waitFor(() => {
      expect(screen.getByText('出貨日期')).toBeInTheDocument();
      expect(screen.getByText('HW-NIC-888')).toBeInTheDocument();
    });
  });
});
