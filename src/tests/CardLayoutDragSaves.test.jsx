import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeviceList from '../pages/DeviceList';
import { ThemeProvider } from '../context/ThemeContext';
import { RoleContext } from '../context/RoleContext';

/**
 * 設備列表：拖曳卡片換位置之後，排列真的存得起來
 *
 * 這個測試是為了原本的問題而寫：拖曳當下把排列寫進了另一個 localStorage 鍵值，
 * 讀的時候讀不到，重新整理就回到預設位置 —— 畫面上看起來可以拖，實際上存不住。
 * 規則對但沒接上畫面，使用者得到的仍然是沒有記住的排列。
 */
describe('設備列表：拖曳卡片後的排列會被存起來', () => {
  const DEVICES = [
    { id: 1, sn: 'DEV-1', status: 'ACTIVE', ownership: 'FOR_SALE', item_master_id: 5,
      brand: 'BLACKCORE', type: 'SERVER', model: '3122-SM', specification: '26C',
      unit: '台', custom_attributes: {}, components: [] },
    { id: 2, sn: 'DEV-2', status: 'ACTIVE', ownership: 'FOR_SALE', item_master_id: 6,
      brand: 'DELL', type: 'SERVER', model: 'R750', specification: '32C',
      unit: '台', custom_attributes: {}, components: [] },
  ];

  const setPref = vi.fn();
  const getPref = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.alert = vi.fn();
    getPref.mockResolvedValue({ success: true, value: null });
    setPref.mockResolvedValue({ success: true });

    window.electronAPI = {
      namedQuery: vi.fn((query) => {
        if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') {
          return Promise.resolve({ success: true, rows: DEVICES });
        }
        return Promise.resolve({ success: true, rows: [], rowCount: 1 });
      }),
      runTransaction: vi.fn().mockResolvedValue({ success: true, results: {} }),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn(),
      getUserPreference: getPref,
      setUserPreference: setPref,
    };
  });

  const renderList = () => render(
    <ThemeProvider>
      <MemoryRouter>
        <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, username: 'alice' }, setAuthUser: vi.fn() }}>
          <DeviceList />
        </RoleContext.Provider>
      </MemoryRouter>
    </ThemeProvider>
  );

  /** 以假的 dataTransfer 模擬把第一張卡片拖到指定格子 */
  const dragFirstCardTo = async (container, targetSlotIdx) => {
    const card = await waitFor(() => {
      const el = container.querySelector('[draggable="true"]');
      expect(el).toBeTruthy();
      return el;
    });
    const slots = card.parentElement.parentElement.children;

    let payload = '';
    const dataTransfer = {
      setData: (_type, value) => { payload = value; },
      getData: () => payload,
    };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(slots[targetSlotIdx], { dataTransfer });
    fireEvent.drop(slots[targetSlotIdx], { dataTransfer });
    return payload;
  };

  it('拖曳後把新的排列寫回這個帳號的設定', async () => {
    const { container } = renderList();
    await waitFor(() => expect(container.querySelector('[draggable="true"]')).toBeTruthy());
    // 等伺服器上的排列回來後才開始拖，避免尚未載入時的自動補位干擾
    await waitFor(() => expect(getPref).toHaveBeenCalledWith('cardLayout:deviceList'));

    const movedKey = await dragFirstCardTo(container, 4);
    expect(movedKey).toBeTruthy();

    await waitFor(() => {
      const saved = setPref.mock.calls.filter((c) => c[0] === 'cardLayout:deviceList');
      expect(saved.length).toBeGreaterThan(0);
      // 依聚合維度分開存放，卡片落在第 4 格
      expect(saved.at(-1)[1].SPEC[4]).toBe(movedKey);
    });
  });

  it('排列不再寫進與讀取不同的 localStorage 鍵值', async () => {
    const { container } = renderList();
    await waitFor(() => expect(container.querySelector('[draggable="true"]')).toBeTruthy());
    await waitFor(() => expect(getPref).toHaveBeenCalledWith('cardLayout:deviceList'));

    await dragFirstCardTo(container, 4);

    // 這正是原本存不住的原因：寫 asset_list_layout_map、讀 device_list_layout_map
    expect(localStorage.getItem('asset_list_layout_map')).toBeNull();
  });
});
