import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HwList from '../pages/HwList';
import { ThemeProvider } from '../context/ThemeContext';
import { RoleContext } from '../context/RoleContext';
import { createRunTransactionMock } from './helpers/mockTransaction';
import { actionMenuPosition } from '../utils/actionMenuPosition';

/**
 * 列表「…」功能選單不會被畫面切掉
 *
 * 原本假設選單固定高 360、高度上限 80vh。設備的選單其實更高，
 * 筆電解析度小或縮放 150% 時，往下開會被下緣切掉、往上開會被上緣切掉。
 * 改成看按鈕上下實際剩的空間：底下放得下就往下，不然往空間大的那邊開，
 * 高度限制在那一側放得下的範圍，放不下就在選單裡捲動（捲動選單不會把它關掉）。
 */
const rect = (top, height = 24) => ({ top, bottom: top + height, right: 1500, left: 1480, width: 20, height });

describe('選單位置', () => {
  const VIEW = { viewportHeight: 900, viewportWidth: 1600 };

  it('底下放得下：往下開，高度上限是底下剩的空間', () => {
    expect(actionMenuPosition(rect(100), { preferredHeight: 520, ...VIEW })).toEqual({
      isUpward: false, top: 128, right: 100, maxHeight: 900 - 124 - 4 - 8,
    });
  });

  it('底下放不下、上面空間比較大：往上開，高度上限是上面剩的空間（不會超出畫面上緣）', () => {
    const pos = actionMenuPosition(rect(600), { preferredHeight: 520, ...VIEW });
    expect(pos).toMatchObject({ isUpward: true, top: 596, maxHeight: 600 - 4 - 8 });
  });

  it('上下都放不下：往空間大的那邊開，選單在裡面捲動', () => {
    // 筆電 150%：畫面約 700 高，按鈕在中間偏下就往上開、偏上就往下開
    const pos = actionMenuPosition(rect(400), { preferredHeight: 520, viewportHeight: 700, viewportWidth: 1280 });
    expect(pos).toMatchObject({ isUpward: true, maxHeight: 400 - 12 });
    const low = actionMenuPosition(rect(200), { preferredHeight: 520, viewportHeight: 700, viewportWidth: 1280 });
    expect(low).toMatchObject({ isUpward: false, maxHeight: 700 - 224 - 12 });
  });

  it('空間再小也至少 120 高', () => {
    expect(actionMenuPosition(rect(5), { preferredHeight: 520, viewportHeight: 60, viewportWidth: 800 }).maxHeight).toBe(120);
  });
});

describe('硬體列表的選單', () => {
  const NIC = { id: 1, sn: 'HW-MENU-1', status: 'ACTIVE', ownership: 'FOR_SALE', item_master_id: 50, brand: 'MELLANOX', type: 'NIC', model: 'CX5', specification: '', unit: '個', custom_attributes: {} };
  let innerHeight;

  beforeEach(() => {
    innerHeight = window.innerHeight;
    window.innerHeight = 700;
    window.alert = vi.fn();
    const namedQuery = vi.fn(async (q) => (q === 'fetchNicList' || q === 'fetchNicListByType' ? { success: true, rows: [{ ...NIC }] } : { success: true, rows: [] }));
    window.electronAPI = {
      namedQuery,
      runTransaction: createRunTransactionMock(namedQuery),
      saveFile: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });
  afterEach(() => { window.innerHeight = innerHeight; });

  const openMenu = async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, role: 'ADMIN' }, setAuthUser: vi.fn() }}>
            <HwList />
          </RoleContext.Provider>
        </MemoryRouter>
      </ThemeProvider>
    );
    await userEvent.type(await screen.findByPlaceholderText(/搜尋/), 'MELLANOX');
    await waitFor(() => expect(screen.getByText('HW-MENU-1')).toBeInTheDocument());
    const btn = screen.getAllByRole('button').find((b) => b.className?.includes('action-menu-btn'));
    btn.getBoundingClientRect = () => rect(400);
    await userEvent.click(btn);
    return document.querySelector('.dropdown-action-menu');
  };

  it('畫面矮時往空間大的那邊開，高度不超出畫面', async () => {
    const menu = await openMenu();
    expect(menu).toBeTruthy();
    // 往上開：下緣貼著按鈕上方，最高到畫面上緣留 8
    expect(menu.style.bottom).toBe(`${700 - 396}px`);
    expect(menu.style.maxHeight).toBe(`${400 - 12}px`);
    expect(menu.style.overflowY).toBe('auto');
  });

  it('在選單裡捲動不會關掉選單；捲動頁面才關', async () => {
    const menu = await openMenu();
    fireEvent.scroll(menu);
    expect(document.querySelector('.dropdown-action-menu')).toBeTruthy();
    fireEvent.scroll(window);
    expect(document.querySelector('.dropdown-action-menu')).toBeNull();
  });
});
