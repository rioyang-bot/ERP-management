import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import { RoleContext } from '../context/RoleContext';
import { ThemeProvider } from '../context/ThemeContext';

/**
 * 左側主選單的拖曳排序
 *
 * 先前拖曳時只有被拖的那一項變淡，完全看不出放開之後會落在哪裡 ——
 * 使用者只能放開來看結果，不對再拖一次。
 *
 * 排序是「先把來源抽掉，再插到目標當時的位置」：往下拖時目標會遞補上來，
 * 來源因此落在它下面；往上拖則插在它上面。指示線要畫在真正會落下的那一邊。
 */
const AUTH_USER = {
  id: 1, username: 'tester', full_name: '測試員', role: 'ADMIN',
  menu_access: { overview: true, dnList: true, lentList: true, repairList: true },
};

const renderLayout = () => render(
  <ThemeProvider>
    <MemoryRouter>
      <RoleContext.Provider value={{ authUser: AUTH_USER, role: 'ADMIN', setAuthUser: vi.fn() }}>
        <MainLayout />
      </RoleContext.Provider>
    </MemoryRouter>
  </ThemeProvider>
);

/** 以假的 dataTransfer 模擬把某一項拖到另一項上 */
const dragOver = (sourceEl, targetEl) => {
  const store = {};
  const dataTransfer = {
    setData: (k, v) => { store[k] = v; },
    getData: (k) => store[k] || '',
    effectAllowed: '',
  };
  fireEvent.dragStart(sourceEl, { dataTransfer });
  fireEvent.dragOver(targetEl, { dataTransfer });
  return dataTransfer;
};

describe('主選單拖曳時看得到落點', () => {
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

  const item = (id) => screen.getByTestId(`sidebar-menu-${id}`);

  it('還沒開始拖曳時沒有任何指示線', async () => {
    renderLayout();
    await waitFor(() => expect(item('overview')).toBeInTheDocument());

    expect(item('dnList').getAttribute('data-drop-edge')).toBeNull();
    expect(item('dnList').style.boxShadow).toBe('none');
  });

  it('往下拖時，指示線畫在目標的下緣', async () => {
    renderLayout();
    await waitFor(() => expect(item('overview')).toBeInTheDocument());

    dragOver(item('overview'), item('dnList'));

    // 抽掉 overview 之後 dnList 會遞補上來，overview 落在它下面
    expect(item('dnList').getAttribute('data-drop-edge')).toBe('bottom');
    expect(item('dnList').style.boxShadow).toContain('inset 0 -3px');
  });

  it('往上拖時，指示線畫在目標的上緣', async () => {
    renderLayout();
    await waitFor(() => expect(item('overview')).toBeInTheDocument());

    dragOver(item('lentList'), item('dnList'));

    expect(item('dnList').getAttribute('data-drop-edge')).toBe('top');
    expect(item('dnList').style.boxShadow).toContain('inset 0 3px');
  });

  it('滑過自己不會出現指示線', async () => {
    renderLayout();
    await waitFor(() => expect(item('overview')).toBeInTheDocument());

    dragOver(item('dnList'), item('dnList'));

    expect(item('dnList').getAttribute('data-drop-edge')).toBeNull();
  });

  it('滑走之後指示線跟著消失', async () => {
    renderLayout();
    await waitFor(() => expect(item('overview')).toBeInTheDocument());

    dragOver(item('overview'), item('dnList'));
    expect(item('dnList').getAttribute('data-drop-edge')).toBe('bottom');

    fireEvent.dragLeave(item('dnList'));
    expect(item('dnList').getAttribute('data-drop-edge')).toBeNull();
  });

  it('放開之後順序真的改了，而且指示線收掉', async () => {
    renderLayout();
    await waitFor(() => expect(item('overview')).toBeInTheDocument());

    const dataTransfer = dragOver(item('overview'), item('dnList'));
    fireEvent.drop(item('dnList'), { dataTransfer });

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('sidebar_menu_order_tester') || '[]');
      expect(saved.indexOf('overview')).toBeGreaterThan(saved.indexOf('dnList'));
    });
    expect(item('dnList').getAttribute('data-drop-edge')).toBeNull();
  });

  /** 指示線用 inset 陰影而不是 border：border 會把該項撐高，整排選單會跟著跳動 */
  it('指示線不會把選單撐高', async () => {
    renderLayout();
    await waitFor(() => expect(item('overview')).toBeInTheDocument());

    dragOver(item('overview'), item('dnList'));

    expect(item('dnList').style.borderTop).toBe('');
    expect(item('dnList').style.borderBottom).toBe('');
  });
});
