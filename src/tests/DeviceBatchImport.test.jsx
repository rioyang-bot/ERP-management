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

  it('當合作夥伴具備關聯資訊（如 project_info 為 IMC），匯入對應關鍵字時，預覽表格應呈現「🏷️ 關聯: IMC」標籤，且匯入時 custom_attributes 包含 project_name 與 related_info', async () => {
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
            { id: 8, name: '元大Yuanta', contact: 'Niky', phone: '0912-345678', project_info: '國法、IMC', type: 'CUSTOMER' }
          ]
        });
      }
      if (query === 'findItemMaster') {
        return Promise.resolve({ success: true, rows: [{ id: 999 }] });
      }
      if (query === 'insertAssetRecord') {
        return Promise.resolve({ success: true, rowCount: 1 });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    const testData = [
      {
        'Customer': '元大',
        'Contact': 'Yuanta imc',
        'HostName': 'YUANTA-SRV-IMC',
        'System Type': 'Server',
        'Brand': 'BlackCore',
        'Model': 'BC-IMC',
        'Specification': '32C 128G',
        'Serial Number ( Current )': 'SN-IMC-001',
        'Status': 'ACTIVE'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'relation_test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

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

    // 預覽表格應成功顯示「🏷️ 關聯: IMC」標籤
    await waitFor(() => {
      expect(screen.getByText('Niky')).toBeInTheDocument();
      expect(screen.getByText(/🏷️ 關聯: IMC/i)).toBeInTheDocument();
    });

    // 執行匯入
    const importBtn = screen.getByText(/確認匯入/i);
    await userEvent.click(importBtn);

    // 驗證寫入時 custom_attributes 包含 related_info，但不寫入 project_name（專案保持為空）
    await waitFor(() => {
      expect(namedQueryMock).toHaveBeenCalledWith('insertAssetRecord', expect.arrayContaining([
        expect.objectContaining({
          related_info: 'IMC',
          contact_person: 'Niky'
        })
      ]));
      const insertCall = namedQueryMock.mock.calls.find(c => c[0] === 'insertAssetRecord');
      const customAttrs = insertCall[1][11];
      expect(customAttrs.project_name).toBeUndefined();
    });
  });

  it('應能正確解析 4 種日期格式（包含 Project Date ( Installedl ) 錯字別名、DD/MM/YYYY 及 Excel 序列數字），並於預覽表格完整呈現 4 種日期', async () => {
    namedQueryMock.mockImplementation((query, params) => {
      if (query === 'fetchAssetSns') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'findItemMaster') {
        return Promise.resolve({ success: true, rows: [{ id: 88 }] });
      }
      if (query === 'insertAssetRecord') {
        return Promise.resolve({ success: true, rowCount: 1 });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    const testData = [
      {
        'Customer': '元大',
        'HostName': 'HFT24C-01',
        'System Type': 'Server',
        'Brand': 'BlackCore',
        'Model': 'BCHFT-1PC',
        'Serial Number ( Current )': 'SN-DATE-001',
        'Project Date ( Installedl )': '26/05/2023',
        'Customer Warranty Expire': '18/01/2026',
        'BlackCore System Date': '26/05/2023',
        'BlackCore Warranty Expire': '04/01/2027'
      },
      {
        'Customer': '元大',
        'HostName': 'HFT24C-02',
        'System Type': 'Server',
        'Brand': 'BlackCore',
        'Model': 'BCHFT-1PC',
        'Serial Number ( Current )': 'SN-DATE-002',
        // 模擬 Excel 序列數字 (45483 = 2024-07-10, 45360 = 2024-03-09)
        'Project Date ( Installedl )': 45483,
        'Customer Warranty Expire': '10/07/2026',
        'BlackCore System Date': 45360,
        'BlackCore Warranty Expire': '20/06/2027'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'four_dates_test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

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

    // 1. 驗證表頭完整包含 4 種日期
    await waitFor(() => {
      expect(screen.getByText('安裝日期')).toBeInTheDocument();
      expect(screen.getByText('客戶保固到期')).toBeInTheDocument();
      expect(screen.getByText('系統日期')).toBeInTheDocument();
      expect(screen.getByText('原廠保固到期')).toBeInTheDocument();
    });

    // 2. 驗證資料列格式轉換正確，無 +045359-12-31 等異常年份
    await waitFor(() => {
      // 第一列 DD/MM/YYYY 轉換為 YYYY-MM-DD
      expect(screen.getAllByText('2023-05-26').length).toBeGreaterThanOrEqual(2); // installed_date 與 system_date
      expect(screen.getByText('2026-01-18')).toBeInTheDocument();
      expect(screen.getByText('2027-01-04')).toBeInTheDocument();

      // 第二列 Excel 序列號轉換為 YYYY-MM-DD
      expect(screen.getByText('2024-07-10')).toBeInTheDocument();
      expect(screen.getByText('2026-07-10')).toBeInTheDocument();
      expect(screen.getByText('2024-03-09')).toBeInTheDocument();
      expect(screen.getByText('2027-06-20')).toBeInTheDocument();

      // 絕不出現異常年份
      expect(screen.queryByText(/\+045/i)).not.toBeInTheDocument();
    });

    // 3. 執行匯入並驗證 4 種日期正確存入 DB
    const importBtn = screen.getByText(/確認匯入/i);
    await userEvent.click(importBtn);

    await waitFor(() => {
      // 驗證第一筆
      expect(namedQueryMock).toHaveBeenCalledWith('insertAssetRecord', [
        88,
        'SN-DATE-001',
        '元大',
        'HFT24C-01',
        null,
        '2023-05-26', // installed_date
        '2026-01-18', // customer_warranty_expire
        '2023-05-26', // system_date
        '2027-01-04', // warranty_expire
        null,
        null,
        expect.any(Object),
        'FOR_SALE',
        'ACTIVE'
      ]);

      // 驗證第二筆
      expect(namedQueryMock).toHaveBeenCalledWith('insertAssetRecord', [
        88,
        'SN-DATE-002',
        '元大',
        'HFT24C-02',
        null,
        '2024-07-10', // installed_date
        '2026-07-10', // customer_warranty_expire
        '2024-03-09', // system_date
        '2027-06-20', // warranty_expire
        null,
        null,
        expect.any(Object),
        'FOR_SALE',
        'ACTIVE'
      ]);
    });
  });

  it('匯入設備資料時，應能自動識別並呈現 End-user 欄位，並寫入 custom_attributes.end_user', async () => {
    const testData = [
      {
        'Brand': 'BlackCore',
        'Type': 'Server',
        'Model': 'BCHFT-1PC',
        'Serial Number': 'SN-ENDUSER-001',
        'Customer': '元大',
        'End-user': '台北分行A棟',
        'Status': 'ACTIVE'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'devices_end_user.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const { container } = render(<DeviceBatchImportModal isOpen={true} onClose={vi.fn()} />);

    const fileInput = container.querySelector('input[type="file"]');
    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText('SN-ENDUSER-001')).toBeInTheDocument();
      expect(screen.getByText('台北分行A棟')).toBeInTheDocument();
    });

    const importBtn = screen.getByText(/確認匯入/i);
    await userEvent.click(importBtn);

    await waitFor(() => {
      expect(namedQueryMock).toHaveBeenCalledWith('insertAssetRecord', expect.arrayContaining([
        expect.objectContaining({
          batch_imported: true,
          end_user: '台北分行A棟'
        })
      ]));
    });
  });

  it('當匯入資料同時包含 Type 與 OS Type 欄位時，OS Type 不得被寫入為設備類型，且應呈現隔離提示', async () => {
    const testData = [
      {
        'Brand': 'Dell',
        'Type': 'Server',
        'OS Type': 'RedHat Enterprise Linux 9.2',
        'Model': 'PowerEdge R750',
        'Serial Number': 'SN-TYPE-OSTYPE-001',
        'Customer': '國泰世華',
        'Status': 'ACTIVE'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'devices_os_type.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const { container } = render(<DeviceBatchImportModal isOpen={true} onClose={vi.fn()} />);

    const fileInput = container.querySelector('input[type="file"]');
    await userEvent.upload(fileInput, file);

    // 驗證出現隔離提示
    await waitFor(() => {
      expect(screen.getByText(/【欄位檢核通知】/)).toBeInTheDocument();
      expect(screen.getByText(/不會被寫入/)).toBeInTheDocument();
    });

    // 驗證解析出的類型為 Server，絕非 RedHat
    expect(screen.getByText('Server')).toBeInTheDocument();
    expect(screen.queryByText('RedHat Enterprise Linux 9.2')).not.toBeInTheDocument();

    const importBtn = screen.getByText(/確認匯入/i);
    await userEvent.click(importBtn);

    await waitFor(() => {
      // 驗證 item_master 查詢是以 'Server' 為類型，絕非 'RedHat Enterprise Linux 9.2'
      expect(namedQueryMock).toHaveBeenCalledWith('findItemMaster', expect.arrayContaining(['Server', 'Dell', 'PowerEdge R750']));
    });
  });

  it('當匯入資料僅有 OS Type 而無 Type 欄位時，不應將 OS Type 誤抓為設備類型', async () => {
    const testData = [
      {
        'Brand': 'Supermicro',
        'OS Type': 'CentOS 7.9',
        'Model': 'SYS-1029P',
        'Serial Number': 'SN-NO-TYPE-001',
        'Customer': '富邦',
        'Status': 'ACTIVE'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'devices_no_type.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const { container } = render(<DeviceBatchImportModal isOpen={true} onClose={vi.fn()} />);

    const fileInput = container.querySelector('input[type="file"]');
    await userEvent.upload(fileInput, file);

    // 由於排除 OS Type，該列缺少 Type 應被列為 SKIPPED (缺少類型 (Type))，CentOS 不被當作 Type
    await waitFor(() => {
      expect(screen.getByText('缺少類型 (Type)')).toBeInTheDocument();
    });
  });

  it('若檢測到有相同名稱的自訂欄位對應時，應提示告警並在匯入時阻擋', async () => {
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);

    namedQueryMock.mockImplementation((query, params) => {
      if (query === 'getSystemSetting' && params && params[0] === 'customFieldDefinitions') {
        return Promise.resolve({
          success: true,
          rows: [{
            value: [
              { id: 'custom_field_1', label: '備註一' },
              { id: 'custom_field_2', label: '備註二' }
            ]
          }]
        });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    const testData = [
      {
        'Brand': 'Dell',
        'Type': 'Server',
        'Model': 'R750',
        'Serial Number': 'SN-DUP-MAP-001',
        'Customer': '測試客戶',
        'CommonNote': '共用資料內容'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'devices_dup_mapping.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const { container } = render(<DeviceBatchImportModal isOpen={true} onClose={vi.fn()} />);

    const fileInput = container.querySelector('input[type="file"]');
    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText('自訂欄位對應 (Custom Fields Mapping)')).toBeInTheDocument();
    });

    // 將兩個自訂欄位同時手動選擇對應到相同的檔案欄位 'CommonNote'
    const select1 = screen.getByLabelText('自訂欄位對應: 備註一');
    const select2 = screen.getByLabelText('自訂欄位對應: 備註二');
    await userEvent.selectOptions(select1, 'CommonNote');
    await userEvent.selectOptions(select2, 'CommonNote');

    // 驗證出現【欄位對應衝突告警】與【重複對應衝突】標記
    await waitFor(() => {
      expect(screen.getByText(/【欄位對應衝突告警】/)).toBeInTheDocument();
      expect(screen.getAllByText(/⚠️ 重複對應衝突/).length).toBeGreaterThanOrEqual(1);
    });

    // 點擊匯入，應跳出 alert 告警並中斷阻止
    const importBtn = screen.getByText(/確認匯入/i);
    await userEvent.click(importBtn);

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('【欄位對應衝突告警】'));
    expect(namedQueryMock).not.toHaveBeenCalledWith('insertAssetRecord', expect.anything());
  });
});



