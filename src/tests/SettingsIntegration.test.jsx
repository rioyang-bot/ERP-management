import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from '../pages/Settings';
import { RoleContext } from '../context/RoleContext';

// 模擬 Context 資料
const mockAuthUser = {
  id: 1,
  username: 'admin',
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
            username: 'admin',
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
    render(
      <RoleContext.Provider value={{ authUser: mockAuthUser, role: 'ADMIN' }}>
        <Settings />
      </RoleContext.Provider>
    );

    // 1. 等待資料載入
    expect(await screen.findByText(/系統管理員/)).toBeInTheDocument();

    // 2. 點擊「設定權限」按鈕
    const editBtn = screen.getByText(/設定權限/);
    await act(async () => {
      fireEvent.click(editBtn);
    });

    // 3. 驗證彈窗是否出現
    await waitFor(() => {
      expect(screen.getByText(/權限設定/)).toBeInTheDocument();
    }, { timeout: 3000 });
    
    // 4. 驗證彈窗內容是否正確 (顯示正確的使用者名稱)
    expect(screen.getByText(/admin/)).toBeInTheDocument();
  });
});
