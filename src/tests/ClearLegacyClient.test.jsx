import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeviceList from '../pages/DeviceList';

/**
 * 移除設備上的客戶名稱
 *
 * 客戶名稱是從客戶清單選的，但以前直接打字輸入的名稱（例如 METECH）不在清單裡。
 * 下拉找不到對應的選項，就顯示成「請選擇」，選「請選擇」也不算變更，
 * 存檔時原本的 METECH 照樣寫回去 —— 客戶名稱清不掉。
 * 改成：目前的值不在清單裡也列出來（標示不在客戶清單），選「不指定客戶」就能清掉。
 */
const DEVICE = {
  id: 2462, sn: 'STG10003Y26', brand: 'SECRETHFT', type: 'SERVER', model: 'SECRETHFT-ARL',
  specification: '8C-Gen1', ownership: 'FOR_SALE', status: 'ACTIVE', client: 'METECH',
  custom_attributes: {}, components: [], item_master_id: 357,
};

let calls;
beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  window.alert = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  window.electronAPI = {
    namedQuery: vi.fn(async (query, params) => {
      calls.push({ query, params });
      if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') return { success: true, rows: [{ ...DEVICE }] };
      // 客戶清單裡沒有 METECH
      if (query === 'fetchCustomers') return { success: true, rows: [{ id: 1, name: '凱基證券股份有限公司', contact: '', phone: '' }] };
      return { success: true, rows: [], rowCount: 1 };
    }),
    runTransaction: vi.fn(async () => ({ success: true, results: [] })),
    saveFile: vi.fn(), getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
});

const openEditor = async () => {
  render(<MemoryRouter initialEntries={['/devices?brand=SECRETHFT']}><DeviceList /></MemoryRouter>);
  const row = (await screen.findByText('STG10003Y26', {}, { timeout: 5000 })).closest('tr');
  fireEvent.click(row.querySelector('.action-menu-btn'));
  fireEvent.click(await screen.findByText('編輯詳細資訊'));
  return screen.findByLabelText('客戶名稱');
};

describe('設備編輯：客戶名稱', () => {
  it('不在客戶清單裡的名稱照樣顯示，不會變成空白', async () => {
    const select = await openEditor();
    expect(select.value).toBe('METECH');
    expect(within(select).getByRole('option', { name: 'METECH（不在客戶清單）' })).toBeInTheDocument();
  });

  it('選「不指定客戶」後存檔：客戶名稱清空', async () => {
    const select = await openEditor();
    fireEvent.change(select, { target: { value: '' } });
    expect(select.value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /儲存變更/ }));

    await waitFor(() => expect(calls.some((c) => c.query === 'updateAssetDetails')).toBe(true));
    const update = calls.find((c) => c.query === 'updateAssetDetails');
    expect(update.params[1]).toBe('');
    expect(update.params[12]).toBe(2462);
    // 事件紀錄：設備編輯一筆
    await waitFor(() => expect(calls.some((c) => c.query === 'insertAuditLog' && c.params[4] === 'DEVICE')).toBe(true));
  });
});
