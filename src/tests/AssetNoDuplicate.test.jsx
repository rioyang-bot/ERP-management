import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { queries } from '../../database/queries';
import { sameAssetNo, checkDuplicateAssetNo } from '../utils/assetNo';

/**
 * 資產序號 (Asset No) 不可與其他設備重複
 *
 * 財產清冊與盤點靠資產序號對實物，兩台同號就對不起來。會改到資產序號的兩個地方
 * —— 盤點表的「編輯詳細資訊」與設備列表的編輯視窗 —— 存檔前都要檢查。
 * 只在編號有改時檢查：既有資料就算撞號，改其他欄位也不該被擋。
 */
const HOLDER = { id: 77, sn: 'OTHER-SN-1', asset_no: 'METECH-2026-009', brand: 'CISCO', model: 'C9200' };

let dupRows;
let checkResult;
const calls = (name) => window.electronAPI.namedQuery.mock.calls.filter(([q]) => q === name);

const setup = (extra = {}) => {
  window.electronAPI = {
    namedQuery: vi.fn((query, params) => {
      if (extra[query]) return Promise.resolve(extra[query]);
      if (query === 'checkAssetNoExistsExcludeSelf') {
        if (checkResult) return Promise.resolve(checkResult);
        const hit = dupRows.find((r) => sameAssetNo(r.asset_no, params[0]) && r.id !== params[1]);
        return Promise.resolve({ success: true, rows: hit ? [hit] : [] });
      }
      if (query === 'updateCompanyAssetStocktakingInfo') return Promise.resolve({ success: true, rows: [{ id: params[4] }] });
      return Promise.resolve({ success: true, rows: [] });
    }),
    runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
  dupRows = [HOLDER];
  checkResult = null;
});

describe('比對規則', () => {
  it('不分大小寫、忽略前後空白', () => {
    expect(sameAssetNo(' metech-001 ', 'METECH-001')).toBe(true);
    expect(sameAssetNo('', null)).toBe(true);
    expect(sameAssetNo('METECH-001', 'METECH-002')).toBe(false);
  });

  it('空白（未編號）不查', async () => {
    setup();
    expect(await checkDuplicateAssetNo('   ', 1)).toBeNull();
    expect(calls('checkAssetNoExistsExcludeSelf')).toHaveLength(0);
  });

  it('撞號時訊息帶出佔用的那一台', async () => {
    setup();
    const msg = await checkDuplicateAssetNo(' metech-2026-009 ', 1);
    expect(calls('checkAssetNoExistsExcludeSelf')[0][1]).toEqual(['metech-2026-009', 1]);
    expect(msg).toContain('資產序號「metech-2026-009」已被其他設備使用');
    expect(msg).toContain('CISCO C9200');
    expect(msg).toContain('OTHER-SN-1');
  });

  it('查詢失敗也擋下，不讓可能重複的編號存進去', async () => {
    setup();
    checkResult = { success: false, error: 'db down' };
    expect(await checkDuplicateAssetNo('X-1', 1)).toContain('無法檢查資產序號是否重複');
  });

  it('查詢排除自己、不分大小寫', () => {
    const sql = queries.checkAssetNoExistsExcludeSelf;
    expect(sql).toContain('UPPER(TRIM(a.asset_no)) = UPPER(TRIM($1::text))');
    expect(sql).toContain('a.id <> $2::integer');
  });
});

describe('盤點表 > 公司資產 > 編輯詳細資訊', () => {
  const ROWS = [
    { id: 1, sn: 'QTU5250009', asset_no: 'METECH-2026-001', brand: 'RARITAN', model: 'PX3-5466R', status: 'ACTIVE', location: 'BQDC3F', category_name: '設備', end_user: null, remarks: null },
  ];

  const openEdit = async () => {
    setup({ fetchCompanyAssets: { success: true, rows: ROWS } });
    const { default: Stocktaking } = await import('../pages/Stocktaking');
    render(<Stocktaking />);
    await userEvent.click(screen.getByText('公司資產盤點'));
    await screen.findByText('QTU5250009');
    await userEvent.click(within(screen.getByText('QTU5250009').closest('tr')).getByRole('button', { name: /編輯詳細資訊/ }));
    return screen.getByRole('dialog', { name: '編輯詳細資訊' });
  };

  it('改成別台已用的編號：提示、不存檔、不記事件、視窗不關', async () => {
    const dialog = await openEdit();
    const input = within(dialog).getByLabelText('資產序號 (Asset No)');
    await userEvent.clear(input);
    await userEvent.type(input, 'metech-2026-009');
    await userEvent.click(within(dialog).getByRole('button', { name: /儲存/ }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('已被其他設備使用')));
    expect(calls('updateCompanyAssetStocktakingInfo')).toHaveLength(0);
    expect(calls('insertAuditLog')).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('改成沒人用的編號：照常存檔', async () => {
    const dialog = await openEdit();
    const input = within(dialog).getByLabelText('資產序號 (Asset No)');
    await userEvent.clear(input);
    await userEvent.type(input, 'METECH-2026-100');
    await userEvent.click(within(dialog).getByRole('button', { name: /儲存/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls('checkAssetNoExistsExcludeSelf')[0][1]).toEqual(['METECH-2026-100', 1]);
    expect(calls('updateCompanyAssetStocktakingInfo')).toHaveLength(1);
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('編號沒改、只改其他欄位：不查重，既有撞號也不擋', async () => {
    dupRows = [HOLDER, { ...HOLDER, id: 78, asset_no: 'METECH-2026-001' }];
    const dialog = await openEdit();
    await userEvent.type(within(dialog).getByLabelText('存放地點 (Location)'), '-A');
    await userEvent.click(within(dialog).getByRole('button', { name: /儲存/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls('checkAssetNoExistsExcludeSelf')).toHaveLength(0);
    expect(calls('updateCompanyAssetStocktakingInfo')).toHaveLength(1);
  });
});

describe('設備列表 > 編輯詳細資訊', () => {
  const DEVICE = {
    id: 1, item_master_id: 5, sn: 'QTU5250009', brand: 'RARITAN', type: 'PDU', model: 'PX3-5466R',
    specification: '', ownership: 'COMPANY', asset_no: 'METECH-2026-001',
    status: 'ACTIVE', custom_attributes: {}, components: [],
  };

  const openEdit = async (device = DEVICE) => {
    setup({
      fetchAssetsList: { success: true, rows: [device] },
      fetchAssetsListByBrand: { success: true, rows: [device] },
      countAssetsByMasterId: { success: true, rows: [{ count: 1 }] },
      updateAssetDetails: { success: true, rows: [] },
    });
    const { default: DeviceList } = await import('../pages/DeviceList');
    render(<MemoryRouter initialEntries={['/devices?brand=RARITAN']}><DeviceList /></MemoryRouter>);
    await screen.findByText('QTU5250009');
    fireEvent.click(screen.getByText('QTU5250009').closest('tr').querySelector('td:last-child button'));
    fireEvent.click(await screen.findByText(/編輯詳細資訊/));
    await screen.findByText('修改詳細設備資訊');
  };

  it('改成別台已用的編號：提示並且不存檔', async () => {
    await openEdit();
    fireEvent.change(screen.getByDisplayValue('METECH-2026-001'), { target: { value: 'METECH-2026-009' } });
    fireEvent.click(screen.getByText(/儲存變更/));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('資產序號「METECH-2026-009」已被其他設備使用')));
    expect(calls('updateAssetDetails')).toHaveLength(0);
    expect(calls('insertAuditLog')).toHaveLength(0);
  });

  it('改成沒人用的編號：照常存檔並記事件', async () => {
    await openEdit();
    fireEvent.change(screen.getByDisplayValue('METECH-2026-001'), { target: { value: 'METECH-2026-100' } });
    fireEvent.click(screen.getByText(/儲存變更/));

    await waitFor(() => expect(calls('updateAssetDetails')).toHaveLength(1));
    expect(calls('updateAssetDetails')[0][1][14]).toBe('METECH-2026-100');
    await waitFor(() => expect(calls('insertAuditLog').length).toBeGreaterThan(0));
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('編號沒改就不查重', async () => {
    await openEdit();
    fireEvent.click(screen.getByText(/儲存變更/));
    await waitFor(() => expect(calls('updateAssetDetails')).toHaveLength(1));
    expect(calls('checkAssetNoExistsExcludeSelf')).toHaveLength(0);
  });
});
