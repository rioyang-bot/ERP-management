import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Devices from '../pages/Devices';
import { MemoryRouter } from 'react-router-dom';
import { createRunTransactionMock } from './helpers/mockTransaction';

/**
 * 設備建檔頁（/devices）建檔成功後的行為
 *
 * 這頁原本在建檔成功後呼叫一個根本不存在的 fetchAssets()，
 * 丟出 ReferenceError 後被 catch 接住，畫面顯示「建檔失敗」——
 * 但資料其實已經寫進資料庫了，使用者會以為沒成功而重複建立。
 */
describe('設備建檔頁：建檔成功後不應顯示失敗', () => {
  const namedQueryMock = vi.fn();
  let alerts;

  beforeEach(() => {
    vi.clearAllMocks();
    alerts = [];
    window.alert = vi.fn((m) => alerts.push(String(m)));
    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    namedQueryMock.mockImplementation((query) => {
      if (query === 'fetchDeviceBrands') return Promise.resolve({ success: true, rows: [{ id: 1, name: 'DELL' }] });
      if (query === 'fetchDeviceTypes') return Promise.resolve({ success: true, rows: [{ id: 1, name: 'SERVER' }] });
      if (query === 'fetchModelsByBrand') return Promise.resolve({ success: true, rows: [{ id: 1, name: 'R750' }] });
      if (query === 'findItemMaster') return Promise.resolve({ success: true, rows: [{ id: 5 }] });
      if (query === 'insertItemMaster') return Promise.resolve({ success: true, rows: [{ id: 5 }] });
      if (query === 'checkAssetSnExists') return Promise.resolve({ success: true, rows: [] });
      if (query === 'insertAssetRecord') return Promise.resolve({ success: true, rows: [{ id: 1 }], rowCount: 1 });
      return Promise.resolve({ success: true, rows: [], rowCount: 1 });
    });

    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn(),
    };
  });

  it('建檔成功後顯示成功訊息，不會因為呼叫不存在的函式而變成失敗', async () => {
    render(<MemoryRouter><Devices /></MemoryRouter>);

    // 等下拉載入完成，確保表單可以送出
    await waitFor(() => expect(screen.getByDisplayValue('DELL')).toBeInTheDocument());

    // 類型不會自動帶入，必須自己選；廠牌與型號則會帶入第一筆
    const selects = screen.getAllByRole('combobox');
    const typeSelect = selects.find(sel => [...sel.options].some(o => o.value === 'SERVER'));
    await userEvent.selectOptions(typeSelect, 'SERVER');

    const snInput = await screen.findByPlaceholderText(/序號/i);
    await userEvent.type(snInput, 'TEST-SN-001');

    const submit = screen.getByRole('button', { name: '儲存設備資料' });
    await userEvent.click(submit);

    await waitFor(() => expect(alerts.length).toBeGreaterThan(0));
    expect(alerts.some((m) => m.includes('成功'))).toBe(true);
    // 舊版會在成功之後才丟出 ReferenceError，於是又跳一次「建檔失敗」
    expect(alerts.some((m) => m.includes('建檔失敗'))).toBe(false);
  });
});
