import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProcurementRegistration from '../pages/Purchasing';
import { RoleContext } from '../context/RoleContext';

const mockAuthUser = {
  id: 1,
  username: 'METECH',
  full_name: '系統管理員',
  role: 'ADMIN'
};

describe('採購建檔品項下拉選單與型號自動帶出測試', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      if (query === 'fetchPurchasingRecords') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'fetchSuppliers') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: '供應商A' }] });
      }
      if (query === 'fetchCategories') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: '設備' }] });
      }
      if (query === 'fetchBrandsByCategory') {
        return Promise.resolve({ success: true, rows: [{ name: 'Dell' }, { name: 'Apple' }] });
      }
      if (query === 'fetchTypesByCategory') {
        return Promise.resolve({
          success: true,
          rows: [
            { name: '伺服器', brand: 'Dell' },
            { name: '筆記型電腦', brand: 'Apple' }
          ]
        });
      }
      if (query === 'fetchModelsByCategory') {
        return Promise.resolve({
          success: true,
          rows: [
            { model: 'PowerEdge R750', type: '伺服器', brand: 'Dell', specification: 'Dell Server Spec 1', unit: '台' },
            { model: 'MacBook Pro 16', type: '筆記型電腦', brand: 'Apple', specification: 'Apple Laptop Spec 1', unit: '台' }
          ]
        });
      }
      if (query === 'countPurchaseOrders') {
        return Promise.resolve({ success: true, rows: [{ count: 0 }] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  });

  it('選擇廠牌與類型後，型號選單應正確顯示篩選後的型號，且選擇型號後應連動帶入規格與單位', async () => {
    const user = userEvent.setup();
    render(
      <RoleContext.Provider value={{ authUser: mockAuthUser, role: 'ADMIN' }}>
        <ProcurementRegistration />
      </RoleContext.Provider>
    );

    // 1. 等待採購建檔頁面載入，檢查標題與供應商
    await waitFor(() => {
      expect(screen.getByText('採購建檔 (P/O Reg)')).toBeInTheDocument();
    });

    // 2. 找到廠牌下拉選單 (brand)
    // 讓我們用特定的 option 元素或更具體的方式找到對應的 select
    const selects = screen.getAllByRole('combobox');
    // selects[0] 應該是供應商
    // selects[1] 應該是品項類別
    // selects[2] 應該是廠牌
    // selects[3] 應該是類型
    // selects[4] 應該是選擇型號
    // selects[5] 應該是單位

    const categorySelect = selects[0];
    const supplierSelect = selects[1];
    const brandSelectEl = selects[2];
    const typeSelectEl = selects[3];
    const modelSelectEl = selects[4];
    const unitSelectEl = selects[5];

    // 選擇廠牌 "Dell"
    await user.selectOptions(brandSelectEl, 'Dell');
    expect(brandSelectEl.value).toBe('Dell');

    // 選擇類型 "伺服器"
    await user.selectOptions(typeSelectEl, '伺服器');
    expect(typeSelectEl.value).toBe('伺服器');

    // 3. 驗證型號選單是否自動篩選並帶出 "PowerEdge R750" 供選擇
    expect(screen.getByRole('option', { name: 'PowerEdge R750' })).toBeInTheDocument();
    
    // 4. 點選 "PowerEdge R750" 型號
    await user.selectOptions(modelSelectEl, 'PowerEdge R750');
    expect(modelSelectEl.value).toBe('PowerEdge R750');

    // 輸入專案名稱
    const projectInput = screen.getByPlaceholderText('請輸入專案名稱...');
    await user.type(projectInput, '台北總部機房專案');
    expect(projectInput.value).toBe('台北總部機房專案');

    // 5. 驗證規格輸入框與單位下拉選單是否已被自動連動填寫
    const specInput = screen.getByPlaceholderText('詳細規格說明');
    expect(specInput.value).toBe('Dell Server Spec 1');
    expect(unitSelectEl.value).toBe('台');
  });
});
