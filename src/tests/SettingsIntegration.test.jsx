import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from '../pages/Settings';
import { RoleContext } from '../context/RoleContext';

// 模擬 Context 資料
const mockAuthUser = {
  id: 1,
  username: 'METECH',
  full_name: '系統管理員',
  role: 'ADMIN'
};

describe('Settings 頁面完整流程整合測試', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // 模擬 Named Query
    window.electronAPI.namedQuery.mockImplementation((query) => {
      if (query === 'fetchUsers') {
        return Promise.resolve({
          success: true,
          rows: [{
            id: 1,
            username: 'METECH',
            full_name: '系統管理員',
            role: 'ADMIN',
            is_active: true,
            menu_access: { inbound: true }
          }]
        });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  });

  it('應能完成資料載入與權限彈窗開啟流程', async () => {
    const user = userEvent.setup();
    render(
      <RoleContext.Provider value={{ authUser: mockAuthUser, role: 'ADMIN' }}>
        <Settings />
      </RoleContext.Provider>
    );

    // 1. 等待資料載入
    expect(await screen.findByText(/系統管理員/)).toBeInTheDocument();

    // 2. 點擊「設定權限」按鈕
    const editBtn = await screen.findByText(/設定權限/);
    await user.click(editBtn);

    // 3. 驗證彈窗是否出現 (使用更精確的 heading role 定位)
    const modalTitle = await screen.findByRole('heading', { name: '權限設定', level: 2 }, { timeout: 10000 });
    expect(modalTitle).toBeInTheDocument();
    
    // 4. 驗證彈窗內容是否正確 (檢查彈窗專屬的儲存按鈕)
    await waitFor(() => {
      expect(screen.getByText(/儲存權限設定/)).toBeInTheDocument();
    }, { timeout: 3000 });
  }, 15000);

  it('對於 ADMIN 帳號，系統管理選單權限必須強制勾選且不可被移除', async () => {
    const user = userEvent.setup();
    render(
      <RoleContext.Provider value={{ authUser: mockAuthUser, role: 'ADMIN' }}>
        <Settings />
      </RoleContext.Provider>
    );

    expect(await screen.findByText(/系統管理員/)).toBeInTheDocument();
    const editBtn = await screen.findByText(/設定權限/);
    await user.click(editBtn);

    await screen.findByRole('heading', { name: '權限設定', level: 2 });

    const settingsOptionText = screen.getByText('系統管理 (Accounts)');
    const settingsOptionContainer = settingsOptionText.parentElement;

    // 驗證容器樣式具有不可編輯視覺特徵
    expect(settingsOptionContainer.style.cursor).toBe('not-allowed');
    expect(settingsOptionContainer.style.opacity).toBe('0.75');

    // 嘗試點選
    await user.click(settingsOptionContainer);

    // 點選後依然保持不可移除樣式與不可編輯狀態
    expect(settingsOptionContainer.style.cursor).toBe('not-allowed');
  });
});
