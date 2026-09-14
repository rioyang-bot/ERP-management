import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HwList from '../pages/HwList';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { RoleContext } from '../context/RoleContext';
import { createRunTransactionMock } from './helpers/mockTransaction';

/**
 * 廠牌與類型改為可編輯
 *
 * 原本這兩個欄位在編輯視窗是鎖定的，當初建檔輸入錯誤就再也改不掉。
 * 改動後存檔會依「新的」廠牌與類型重新對應品項主檔。
 */
describe('設備／硬體：廠牌與類型可編輯', () => {
  const namedQueryMock = vi.fn();
  let calls;

  const NIC = {
    id: 1,
    sn: 'HW-EDIT-1',
    status: 'ACTIVE',
    ownership: 'FOR_SALE',
    item_master_id: 50,
    brand: 'MELLNOX',          // 當初打錯字的廠牌
    type: 'NIC',
    model: 'CX556A',
    specification: '100G',
    unit: '個',
    custom_attributes: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    namedQueryMock.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchNicList' || query === 'fetchNicListByType') {
        return Promise.resolve({ success: true, rows: [{ ...NIC }] });
      }
      if (query === 'fetchHwBrands') {
        return Promise.resolve({ success: true, rows: [
          { id: 1, name: 'MELLANOX' }, { id: 2, name: 'INTEL' }, { id: 3, name: 'BROADCOM' },
        ] });
      }
      if (query === 'fetchHwTypes') {
        return Promise.resolve({ success: true, rows: [
          { id: 1, name: 'NIC' }, { id: 2, name: 'HBA' },
        ] });
      }
      if (query === 'findItemMaster') return Promise.resolve({ success: true, rows: [] });
      if (query === 'countAssetsByMasterId') return Promise.resolve({ success: true, rows: [{ count: '5' }] });
      if (query === 'insertItemMaster') return Promise.resolve({ success: true, rows: [{ id: 99 }] });
      return Promise.resolve({ success: true, rows: [], rowCount: 1 });
    });

    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
      authLogin: vi.fn(),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const called = (name) => calls.filter((c) => c.query === name);

  const renderList = () => render(
    <ThemeProvider>
      <MemoryRouter>
        <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, role: 'ADMIN' }, setAuthUser: vi.fn() }}>
          <HwList />
        </RoleContext.Provider>
      </MemoryRouter>
    </ThemeProvider>
  );

  /** 開啟該筆硬體的編輯視窗 */
  const openEditor = async () => {
    renderList();
    const box = await screen.findByPlaceholderText(/搜尋/);
    await userEvent.type(box, 'MELLNOX');
    await waitFor(() => expect(screen.getByText('HW-EDIT-1')).toBeInTheDocument());
    const menuBtn = screen.getAllByRole('button').find((b) => b.className?.includes('action-menu-btn'));
    expect(menuBtn).toBeTruthy();
    await userEvent.click(menuBtn);
    const editBtn = await screen.findByText(/編輯/);
    await userEvent.click(editBtn);
  };

  it('廠牌與類型是可以選的下拉選單，不再是鎖定欄位', async () => {
    await openEditor();

    const brandLabel = await screen.findByText(/廠牌 \(Brand\)/);
    expect(brandLabel.textContent).not.toContain('鎖定');
    const typeLabel = screen.getByText(/類型 \(Type\)/);
    expect(typeLabel.textContent).not.toContain('鎖定');
  });

  it('目前的值即使不在主檔清單中也要列得出來，否則改不掉', async () => {
    await openEditor();
    // MELLNOX 是錯字，主檔清單裡只有正確的 MELLANOX
    expect(await screen.findByText(/MELLNOX（目前值）/)).toBeInTheDocument();
  });

  it('開啟編輯時會載入廠牌與類型主檔供選擇', async () => {
    await openEditor();
    await waitFor(() => {
      expect(called('fetchHwBrands').length).toBeGreaterThan(0);
      expect(called('fetchHwTypes').length).toBeGreaterThan(0);
    });
  });
});
