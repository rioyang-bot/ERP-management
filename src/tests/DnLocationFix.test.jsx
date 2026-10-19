import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DNList from '../pages/DNList';
import { RoleContext } from '../context/RoleContext';
import { buildLocationFixSteps } from '../utils/dnLocationFix';
import { createRunTransactionMock } from './helpers/mockTransaction';
import { queries } from '../../database/queries';

/**
 * 更正出貨單的出貨地點
 *
 * 修改出貨單只開放「待確認」的單；已出貨的單打錯地點就沒地方改。
 * 明細的出貨地點旁加一支鉛筆：只改地點，任何狀態都能改。
 */
const DN = {
  id: 23, request_no: 'DN-20261015-03', request_type: 'SALE', customer: '凱基證券', location: '5M4 國法',
  shipping_date: '2026-10-15', created_at: '2026-10-16T04:44:17.000Z', status: 'SHIPPED', item_count: 3, creator_name: 'Rio',
};
const ITEMS = [
  { id: 1, item_id: 10, brand: 'ARISTA', model: '10G-SR', type: 'GBIC', category_name: '耗材', sn: null, quantity: 2, location: '5M4 國法' },
  { id: 2, item_id: 11, brand: 'SMC', model: 'SRV', type: 'SERVER', category_name: '設備', sn: 'SRV-1', quantity: 1, location: '5M4 國法' },
  { id: 3, item_id: 12, brand: 'METECH', model: 'DAC', type: 'DAC CABLE', category_name: '耗材', sn: null, quantity: 2, location: '別的機房' },
];

describe('buildLocationFixSteps', () => {
  it('單頭、品項（原本跟單頭一樣的）、已出貨的資產，同一個交易', () => {
    expect(buildLocationFixSteps(23, '5M4 國法', '5M4 國泰')).toEqual([
      { id: 'header', queryName: 'fixOutboundRequestLocation', params: ['5M4 國泰', 23], expectRows: 1, errorMessage: '找不到這張出貨單，可能已被刪除。' },
      { id: 'items', queryName: 'fixOutboundItemsLocation', params: ['5M4 國泰', 23, '5M4 國法'] },
      { id: 'assets', queryName: 'fixShippedAssetsLocation', params: ['5M4 國泰', 23, '5M4 國法'] },
    ]);
  });
  it('品項只改跟舊地點一樣的；資產只改已出貨、地點還是舊的', () => {
    expect(queries.fixOutboundItemsLocation).toContain("COALESCE(TRIM(location), '') = COALESCE(TRIM($3), '')");
    expect(queries.fixShippedAssetsLocation).toContain("a.status = 'SHIPPED'");
    expect(queries.fixShippedAssetsLocation).toContain("COALESCE(TRIM(a.location), '') = COALESCE(TRIM($3), '')");
  });
});

describe('出貨單明細：更正出貨地點', () => {
  let txSteps;
  beforeEach(() => {
    vi.clearAllMocks();
    txSteps = null;
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
    const namedQuery = vi.fn(async (query, params) => {
      if (query === 'fetchDNList') return { success: true, rows: [DN] };
      if (query === 'fetchDNItems') return { success: true, rows: ITEMS };
      if (query === 'fixOutboundRequestLocation') return { success: true, rows: [{ id: params[1], old_location: '5M4 國法' }] };
      if (query === 'fixOutboundItemsLocation') return { success: true, rows: [{ id: 1, sn: null }, { id: 2, sn: 'SRV-1' }] };
      if (query === 'fixShippedAssetsLocation') return { success: true, rows: [{ id: 9, sn: 'SRV-1' }] };
      return { success: true, rows: [] };
    });
    const tx = createRunTransactionMock(namedQuery);
    window.electronAPI = {
      namedQuery,
      runTransaction: vi.fn((steps) => { txSteps = steps; return tx(steps); }),
      saveFile: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const openDN = async () => {
    render(
      <MemoryRouter>
        <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1 }, setAuthUser: vi.fn() }}><DNList /></RoleContext.Provider>
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByTestId('dn-tab-history'));
    const row = (await screen.findByText(DN.request_no)).closest('tr');
    fireEvent.click(within(row).getByTitle('查看詳情'));
    await waitFor(() => expect(screen.getByText('SRV-1')).toBeInTheDocument());
    return document.querySelector('.dm-modal');
  };
  const auditLogs = () => window.electronAPI.namedQuery.mock.calls.filter(([q]) => q === 'insertAuditLog')
    .map(([, p]) => ({ module: p[4], target: p[6], summary: p[8], details: p[9] }));

  it('已出貨的單也能改：單頭、品項、資產一起更正，並寫事件紀錄', async () => {
    const modal = await openDN();
    const summary = modal.querySelector('.dm-summary');
    await userEvent.click(within(summary).getByRole('button', { name: '更正出貨地點' }));
    const input = within(summary).getByLabelText('更正出貨地點');
    expect(input).toHaveValue('5M4 國法');
    await userEvent.clear(input);
    await userEvent.type(input, '5M4 國泰');
    await userEvent.click(within(summary).getByRole('button', { name: '儲存出貨地點' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(txSteps.map((s) => [s.queryName, s.params])).toEqual([
      ['fixOutboundRequestLocation', ['5M4 國泰', 23]],
      ['fixOutboundItemsLocation', ['5M4 國泰', 23, '5M4 國法']],
      ['fixShippedAssetsLocation', ['5M4 國泰', 23, '5M4 國法']],
    ]);
    expect(window.alert.mock.calls[0][0]).toContain('品項發送位置 2 筆、資產 1 件');

    // 畫面上跟著更新：單頭與原本同地點的品項；個別指定別處的不動
    expect(within(summary).getByText('5M4 國泰')).toBeInTheDocument();
    const table = modal.querySelector('.dm-items-table');
    expect(within(table).getAllByText('5M4 國泰')).toHaveLength(2);
    expect(within(table).getByText('別的機房')).toBeInTheDocument();

    const log = auditLogs().find((l) => l.module === 'OUTBOUND');
    expect(log).toMatchObject({ target: 'DN-20261015-03', summary: '更正出貨單 [DN-20261015-03] 出貨地點：[5M4 國法] → [5M4 國泰]（品項 2 筆、資產 SRV-1）' });
    expect(log.details).toMatchObject({ dnId: 23, before: '5M4 國法', after: '5M4 國泰', itemsUpdated: 2, assetSns: ['SRV-1'] });
  });

  it('沒改就不送出；取消回到原本的顯示', async () => {
    const modal = await openDN();
    const summary = modal.querySelector('.dm-summary');
    await userEvent.click(within(summary).getByRole('button', { name: '更正出貨地點' }));
    await userEvent.click(within(summary).getByRole('button', { name: '儲存出貨地點' }));
    expect(window.electronAPI.runTransaction).not.toHaveBeenCalled();
    expect(within(summary).getByText('5M4 國法')).toBeInTheDocument();

    await userEvent.click(within(summary).getByRole('button', { name: '更正出貨地點' }));
    await userEvent.type(within(summary).getByLabelText('更正出貨地點'), 'X');
    await userEvent.click(within(summary).getByRole('button', { name: '取消更正出貨地點' }));
    expect(window.electronAPI.runTransaction).not.toHaveBeenCalled();
    expect(within(summary).getByText('5M4 國法')).toBeInTheDocument();
  });

  it('確認視窗按取消就不改', async () => {
    window.confirm = vi.fn(() => false);
    const modal = await openDN();
    const summary = modal.querySelector('.dm-summary');
    await userEvent.click(within(summary).getByRole('button', { name: '更正出貨地點' }));
    await userEvent.type(within(summary).getByLabelText('更正出貨地點'), 'X');
    await userEvent.click(within(summary).getByRole('button', { name: '儲存出貨地點' }));
    expect(window.electronAPI.runTransaction).not.toHaveBeenCalled();
  });
});
