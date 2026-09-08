import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import { RoleContext } from '../context/RoleContext';
import { hashPassword } from '../utils/auth';

import { ThemeProvider } from '../context/ThemeContext';

describe('使用者變更密碼功能 (Change Password) 測試', () => {
  let mockAuthUser;
  let namedQuerySpy;
  let alertSpy;

  beforeEach(async () => {
    vi.clearAllMocks();
    alertSpy = vi.fn();
    window.alert = alertSpy;

    const oldHashed = await hashPassword('oldPassword123');

    mockAuthUser = {
      id: 5,
      username: 'testuser',
      full_name: '測試同仁',
      role: 'IT',
      menu_access: { overview: true }
    };

    namedQuerySpy = vi.fn((query, params) => {
      if (query === 'getSystemSetting') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'fetchUserById') {
        return Promise.resolve({
          success: true,
          rows: [
            {
              id: 5,
              username: 'testuser',
              password_hash: oldHashed,
              role: 'IT',
              full_name: '測試同仁',
              is_active: true
            }
          ]
        });
      }
      if (query === 'updateUserPassword') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    window.electronAPI = {
      namedQuery: namedQuerySpy,
      authLogin: vi.fn(),
      getDashboardStats: vi.fn()
    };
  });

  const renderComponent = () => {
    return render(
      <ThemeProvider>
        <MemoryRouter>
          <RoleContext.Provider value={{ authUser: mockAuthUser, role: 'IT', setAuthUser: vi.fn() }}>
            <MainLayout />
          </RoleContext.Provider>
        </MemoryRouter>
      </ThemeProvider>
    );
  };

  it('能正確開啟變更密碼彈窗', async () => {
    const user = userEvent.setup();
    renderComponent();

    const changePwdBtn = screen.getByText('變更密碼');
    await user.click(changePwdBtn);

    expect(screen.getByPlaceholderText('請輸入原密碼')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('請輸入新密碼')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('請再次輸入新密碼')).toBeInTheDocument();
  });

  it('原密碼輸入錯誤時應提示「原密碼錯誤」並阻擋更新', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByText('變更密碼'));

    await user.type(screen.getByPlaceholderText('請輸入原密碼'), 'wrongPassword');
    await user.type(screen.getByPlaceholderText('請輸入新密碼'), 'newPassword123');
    await user.type(screen.getByPlaceholderText('請再次輸入新密碼'), 'newPassword123');

    await user.click(screen.getByText('確認變更'));

    await waitFor(() => {
      expect(screen.getByText('原密碼錯誤')).toBeInTheDocument();
    });

    expect(namedQuerySpy).toHaveBeenCalledWith('fetchUserById', [5]);
    expect(namedQuerySpy).not.toHaveBeenCalledWith('updateUserPassword', expect.anything());
  });

  it('原密碼正確且新密碼一致時應成功呼叫 updateUserPassword 並完成變更', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByText('變更密碼'));

    await user.type(screen.getByPlaceholderText('請輸入原密碼'), 'oldPassword123');
    await user.type(screen.getByPlaceholderText('請輸入新密碼'), 'newSecurePass456');
    await user.type(screen.getByPlaceholderText('請再次輸入新密碼'), 'newSecurePass456');

    await user.click(screen.getByText('確認變更'));

    await waitFor(() => {
      expect(namedQuerySpy).toHaveBeenCalledWith('fetchUserById', [5]);
    });

    const expectedNewHash = await hashPassword('newSecurePass456');
    await waitFor(() => {
      expect(namedQuerySpy).toHaveBeenCalledWith('updateUserPassword', [expectedNewHash, 5]);
      expect(alertSpy).toHaveBeenCalledWith('密碼變更成功，下次登入請使用新密碼。');
    });
  });

  it('新密碼與確認密碼不一致時應提示錯誤且不送出查詢', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByText('變更密碼'));

    await user.type(screen.getByPlaceholderText('請輸入原密碼'), 'oldPassword123');
    await user.type(screen.getByPlaceholderText('請輸入新密碼'), 'passA');
    await user.type(screen.getByPlaceholderText('請再次輸入新密碼'), 'passB');

    await user.click(screen.getByText('確認變更'));

    expect(screen.getByText('新密碼與確認密碼不一致')).toBeInTheDocument();
    expect(namedQuerySpy).not.toHaveBeenCalledWith('fetchUserById', expect.anything());
  });

  it('當 authUser 缺少 id 時，應能 fallback 透過 fetchUserByUsername 驗證並完成變更', async () => {
    const user = userEvent.setup();
    mockAuthUser = { username: 'testuser', full_name: '測試同仁', role: 'IT' };

    const oldHashed = await hashPassword('oldPassword123');
    namedQuerySpy.mockImplementation((query, params) => {
      if (query === 'fetchUserByUsername') {
        return Promise.resolve({
          success: true,
          rows: [{ id: 5, username: 'testuser', password_hash: oldHashed }]
        });
      }
      if (query === 'updateUserPassword') return Promise.resolve({ success: true });
      return Promise.resolve({ success: true, rows: [] });
    });

    renderComponent();

    await user.click(screen.getByText('變更密碼'));
    await user.type(screen.getByPlaceholderText('請輸入原密碼'), 'oldPassword123');
    await user.type(screen.getByPlaceholderText('請輸入新密碼'), 'fallbackPass789');
    await user.type(screen.getByPlaceholderText('請再次輸入新密碼'), 'fallbackPass789');

    await user.click(screen.getByText('確認變更'));

    await waitFor(() => {
      expect(namedQuerySpy).toHaveBeenCalledWith('fetchUserByUsername', ['testuser']);
    });
    const expectedNewHash = await hashPassword('fallbackPass789');
    await waitFor(() => {
      expect(namedQuerySpy).toHaveBeenCalledWith('updateUserPassword', [expectedNewHash, 5]);
    });
  });
});
