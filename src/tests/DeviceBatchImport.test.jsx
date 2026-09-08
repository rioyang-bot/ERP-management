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

  it('應正確呈現彈窗並在匯入參數中依序顯示「類型 (Type) *」與「廠牌 (Brand) *」欄位且皆無預設值', () => {
    render(
      <DeviceBatchImportModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText('設備清單批次匯入 (Excel / CSV Batch Import)')).toBeInTheDocument();
    
    // 驗證「類型」出現在「廠牌」前面
    const typeInput = screen.getByPlaceholderText('請輸入或選擇類型 (例: Server, Switch)');
    const brandInput = screen.getByPlaceholderText('請輸入或選擇廠牌 (例: Dell, Supermicro)');
    expect(typeInput).toBeInTheDocument();
    expect(typeInput.value).toBe('');
    expect(brandInput).toBeInTheDocument();
    expect(brandInput.value).toBe('');

    // 確認 DOM 順序：類型在廠牌前面
    expect(typeInput.compareDocumentPosition(brandInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // 確認資產歸屬功能已移除，不顯示切換按鈕
    expect(screen.queryByText('一般銷售 (FOR_SALE)')).not.toBeInTheDocument();
    expect(screen.queryByText('公司資產 (COMPANY)')).not.toBeInTheDocument();
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

    // 填寫廠牌為 Dell
    const brandInput = screen.getByPlaceholderText('請輸入或選擇廠牌 (例: Dell, Supermicro)');
    await userEvent.type(brandInput, 'Dell');

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

  it('應能載入系統自訂欄位、自動匹配 Excel 表頭、支援手動變更對應，並於匯入時寫入 custom_attributes', async () => {
    // 模擬自訂欄位定義
    namedQueryMock.mockImplementation((query, params) => {
      if (query === 'fetchAssetSns') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'fetchDeviceTypes') {
        return Promise.resolve({ success: true, rows: [{ name: 'Server' }] });
      }
      if (query === 'getSystemSetting' && params && params[0] === 'customFieldDefinitions') {
        return Promise.resolve({
          success: true,
          rows: [{
            value: [
              { id: 'custom_rack', label: '機櫃編號', isNative: false, color: '#3b82f6' },
              { id: 'custom_ip', label: '管理IP', isNative: false, color: '#10b981' }
            ]
          }]
        });
      }
      if (query === 'findItemMaster') {
        return Promise.resolve({ success: true, rows: [{ id: 101 }] });
      }
      if (query === 'insertAssetRecord') {
        return Promise.resolve({ success: true, rowCount: 1 });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    // 模擬 Excel 檔案（包含「機櫃編號」可自動匹配，以及「IP_Address」可透過手動下拉對應）
    const testData = [
      {
        'Customer': 'Cathay',
        'HostName': 'SRV-01',
        'System Type': 'Server',
        'Brand': 'Dell',
        'Model': 'R750',
        'Specification': 'Xeon Gold / 256GB',
        'Location': 'Taipei-DC',
        'Serial Number ( Current )': 'SN-DELL-999',
        '機櫃編號': 'RACK-A12',
        'IP_Address': '10.20.30.40',
        'Status': 'ACTIVE'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'device_custom_fields.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // 模擬 window.confirm
    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    const { container } = render(
      <DeviceBatchImportModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    // 驗證自訂欄位對應面板已渲染出兩個自訂欄位
    await waitFor(() => {
      expect(screen.getByText(/自訂欄位對應 \(Custom Fields Mapping\)/i)).toBeInTheDocument();
      expect(screen.getByText('機櫃編號')).toBeInTheDocument();
      expect(screen.getByText('管理IP')).toBeInTheDocument();
    });

    // 上傳檔案
    const fileInput = container.querySelector('input[type="file"]');
    await userEvent.upload(fileInput, file);

    // 驗證自動匹配：「機櫃編號」自動匹配到 Excel 的「機櫃編號」
    await waitFor(() => {
      expect(screen.getByText(/✓ 已對應: 機櫃編號/i)).toBeInTheDocument();
    });

    // 手動將「管理IP」下拉選單切換至「IP_Address」
    const ipSelect = screen.getByLabelText('自訂欄位對應: 管理IP');
    fireEvent.change(ipSelect, { target: { value: 'IP_Address' } });

    // 驗證預覽表格標題與數值動態顯示
    await waitFor(() => {
      expect(screen.getAllByText(/機櫃編號/i).length).toBeGreaterThan(0);
      expect(screen.getByText('RACK-A12')).toBeInTheDocument();
      expect(screen.getByText('10.20.30.40')).toBeInTheDocument();
    });

    // 點擊執行匯入
    const importBtn = screen.getByText(/確認匯入/i);
    await userEvent.click(importBtn);

    // 驗證 insertAssetRecord 呼叫參數，其 custom_attributes 包含自訂欄位
    await waitFor(() => {
      expect(namedQueryMock).toHaveBeenCalledWith('insertAssetRecord', expect.arrayContaining([
        expect.objectContaining({
          batch_imported: true,
          custom_rack: 'RACK-A12',
          custom_ip: '10.20.30.40'
        })
      ]));
    });
  });

  it('匯入填寫「Niky imc」且客戶管理中為「Niky」時，能自動識別並帶入管理中 Niky 的資料與電話', async () => {
    namedQueryMock.mockImplementation((query) => {
      if (query === 'fetchAssetSns') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'fetchDeviceTypes') {
        return Promise.resolve({ success: true, rows: [{ name: 'Server' }] });
      }
      if (query === 'fetchPartners') {
        return Promise.resolve({
          success: true,
          rows: [
            { id: 6, name: '元大Yuanta', contact: 'Niky', phone: '0912-345678', type: 'CUSTOMER' }
          ]
        });
      }
      if (query === 'getSystemSetting') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'findItemMaster') {
        return Promise.resolve({ success: true, rows: [{ id: 888 }] });
      }
      if (query === 'insertAssetRecord') {
        return Promise.resolve({ success: true, rowCount: 1 });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    const testData = [
      {
        'Customer': '元大',
        'Contact': 'Niky imc',
        'HostName': 'YUANTA-SRV-01',
        'System Type': 'Server',
        'Brand': 'BlackCore',
        'Model': 'BC-2000',
        'Specification': '64C 256G',
        'Serial Number ( Current )': 'SN-NIKY-001',
        'Status': 'ACTIVE'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'niky_test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    const { container } = render(
      <DeviceBatchImportModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const fileInput = container.querySelector('input[type="file"]');
    await userEvent.upload(fileInput, file);

    // 預覽表格應成功顯示標準聯絡人「Niky」、自動比對帶入徽章，以及電話
    await waitFor(() => {
      expect(screen.getByText('Niky')).toBeInTheDocument();
      expect(screen.getByText(/🔗 已帶入: Niky/i)).toBeInTheDocument();
      expect(screen.getByText(/0912-345678/i)).toBeInTheDocument();
    });

    // 執行匯入
    const importBtn = screen.getByText(/確認匯入/i);
    await userEvent.click(importBtn);

    // 驗證寫入時 custom_attributes 包含聯絡人 Niky 與電話
    await waitFor(() => {
      expect(namedQueryMock).toHaveBeenCalledWith('insertAssetRecord', expect.arrayContaining([
        expect.objectContaining({
          contact_person: 'Niky',
          contact_phone: '0912-345678',
          raw_contact_person: 'Niky imc'
        })
      ]));
    });
  });
});


