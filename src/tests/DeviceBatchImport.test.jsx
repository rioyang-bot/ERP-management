import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeviceBatchImportModal from '../components/DeviceBatchImportModal';
import * as XLSX from 'xlsx';

describe('DeviceBatchImportModal 設備批次匯入檢核與建立測試', () => {
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
      if (query === 'fetchAssetSns') {
        return Promise.resolve({
          success: true,
          rows: [{ sn: 'EXISTING-SN-001' }]
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

  it('應正確呈現彈窗並顯示「廠牌 (Brand)」與「資產歸屬」欄位且無預設廠牌', () => {
    render(
      <DeviceBatchImportModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText('設備清單批次匯入 (Excel / CSV Batch Import)')).toBeInTheDocument();
    const brandInput = screen.getByPlaceholderText('請輸入或選擇廠牌 (例: BlackCore)');
    expect(brandInput).toBeInTheDocument();
    expect(brandInput.value).toBe(''); // 確認無預設值
    expect(screen.getByText('一般銷售 (FOR_SALE)')).toBeInTheDocument();
    expect(screen.getByText('公司資產 (COMPANY)')).toBeInTheDocument();
  });

  it('應能正確解析 Excel 檔案並直接依據 Excel 內 Status 欄位判定出貨狀態', async () => {
    // 建立測試資料庫
    const testData = [
      {
        'Customer': 'Yuanta Ryan',
        'HostName': 'HFT24C-16',
        'System Type': '24C',
        'Model': 'BCHFT-1PC',
        'Location': 'BQDC',
        'Serial Number ( Current )': 'X0344419',
        'Project Date ( Installed )': '11/07/2024',
        'BlackCore Warranty Expire': '20/06/2027',
        'Status': 'SHIPPED'
      },
      {
        // 缺少 Model
        'Customer': 'KGI',
        'HostName': 'SCLB-KWXOMS-M',
        'System Type': '16C',
        'Model': '',
        'Location': '南京',
        'Serial Number ( Current )': 'X0343225',
        'Project Date ( Installed )': '12/11/2024',
        'Status': 'ACTIVE'
      },
      {
        // 重複現有序號
        'Customer': 'METECH',
        'HostName': 'SPARE',
        'System Type': '24C',
        'Model': 'BCHFT-1PC',
        'Location': 'HQ',
        'Serial Number ( Current )': 'EXISTING-SN-001'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'blackcore_devices.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const { container } = render(
      <DeviceBatchImportModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();

    await userEvent.upload(fileInput, file);

    // 未填寫廠牌時，無廠牌之列將標記為缺少廠牌 (2 筆缺廠牌，1 筆重複序號)
    await waitFor(() => {
      expect(screen.getByText(/略過項目 \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText(/序號重複 \(1\)/i)).toBeInTheDocument();
    });

    // 填寫廠牌為 BlackCore
    const brandInput = screen.getByPlaceholderText('請輸入或選擇廠牌 (例: BlackCore)');
    await userEvent.type(brandInput, 'BlackCore');

    await waitFor(() => {
      // 驗證即時動態重算統計 (1 筆可建立，1 筆缺型號略過，1 筆序號重複)
      expect(screen.getByText(/待建立 \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/略過項目 \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/序號重複 \(1\)/i)).toBeInTheDocument();
    });

    // 驗證表格內容與檢核標籤
    expect(screen.getByText('X0344419')).toBeInTheDocument();
    expect(screen.getByText('缺少型號 (Model)')).toBeInTheDocument();
    expect(screen.getByText('此序號已存在於系統設備清冊中')).toBeInTheDocument();
    expect(screen.getAllByText(/📦 已出貨/i).length).toBeGreaterThan(0);
  });
});
