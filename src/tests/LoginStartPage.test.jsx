import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Login from '../pages/Login';

/**
 * 登入後的起始頁面
 *
 * 所有使用者每天重新登入（連線階段 12 小時到期）後，一律從營運總覽開始。
 * 先前登入後固定跳到設備列表。
 */
const USERS = {
  ADMIN: { id: 1, username: 'METECH', role: 'ADMIN', menu_access: {} },
  IT: { id: 2, username: 'it-user', role: 'IT', menu_access: { overview: true, assets: true } },
  WAREHOUSE: { id: 3, username: 'wh-user', role: 'WAREHOUSE', menu_access: { overview: true, inbound: true } },
};

describe('登入後的起始頁面', () => {
  let setAuthUser;

  beforeEach(() => {
    vi.clearAllMocks();
    setAuthUser = vi.fn();
  });

  // 從某個頁面被登出（例如前一天停在設備列表），再從登入頁登入
  const renderLogin = () => render(
    <MemoryRouter initialEntries={['/device-list', '/login']} initialIndex={1}>
      <Routes>
        <Route path="/login" element={<Login setAuthUser={setAuthUser} />} />
        <Route path="/overview" element={<div>營運總覽頁</div>} />
        <Route path="/device-list" element={<div>設備列表頁</div>} />
      </Routes>
    </MemoryRouter>
  );

  const login = async () => {
    await userEvent.type(screen.getByPlaceholderText(/請輸入測試帳號/), 'someone');
    await userEvent.type(screen.getByPlaceholderText('請輸入密碼'), 'pw-12345678');
    await userEvent.keyboard('{Enter}');
  };

  it.each(Object.entries(USERS))('%s 登入後進入營運總覽，不是設備列表', async (_role, user) => {
    window.electronAPI.authLogin = vi.fn().mockResolvedValue({ success: true, user });
    renderLogin();
    await login();

    expect(await screen.findByText('營運總覽頁')).toBeInTheDocument();
    expect(screen.queryByText('設備列表頁')).not.toBeInTheDocument();
    expect(setAuthUser).toHaveBeenCalledWith(user);
  });

  it('登入失敗時留在登入頁並顯示錯誤', async () => {
    window.electronAPI.authLogin = vi.fn().mockResolvedValue({ success: false, error: '帳號或密碼錯誤。' });
    renderLogin();
    await login();

    await waitFor(() => expect(screen.getByText('帳號或密碼錯誤。')).toBeInTheDocument());
    expect(screen.queryByText('營運總覽頁')).not.toBeInTheDocument();
    expect(setAuthUser).not.toHaveBeenCalled();
  });
});
