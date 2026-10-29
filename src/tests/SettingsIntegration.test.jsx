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
    const editBtn = await screen.findByTitle(/設定功能權限/);
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
    const editBtn = await screen.findByTitle(/設定功能權限/);
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

  it('設備攜出入單簽核權限：管理員也能勾選；儲存寫進 menu_access 並留下事件紀錄', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(
      <RoleContext.Provider value={{ authUser: mockAuthUser, role: 'ADMIN', setAuthUser: vi.fn() }}>
        <Settings />
      </RoleContext.Provider>
    );
    await user.click(await screen.findByTitle(/設定功能權限/));
    await screen.findByRole('heading', { name: '權限設定', level: 2 });

    const supervisor = screen.getByRole('checkbox', { name: '可簽核：權責主管' });
    expect(supervisor).toHaveAttribute('aria-checked', 'false');
    await user.click(supervisor);
    expect(supervisor).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: '可簽核：機房管理員' })).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByText(/儲存權限設定/));
    await waitFor(() => {
      const call = window.electronAPI.namedQuery.mock.calls.find(([q]) => q === 'updateUserAccess');
      expect(call[1][0]).toMatchObject({ isoSignSupervisor: true });
      expect(call[1][0].isoSignRoomAdmin).toBeFalsy();
      expect(call[1][1]).toBe(1);
    });
    await waitFor(() => {
      const log = window.electronAPI.namedQuery.mock.calls.find(([q]) => q === 'insertAuditLog');
      expect(log[1][4]).toBe('USER');
      expect(log[1][8]).toBe('修改使用者 [METECH] 選單權限設定（設備攜出入單簽核：權責主管；盤點調整：否）');
      expect(log[1][9].iso_sign_roles).toEqual(['權責主管']);
    });
  });

  it('可盤點調整：管理員也要勾；儲存寫進 menu_access.stockAdjust 並記在事件紀錄', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(
      <RoleContext.Provider value={{ authUser: mockAuthUser, role: 'ADMIN', setAuthUser: vi.fn() }}>
        <Settings />
      </RoleContext.Provider>
    );
    await user.click(await screen.findByTitle(/設定功能權限/));
    await screen.findByRole('heading', { name: '權限設定', level: 2 });

    const adjust = screen.getByRole('checkbox', { name: '可盤點調整' });
    expect(adjust).toHaveAttribute('aria-checked', 'false');
    await user.click(adjust);
    expect(adjust).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByText(/儲存權限設定/));
    await waitFor(() => {
      const call = window.electronAPI.namedQuery.mock.calls.find(([q]) => q === 'updateUserAccess');
      expect(call[1][0]).toMatchObject({ stockAdjust: true });
    });
    await waitFor(() => {
      const log = window.electronAPI.namedQuery.mock.calls.find(([q]) => q === 'insertAuditLog');
      expect(log[1][3]).toBe('UPDATE');
      expect(log[1][4]).toBe('USER');
      expect(log[1][6]).toBe('METECH');
      expect(log[1][8]).toBe('修改使用者 [METECH] 選單權限設定（設備攜出入單簽核：無；盤點調整：可）');
      expect(log[1][9].stock_adjust).toBe(true);
    });
  });
});
