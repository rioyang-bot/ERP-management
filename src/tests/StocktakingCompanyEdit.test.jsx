import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queries } from '../../database/queries';

/**
 * 庫存盤點表 > 公司資產：編輯詳細資訊
 *
 * 盤點時順手補資產序號、存放地點、保管人(End-User)與備註，不必再跑去設備／硬體列表。
 * 存檔後表格當場更新，並在事件紀錄記一筆（模組跟著資產分類走，品項履歷才接得回那一台）。
 */
const COMPANY_ROWS = [
  { id: 1, sn: 'QTU5250009', asset_no: 'METECH-2026-001', brand: 'RARITAN', model: 'PX3-5466R', status: 'ACTIVE', location: 'BQDC3F', category_name: '設備', end_user: '王大明', remarks: null },
  { id: 2, sn: 'NIC0000002', asset_no: null, brand: 'INTEL', model: 'X710-DA2', status: 'ACTIVE', location: '', category_name: '硬體', end_user: null, remarks: '舊備註' },
];

let updateResult;
beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
  updateResult = { success: true, rows: [{ id: 1 }] };
  window.electronAPI = {
    namedQuery: vi.fn((query) => {
      if (query === 'fetchCompanyAssets') return Promise.resolve({ success: true, rows: COMPANY_ROWS });
      if (query === 'fetchStocktakingAssets') return Promise.resolve({ success: true, rows: [{ item_master_id: 9, category_name: '設備', brand: 'ARISTA', model: 'DCS-7010TX', stock_qty: 2 }] });
      if (query === 'updateCompanyAssetStocktakingInfo') return Promise.resolve(updateResult);
      return Promise.resolve({ success: true, rows: [] });
    }),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
});

const showCompany = async () => {
  const { default: Stocktaking } = await import('../pages/Stocktaking');
  render(<Stocktaking />);
  await userEvent.click(screen.getByText('公司資產盤點'));
  await screen.findByText('QTU5250009');
};

const rowOf = (sn) => screen.getByText(sn).closest('tr');
const openEdit = async (sn) => {
  await userEvent.click(within(rowOf(sn)).getByRole('button', { name: /編輯詳細資訊/ }));
  return screen.getByRole('dialog', { name: '編輯詳細資訊' });
};
const calls = (name) => window.electronAPI.namedQuery.mock.calls.filter(([q]) => q === name);

describe('公司資產盤點：編輯詳細資訊', () => {
  it('每一列都有「編輯詳細資訊」，放在最後一欄、列印時不出現', async () => {
    await showCompany();
    const headers = screen.getAllByRole('columnheader');
    expect(headers[headers.length - 1].textContent).toBe('操作');
    expect(headers[headers.length - 1].className).toContain('st-no-print');
    for (const sn of ['QTU5250009', 'NIC0000002']) {
      expect(within(rowOf(sn)).getByRole('button', { name: /編輯詳細資訊/ })).toBeInTheDocument();
    }
  });

  it('設備盤點（依品項加總）沒有這個按鈕', async () => {
    const { default: Stocktaking } = await import('../pages/Stocktaking');
    render(<Stocktaking />);
    await screen.findByText('DCS-7010TX');
    expect(screen.queryByRole('button', { name: /編輯詳細資訊/ })).toBeNull();
  });

  it('視窗帶出目前的值，廠牌型號序號只讀', async () => {
    await showCompany();
    const dialog = await openEdit('QTU5250009');
    expect(within(dialog).getByLabelText('資產序號 (Asset No)')).toHaveValue('METECH-2026-001');
    expect(within(dialog).getByLabelText('存放地點 (Location)')).toHaveValue('BQDC3F');
    expect(within(dialog).getByLabelText('保管人(End-User)')).toHaveValue('王大明');
    expect(within(dialog).getByLabelText('備註 (Remarks)')).toHaveValue('');
    expect(dialog).toHaveTextContent('RARITAN PX3-5466R');
    expect(within(dialog).queryByDisplayValue('QTU5250009')).toBeNull();
  });

  it('儲存：寫入資料庫、表格當場更新、事件紀錄記下改了什麼', async () => {
    await showCompany();
    const dialog = await openEdit('QTU5250009');
    const endUser = within(dialog).getByLabelText('保管人(End-User)');
    await userEvent.clear(endUser);
    await userEvent.type(endUser, '陳小華');
    await userEvent.type(within(dialog).getByLabelText('備註 (Remarks)'), '盤點補登');
    await userEvent.click(within(dialog).getByRole('button', { name: /儲存/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls('updateCompanyAssetStocktakingInfo')[0][1]).toEqual(['METECH-2026-001', 'BQDC3F', '陳小華', '盤點補登', 1]);
    expect(within(rowOf('QTU5250009')).getByText('陳小華')).toBeInTheDocument();

    const logs = calls('insertAuditLog');
    expect(logs).toHaveLength(1);
    const p = logs[0][1];
    expect(p[3]).toBe('UPDATE');
    expect(p[4]).toBe('DEVICE');
    expect(p[6]).toBe('QTU5250009');
    expect(p[8]).toContain('保管人「王大明」→「陳小華」');
    expect(p[8]).toContain('備註「空白」→「盤點補登」');
    expect(p[8]).not.toContain('存放地點');
    expect(p[9].source).toBe('庫存盤點表');
    expect(p[9].changes.map((c) => c.field)).toEqual(['end_user', 'remarks']);
  });

  it('硬體的公司資產記在硬體模組；清空的欄位存成空白', async () => {
    updateResult = { success: true, rows: [{ id: 2 }] };
    await showCompany();
    const dialog = await openEdit('NIC0000002');
    await userEvent.type(within(dialog).getByLabelText('資產序號 (Asset No)'), 'METECH-HW-9');
    await userEvent.clear(within(dialog).getByLabelText('備註 (Remarks)'));
    await userEvent.click(within(dialog).getByRole('button', { name: /儲存/ }));

    await waitFor(() => expect(calls('insertAuditLog')).toHaveLength(1));
    const p = calls('insertAuditLog')[0][1];
    expect(p[4]).toBe('HARDWARE');
    expect(p[6]).toBe('NIC0000002');
    expect(p[8]).toContain('資產序號「空白」→「METECH-HW-9」');
    expect(p[8]).toContain('備註「舊備註」→「空白」');
    expect(within(rowOf('NIC0000002')).getByText('METECH-HW-9')).toBeInTheDocument();
  });

  it('什麼都沒改就不寫資料庫、也不記事件', async () => {
    await showCompany();
    const dialog = await openEdit('QTU5250009');
    await userEvent.click(within(dialog).getByRole('button', { name: /儲存/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls('updateCompanyAssetStocktakingInfo')).toHaveLength(0);
    expect(calls('insertAuditLog')).toHaveLength(0);
  });

  it('沒更新到（例如已改成一般銷售）就提示、不記事件、視窗不關', async () => {
    updateResult = { success: true, rows: [] };
    await showCompany();
    const dialog = await openEdit('QTU5250009');
    await userEvent.type(within(dialog).getByLabelText('存放地點 (Location)'), '-A');
    await userEvent.click(within(dialog).getByRole('button', { name: /儲存/ }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('儲存失敗')));
    expect(calls('insertAuditLog')).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('保管人可從其他公司資產填過的名字挑', async () => {
    await showCompany();
    await openEdit('NIC0000002');
    const options = [...document.querySelectorAll('#company-edit-end-users option')].map((o) => o.value);
    expect(options).toEqual(['王大明']);
  });
});

describe('寫入的查詢', () => {
  const sql = queries.updateCompanyAssetStocktakingInfo;

  it('只改公司資產', () => {
    expect(sql).toContain("WHERE id = $5::integer AND ownership = 'COMPANY'");
  });

  it('End-user 欄位與 custom_attributes 兩處一起寫，列表才不會顯示舊值', () => {
    expect(sql).toContain("end_user = NULLIF(TRIM($3::text), '')");
    expect(sql).toContain("jsonb_build_object('end_user', COALESCE(TRIM($3::text), ''))");
  });

  it('盤點表讀得到備註，視窗才能帶出原本的內容', () => {
    expect(queries.fetchCompanyAssets).toContain('a.remarks');
  });
});
