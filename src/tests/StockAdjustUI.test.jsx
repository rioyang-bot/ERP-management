import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { RoleContext } from '../context/RoleContext';
import ConsumableList from '../pages/ConsumableList';
import Stocktaking from '../pages/Stocktaking';
import StockAdjustModal from '../components/StockAdjustModal';

/**
 * 耗材盤點調整（畫面）
 *
 * 入口在耗材列表的操作選單與庫存盤點表的耗材分頁，只有勾了「可盤點調整」的帳號看得到。
 * 權限、數量比對、事件紀錄由伺服器負責（見 StockAdjustRoutes.test.js），這裡測輸入、
 * 差額顯示、送出的內容、數量被別人改過時的處理，以及調整後重新載入。
 */
const ITEM = { id: 88, item_master_id: 88, category_name: '耗材', brand: 'METECH', type: '光纖線', model: 'LC-LC-OM4-3M', specification: '多模 3米', unit: '條', stock_qty: 50, lab_qty: 10, safety_stock: 20 };

const ALLOWED = { authUser: { id: 7, full_name: '王倉管', role: 'WAREHOUSE', menu_access: { stockAdjust: true } } };
const DENIED = { authUser: { id: 1, full_name: '管理員', role: 'ADMIN', menu_access: { inventory: true } } };

let adjustResult;
beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
  adjustResult = { success: true, before: 50, after: 47, diff: -3 };
  window.electronAPI = {
    namedQuery: vi.fn((query) => {
      if (['fetchConsumablesList', 'fetchConsumablesListByType', 'fetchStocktakingConsumables'].includes(query)) {
        return Promise.resolve({ success: true, rows: [ITEM] });
      }
      return Promise.resolve({ success: true, rows: [] });
    }),
    stockAdjust: vi.fn(() => Promise.resolve(adjustResult)),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
});

const fetchCount = (name) => window.electronAPI.namedQuery.mock.calls.filter(([q]) => q === name).length;

describe('調整視窗', () => {
  const open = (props = {}) => {
    const onAdjusted = vi.fn();
    const onClose = vi.fn();
    render(<StockAdjustModal item={ITEM} onAdjusted={onAdjusted} onClose={onClose} {...props} />);
    return { onAdjusted, onClose, dialog: screen.getByRole('dialog', { name: '盤點調整' }) };
  };

  it('顯示系統 Stock 與 LAB；輸入實盤數量後顯示差額', async () => {
    const { dialog } = open();
    expect(screen.getByTestId('adjust-system-qty')).toHaveTextContent('50 條');
    expect(dialog).toHaveTextContent('10 條（不在這裡調整）');
    await userEvent.type(screen.getByLabelText('實盤數量 (Stock)'), '47');
    expect(screen.getByTestId('adjust-diff')).toHaveTextContent('Stock 50 → 47（盤虧 −3）');
    await userEvent.clear(screen.getByLabelText('實盤數量 (Stock)'));
    await userEvent.type(screen.getByLabelText('實盤數量 (Stock)'), '52');
    expect(screen.getByTestId('adjust-diff')).toHaveTextContent('盤盈 +2');
  });

  it('送出：帶上畫面看到的系統數量、實盤數量、原因與說明', async () => {
    const { onAdjusted } = open();
    await userEvent.type(screen.getByLabelText('實盤數量 (Stock)'), '47');
    await userEvent.selectOptions(screen.getByLabelText('調整原因'), '遺失');
    await userEvent.type(screen.getByLabelText(/說明/), ' 10/29 盤點 ');
    await userEvent.click(screen.getByRole('button', { name: '確認調整' }));

    await waitFor(() => expect(onAdjusted).toHaveBeenCalled());
    expect(window.electronAPI.stockAdjust).toHaveBeenCalledWith({
      itemMasterId: 88, expectedStock: 50, actualStock: 47, reason: '遺失', note: '10/29 盤點',
    });
  });

  it.each([
    ['', '遺失', '', '請輸入實盤數量'],
    ['50', '遺失', '', '相同'],
    ['47', '', '', '請選擇調整原因'],
    ['47', '其他', '', '請填寫說明'],
  ])('擋下不完整的輸入：實盤「%s」原因「%s」', async (qty, reason, note, msg) => {
    open();
    if (qty) await userEvent.type(screen.getByLabelText('實盤數量 (Stock)'), qty);
    if (reason) await userEvent.selectOptions(screen.getByLabelText('調整原因'), reason);
    await userEvent.click(screen.getByRole('button', { name: '確認調整' }));
    expect(screen.getByRole('alert')).toHaveTextContent(msg);
    expect(window.electronAPI.stockAdjust).not.toHaveBeenCalled();
  });

  it('數量被別人改過（409）：換成最新的系統數量並提示，不關視窗', async () => {
    adjustResult = { success: false, status: 409, currentStock: 48, error: '系統數量已變動（畫面上是 50，目前是 48）' };
    const { onAdjusted } = open();
    await userEvent.type(screen.getByLabelText('實盤數量 (Stock)'), '47');
    await userEvent.selectOptions(screen.getByLabelText('調整原因'), '遺失');
    await userEvent.click(screen.getByRole('button', { name: '確認調整' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('系統數量已變動'));
    expect(screen.getByTestId('adjust-system-qty')).toHaveTextContent('48 條');
    expect(screen.getByTestId('adjust-diff')).toHaveTextContent('Stock 48 → 47（盤虧 −1）');
    expect(onAdjusted).not.toHaveBeenCalled();
  });

  it('沒有權限（403）：顯示伺服器的訊息', async () => {
    adjustResult = { success: false, status: 403, error: '這個帳號沒有盤點調整的權限' };
    open();
    await userEvent.type(screen.getByLabelText('實盤數量 (Stock)'), '47');
    await userEvent.selectOptions(screen.getByLabelText('調整原因'), '遺失');
    await userEvent.click(screen.getByRole('button', { name: '確認調整' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('沒有盤點調整的權限'));
  });
});

describe('耗材列表的操作選單', () => {
  const show = async (ctx) => {
    render(<RoleContext.Provider value={ctx}><BrowserRouter><ConsumableList /></BrowserRouter></RoleContext.Provider>);
    await waitFor(() => expect(screen.getByText(/顯示全部耗材清單/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/顯示全部耗材清單/));
    await screen.findByText('LC-LC-OM4-3M');
    fireEvent.click(screen.getByTestId('consumable-action-menu-btn'));
    await screen.findByTestId('consumable-edit-detail-btn');
  };

  it('有權限才看得到「盤點調整」', async () => {
    await show(DENIED);
    expect(screen.queryByRole('button', { name: /盤點調整/ })).toBeNull();
  });

  it('調整完成後重新載入列表', async () => {
    await show(ALLOWED);
    fireEvent.click(screen.getByRole('button', { name: /盤點調整/ }));
    const dialog = screen.getByRole('dialog', { name: '盤點調整' });
    const before = fetchCount('fetchConsumablesList');
    await userEvent.type(within(dialog).getByLabelText('實盤數量 (Stock)'), '47');
    await userEvent.selectOptions(within(dialog).getByLabelText('調整原因'), '損壞報廢');
    await userEvent.click(within(dialog).getByRole('button', { name: '確認調整' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '盤點調整' })).toBeNull());
    expect(window.electronAPI.stockAdjust.mock.calls[0][0]).toMatchObject({ itemMasterId: 88, expectedStock: 50, actualStock: 47, reason: '損壞報廢' });
    expect(fetchCount('fetchConsumablesList')).toBeGreaterThan(before);
  });
});

describe('庫存盤點表的耗材分頁', () => {
  const show = async (ctx) => {
    render(<RoleContext.Provider value={ctx}><Stocktaking /></RoleContext.Provider>);
    await userEvent.click(screen.getByText('耗材盤點'));
    await screen.findByText('LC-LC-OM4-3M');
  };
  const headers = () => screen.getAllByRole('columnheader').map((th) => th.textContent.trim());

  it('沒有權限：沒有操作欄', async () => {
    await show(DENIED);
    expect(headers()).not.toContain('操作');
    expect(screen.queryByRole('button', { name: /盤點調整/ })).toBeNull();
  });

  it('有權限：最後一欄「盤點調整」（列印時不出現），調整後重新載入', async () => {
    await show(ALLOWED);
    const h = screen.getAllByRole('columnheader');
    expect(h.at(-1).textContent).toBe('操作');
    expect(h.at(-1).className).toContain('st-no-print');

    await userEvent.click(within(screen.getByText('LC-LC-OM4-3M').closest('tr')).getByRole('button', { name: /盤點調整/ }));
    const dialog = screen.getByRole('dialog', { name: '盤點調整' });
    const before = fetchCount('fetchStocktakingConsumables');
    await userEvent.type(within(dialog).getByLabelText('實盤數量 (Stock)'), '47');
    await userEvent.selectOptions(within(dialog).getByLabelText('調整原因'), '遺失');
    await userEvent.click(within(dialog).getByRole('button', { name: '確認調整' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '盤點調整' })).toBeNull());
    expect(fetchCount('fetchStocktakingConsumables')).toBeGreaterThan(before);
  });

  it('設備盤點分頁即使有權限也沒有盤點調整（設備數量是算出來的）', async () => {
    render(<RoleContext.Provider value={ALLOWED}><Stocktaking /></RoleContext.Provider>);
    await waitFor(() => expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('fetchStocktakingAssets'));
    expect(headers()).not.toContain('操作');
  });
});
