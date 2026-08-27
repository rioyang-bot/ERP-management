import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HwBatchImportModal from '../components/HwBatchImportModal';
import * as XLSX from 'xlsx';

describe('HwBatchImportModal 硬體批次匯入（自選/建立主檔與格式解析）測試', () => {
  const namedQueryMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    namedQueryMock.mockClear();

    window.electronAPI = {
      namedQuery: namedQueryMock,
      authLogin: vi.fn(),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn()
    };

    namedQueryMock.mockImplementation((query, params) => {
      if (query === 'fetchNicBrands') {
        return Promise.resolve({
          success: true,
          rows: [{ id: 1, name: 'Solarflare' }, { id: 2, name: 'Mellanox' }]
        });
      }
      if (query === 'fetchNicTypesByBrand') {
        return Promise.resolve({
          success: true,
          rows: [{ name: 'NIC' }]
        });
      }
      if (query === 'fetchNicModelsByBrandType') {
        return Promise.resolve({
          success: true,
          rows: [{ name: 'SF2541' }, { name: 'MCX512A' }]
        });
      }
      if (query === 'fetchNicSpecByBrandTypeModel') {
        return Promise.resolve({
          success: true,
          rows: [{ specification: 'Solarflare 25GbE Dual-Port SFP28' }]
        });
      }
      if (query === 'fetchAssetSns') {
        return Promise.resolve({
          success: true,
          rows: [{ sn: 'EXISTING-HW-SN-001' }]
        });
      }
      if (query === 'findItemMaster') {
        return Promise.resolve({ success: true, rows: [{ id: 10 }] });
      }
      if (query === 'insertItemMaster') {
        return Promise.resolve({ success: true, rows: [{ id: 20 }] });
      }
      if (query === 'insertAssetRecord') {
        return Promise.resolve({ success: true, rowCount: 1 });
      }
      if (query === 'insertDeviceBrand' || query === 'insertDeviceType' || query === 'insertDeviceModel' || query === 'insertCustomerIfNotExist' || query === 'insertAuditLog') {
        return Promise.resolve({ success: true, rows: [] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  });

  it('應正確呈現「選擇或建立硬體主檔」之廠牌/類型/型號/規格/歸屬欄位', () => {
    render(
      <HwBatchImportModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText('硬體清單批次匯入 (Hardware Batch Import)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('輸入或選取廠牌 (例: Solarflare)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('輸入或選取類型 (例: NIC)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('輸入或選取型號 (例: SF2541)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('例: Dual-Port 25GbE SFP28 PCIe')).toBeInTheDocument();
    expect(screen.getByText('一般銷售')).toBeInTheDocument();
    expect(screen.getByText('🏢 公司資產')).toBeInTheDocument();
  });

  it('應能正確解析使用者清單格式（SF2541 SN, Cusomter, Hostname, Server-SN, Order Source）並依 Excel Status 欄位設定狀態', async () => {
    // 建立與使用者上傳截圖完全相符的資料，包含 Status 欄位
    const testData = [
      {
        'SF2541 SN': '254100104110222867100882',
        'Cusomter': 'Yuanta Ryan',
        'Hostname': 'Deliver to Hand',
        'Server-SN': '',
        'Order Source': 'XeAU Nov2022',
        'Status': 'SHIPPED'
      },
      {
        'SF2541 SN': '254100104110222867100780',
        'Cusomter': 'Yuanta Ryan',
        'Hostname': 'HFT50-55',
        'Server-SN': 'X0341561',
        'Order Source': 'XeAU Nov2022',
        'Status': 'ACTIVE'
      },
      {
        'SF2541 SN': 'EXISTING-HW-SN-001',
        'Cusomter': 'Yuanta Ryan',
        'Hostname': 'HFT50-58',
        'Server-SN': 'X0341564',
        'Order Source': 'XeAU Nov2022'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hardware');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'solarflare_hw_list.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const { container } = render(
      <HwBatchImportModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();

    await userEvent.upload(fileInput, file);

    // 未填寫主檔前，無廠牌型號將標記為略過 (3 筆中 2 筆缺主檔略過，1 筆序號重複)
    await waitFor(() => {
      expect(screen.getByText(/略過項目 \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText(/序號重複 \(1\)/i)).toBeInTheDocument();
    });

    // 填寫 廠牌 / 類型 / 型號
    const brandInput = screen.getByPlaceholderText('輸入或選取廠牌 (例: Solarflare)');
    const typeInput = screen.getByPlaceholderText('輸入或選取類型 (例: NIC)');
    const modelInput = screen.getByPlaceholderText('輸入或選取型號 (例: SF2541)');

    await userEvent.type(brandInput, 'Solarflare');
    await userEvent.type(typeInput, 'NIC');
    await userEvent.type(modelInput, 'SF2541');

    await waitFor(() => {
      // 驗證即時動態重算統計：2 筆可建立，0 筆略過，1 筆重複序號
      expect(screen.getByText(/待建立 \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText(/略過項目 \(0\)/i)).toBeInTheDocument();
      expect(screen.getByText(/序號重複 \(1\)/i)).toBeInTheDocument();
    });

    // 驗證表格內容成功提取出 SF2541 SN, Cusomter, Hostname, Server-SN, Order Source 與出貨狀態標籤
    expect(screen.getByText('254100104110222867100882')).toBeInTheDocument();
    expect(screen.getByText('Deliver to Hand')).toBeInTheDocument();
    expect(screen.getByText('254100104110222867100780')).toBeInTheDocument();
    expect(screen.getByText('🖥️ X0341561')).toBeInTheDocument();
    expect(screen.getAllByText('Yuanta Ryan').length).toBeGreaterThan(0);
    expect(screen.getAllByText('XeAU Nov2022').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/📦 已出貨/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/🟢 在庫/i).length).toBeGreaterThan(0);
  });
});
