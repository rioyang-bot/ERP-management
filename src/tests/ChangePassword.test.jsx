import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import { RoleContext } from '../context/RoleContext';

import { ThemeProvider } from '../context/ThemeContext';

// 變更密碼已改為伺服器端驗證：
// 前端只負責把「目前密碼」與「新密碼」送給 authChangePassword，
// 不再取得 password_hash、也不再自行計算或比對雜湊。
describe('使用者變更密碼功能 (Change Password) 測試', () => {
  let mockAuthUser;
  let namedQuerySpy;
  let changePasswordSpy;
  let alertSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    alertSpy = vi.fn();
    window.alert = alertSpy;

    mockAuthUser = {
      id: 5,
      username: 'testuser',
      full_name: '測試同仁',
      role: 'IT',
      menu_access: { overview: true }
    };

    namedQuerySpy = vi.fn(() => Promise.resolve({ success: true, rows: [] }));
    changePasswordSpy = vi.fn(() => Promise.resolve({ success: true }));

    window.electronAPI = {
      namedQuery: namedQuerySpy,
      authLogin: vi.fn(),
      authChangePassword: changePasswordSpy,
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

  it('伺服器回報原密碼不正確時應顯示錯誤且不視為成功', async () => {
    const user = userEvent.setup();
    changePasswordSpy.mockResolvedValue({ success: false, error: '目前密碼不正確。' });
    renderComponent();

    await user.click(screen.getByText('變更密碼'));

    await user.type(screen.getByPlaceholderText('請輸入原密碼'), 'wrongPassword');
    await user.type(screen.getByPlaceholderText('請輸入新密碼'), 'newPassword123');
    await user.type(screen.getByPlaceholderText('請再次輸入新密碼'), 'newPassword123');

    await user.click(screen.getByText('確認變更'));

    await waitFor(() => {
      expect(screen.getByText('目前密碼不正確。')).toBeInTheDocument();
    });

    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('應把明文密碼交給伺服器驗證，且不得外洩密碼雜湊相關查詢', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByText('變更密碼'));

    await user.type(screen.getByPlaceholderText('請輸入原密碼'), 'oldPassword123');
    await user.type(screen.getByPlaceholderText('請輸入新密碼'), 'newSecurePass456');
    await user.type(screen.getByPlaceholderText('請再次輸入新密碼'), 'newSecurePass456');

    await user.click(screen.getByText('確認變更'));

    await waitFor(() => {
      expect(changePasswordSpy).toHaveBeenCalledWith('oldPassword123', 'newSecurePass456');
    });

    // 舊流程會先撈出 password_hash 再於前端比對，這些查詢必須已完全消失
    expect(namedQuerySpy).not.toHaveBeenCalledWith('fetchUserById', expect.anything());
    expect(namedQuerySpy).not.toHaveBeenCalledWith('fetchUserByUsername', expect.anything());
    expect(namedQuerySpy).not.toHaveBeenCalledWith('updateUserPassword', expect.anything());

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('密碼變更成功，其他裝置的登入狀態已一併登出。');
    });
  });

  it('新密碼與確認密碼不一致時應提示錯誤且不送出請求', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByText('變更密碼'));

    await user.type(screen.getByPlaceholderText('請輸入原密碼'), 'oldPassword123');
    await user.type(screen.getByPlaceholderText('請輸入新密碼'), 'passA');
    await user.type(screen.getByPlaceholderText('請再次輸入新密碼'), 'passB');

    await user.click(screen.getByText('確認變更'));

    expect(screen.getByText('新密碼與確認密碼不一致')).toBeInTheDocument();
    expect(changePasswordSpy).not.toHaveBeenCalled();
  });

  it('伺服器連線失敗時應顯示錯誤訊息', async () => {
    const user = userEvent.setup();
    changePasswordSpy.mockResolvedValue({ success: false, error: '連線階段已失效，請重新登入。' });
    renderComponent();

    await user.click(screen.getByText('變更密碼'));
    await user.type(screen.getByPlaceholderText('請輸入原密碼'), 'oldPassword123');
    await user.type(screen.getByPlaceholderText('請輸入新密碼'), 'fallbackPass789');
    await user.type(screen.getByPlaceholderText('請再次輸入新密碼'), 'fallbackPass789');

    await user.click(screen.getByText('確認變更'));

    await waitFor(() => {
      expect(screen.getByText('連線階段已失效，請重新登入。')).toBeInTheDocument();
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
