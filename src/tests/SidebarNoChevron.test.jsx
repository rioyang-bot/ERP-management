import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import { RoleContext } from '../context/RoleContext';
import { ThemeProvider } from '../context/ThemeContext';

/**
 * 左側主選單不顯示「>」箭頭
 *
 * 設備、硬體、耗材列表與報表中心後面原本有一個箭頭，看起來像有子選單，
 * 其實點下去就是直接進頁面，沒有任何子選單。
 */
const AUTH_USER = {
  id: 1, username: 'tester', full_name: '測試員', role: 'ADMIN',
  menu_access: { overview: true, assetList: true, 'nic-list': true, 'consumable-list': true, reports: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.alert = vi.fn();
  window.electronAPI = {
    namedQuery: vi.fn(async () => ({ success: true, rows: [] })),
    getDashboardStats: vi.fn(async () => ({ success: true })),
    authChangePassword: vi.fn(),
  };
});

describe('左側主選單', () => {
  it('原本有箭頭的四項都不再顯示箭頭', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <RoleContext.Provider value={{ authUser: AUTH_USER, role: 'ADMIN', setAuthUser: vi.fn() }}>
            <MainLayout />
          </RoleContext.Provider>
        </MemoryRouter>
      </ThemeProvider>
    );
    for (const id of ['assetList', 'nic-list', 'consumable-list', 'reports']) {
      await waitFor(() => expect(screen.getByTestId(`sidebar-menu-${id}`)).toBeInTheDocument());
      expect(screen.getByTestId(`sidebar-menu-${id}`).querySelector('svg'), id).toBeNull();
    }
  });
});
