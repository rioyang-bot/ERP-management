import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Devices from '../pages/Devices';

describe('設備建檔聯絡人連動整合測試', () => {
  const insertSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    insertSpy.mockClear();
    
    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      if (query === 'fetchBrands') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: 'BrandA' }] });
      }
      if (query === 'fetchTypes') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: 'TypeA' }] });
      }
      if (query === 'fetchTypesByBrand') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: 'TypeA' }] });
      }
      if (query === 'fetchModelsByBrandType') {
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
      if (query === 'insertAssetRecord') {
        insertSpy(params);
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  });

  it('選擇僅有單一聯絡人的客戶時，應能自動帶入聯絡人姓名', async () => {
    const user = userEvent.setup();
    render(<Devices />);

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
    render(<Devices />);

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
});
