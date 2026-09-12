import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Devices from '../pages/Devices';

describe('設備建檔聯絡人連動整合測試', () => {
  const insertSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    insertSpy.mockClear();
    
    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      if (query === 'fetchBrands' || query === 'fetchDeviceBrands') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: 'BrandA' }] });
      }
      if (query === 'fetchTypes' || query === 'fetchTypesByBrand' || query === 'fetchDeviceTypes') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: 'TypeA' }] });
      }
      if (query === 'fetchModelsByBrandType' || query === 'fetchModelsByBrand') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: 'ModelA' }] });
      }
      if (query === 'fetchRecentAssets') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'getSystemSetting') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'fetchCustomers') {
        return Promise.resolve({
          success: true,
          rows: [
            { name: '客戶A-單一聯絡人', contact: '張三', phone: '123' },
            { name: '客戶B-多聯絡人', contact: '王五', phone: '456' },
            { name: '客戶B-多聯絡人', contact: '趙六', phone: '789' }
          ]
        });
      }
      if (query === 'findItemMaster' || query === 'insertItemMaster') {
        return Promise.resolve({ success: true, rows: [{ id: 101 }] });
      }
      if (query === 'insertAssetRecord') {
        insertSpy(params);
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  });

  it('選擇僅有單一聯絡人的客戶時，應能自動帶入聯絡人姓名', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Devices />
      </MemoryRouter>
    );

    // 等待下拉選單等初始化載入完畢
    await waitFor(() => {
      expect(screen.getByLabelText(/客戶名稱/)).toBeInTheDocument();
    });

    const clientSelect = screen.getByLabelText(/客戶名稱/);
    
    // 選擇單一聯絡人客戶
    await user.selectOptions(clientSelect, '客戶A-單一聯絡人');

    // 聯絡人應被自動填入 '張三'
    const contactInput = screen.getByPlaceholderText('聯絡人姓名');
    expect(contactInput).toBeInTheDocument();
    expect(contactInput.value).toBe('張三');
  });

  it('選擇擁有多個聯絡人的客戶時，聯絡人應轉換成下拉選單供選擇', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Devices />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/客戶名稱/)).toBeInTheDocument();
    });

    const clientSelect = screen.getByLabelText(/客戶名稱/);
    
    // 選擇多聯絡人客戶
    await user.selectOptions(clientSelect, '客戶B-多聯絡人');

    // 聯絡人欄位此時應渲染為 dropdown (select element)
    const contactSelect = screen.getByLabelText(/聯絡人/);
    expect(contactSelect.tagName).toBe('SELECT');

    // 下拉選單應包含 "請選擇聯絡人", "王五 (456)" 和 "趙六 (789)"
    expect(screen.getByText('王五 (456)')).toBeInTheDocument();
    expect(screen.getByText('趙六 (789)')).toBeInTheDocument();

    // 選擇聯絡人 '趙六'
    await user.selectOptions(contactSelect, '趙六');
    expect(contactSelect.value).toBe('趙六');
  });

  it('設備建檔未填寫必填欄位 (廠牌、類型、型號) 時應彈出警示並阻止建立，規格為選填', async () => {
    const user = userEvent.setup();
    window.alert = vi.fn();
    render(
      <MemoryRouter>
        <Devices />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/設備建檔/)).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /儲存設備資料/ });
    await user.click(submitBtn);

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('廠牌、類型、型號為必填'));
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('DeviceRegistrationModal 應傳入完整的 14 個參數至 insertAssetRecord 並將建立資訊回傳給 onSuccess', async () => {
    const { default: DeviceRegistrationModal } = await import('../components/DeviceRegistrationModal');
    const user = userEvent.setup();
    const onSuccessSpy = vi.fn();
    window.alert = vi.fn();

    render(
      <MemoryRouter>
        <DeviceRegistrationModal isOpen={true} onClose={() => {}} onSuccess={onSuccessSpy} />
      </MemoryRouter>
    );

    // 等待彈窗載入
    await waitFor(() => {
      expect(screen.getByText(/新增設備建檔/)).toBeInTheDocument();
    });

    // 填寫必填欄位
    const brandSelect = screen.getByLabelText(/廠牌/i);
    await user.selectOptions(brandSelect, 'BrandA');

    const typeSelect = screen.getByLabelText(/類型/i);
    await user.selectOptions(typeSelect, 'TypeA');

    const modelSelect = screen.getByLabelText(/型號/i);
    await user.selectOptions(modelSelect, 'ModelA');

    const snInput = screen.getByPlaceholderText(/請輸入或掃描序號/);
    await user.type(snInput, 'TEST-SRV-2026');

    // 點擊確認建立按鈕
    const saveBtn = screen.getByRole('button', { name: /儲存並關閉/ });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(insertSpy).toHaveBeenCalled();
    });

    const params = insertSpy.mock.calls[0][0];
    // 驗證傳入 insertAssetRecord 的參數陣列至少有 14 個
    expect(params.length).toBeGreaterThanOrEqual(14);
    // 驗證序號是 TEST-SRV-2026
    expect(params[1]).toBe('TEST-SRV-2026');
    // 驗證第 14 個參數是 ACTIVE 狀態
    expect(params[13]).toBe('ACTIVE');

    // 驗證 onSuccess 接收到了 createdInfo
    expect(onSuccessSpy).toHaveBeenCalledWith(expect.objectContaining({
      brand: 'BrandA',
      model: 'ModelA',
      sn: 'TEST-SRV-2026'
    }));
  });
});
