import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DNList from '../pages/DNList';
import { RoleContext } from '../context/RoleContext';
import { buildEndUserFixSteps, serialItems } from '../utils/dnEndUserFix';
import { createRunTransactionMock } from './helpers/mockTransaction';

/**
 * 出貨單明細修改 End-user
 *
 * 改單頭的 End-user；單上有設備／硬體時，一併覆蓋它們（含搭載的硬體）的 End-user。
 */
const DN = {
  id: 22, request_no: 'DN-20260930-01', request_type: 'SALE', customer: '元大證券', location: 'IDC 5F', end_user: '元大投信',
  shipping_date: '2026-09-30', created_at: '2026-09-30T04:44:17.000Z', status: 'SHIPPED', item_count: 3, creator_name: 'Rio',
};
const ITEMS = [
  { id: 1, item_id: 10, brand: 'SMC', model: 'SRV', type: 'SERVER', category_name: '設備', sn: 'SRV-1', quantity: 1, location: 'IDC 5F' },
  { id: 2, item_id: 11, brand: 'INTEL', model: 'NIC', type: 'NIC', category_name: '硬體', sn: 'NIC-1', quantity: 1, location: 'IDC 5F' },
  { id: 3, item_id: 12, brand: 'METECH', model: '10G-SR', type: 'GBIC', category_name: '耗材', sn: null, quantity: 4, location: 'IDC 5F' },
];

describe('buildEndUserFixSteps', () => {
  it('單頭＋每個有序號的品項（資產本身與它搭載的硬體）', () => {
    expect(buildEndUserFixSteps(22, '元大期貨', ITEMS).map((s) => [s.id, s.queryName, s.params])).toEqual([
      ['header', 'updateOutboundRequestEndUser', ['元大期貨', 22]],
      ['asset-0', 'updateAssetEndUserBySn', ['元大期貨', 'SRV-1']],
      ['mounted-0', 'updateMountedHardwareEndUser', ['元大期貨', 'SRV-1']],
      ['asset-1', 'updateAssetEndUserBySn', ['元大期貨', 'NIC-1']],
      ['mounted-1', 'updateMountedHardwareEndUser', ['元大期貨', 'NIC-1']],
    ]);
  });
  it('只有耗材：只改單頭', () => {
    expect(buildEndUserFixSteps(22, 'X', [ITEMS[2]]).map((s) => s.queryName)).toEqual(['updateOutboundRequestEndUser']);
  });
  it('同一支序號只算一次', () => {
    expect(serialItems([...ITEMS, { ...ITEMS[0], sn: ' srv-1 ' }]).map((it) => it.sn)).toEqual(['SRV-1', 'NIC-1']);
  });
});

describe('出貨單明細：修改 End-user', () => {
  let txSteps;
  beforeEach(() => {
    vi.clearAllMocks();
    txSteps = null;
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
    const namedQuery = vi.fn(async (query, params) => {
      if (query === 'fetchDNList') return { success: true, rows: [DN] };
      if (query === 'fetchDNItems') return { success: true, rows: ITEMS };
      if (query === 'updateOutboundRequestEndUser') return { success: true, rows: [{ id: params[1] }] };
      if (query === 'updateAssetEndUserBySn') return { success: true, rows: [{ id: 1, sn: params[1] }] };
      if (query === 'updateMountedHardwareEndUser') return { success: true, rows: params[1] === 'SRV-1' ? [{ id: 5, sn: 'RAM-1' }, { id: 2, sn: 'NIC-1' }] : [] };
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

  const openDN = async (dn = DN) => {
    window.electronAPI.namedQuery.mockImplementation(((base) => async (q, p) => (q === 'fetchDNList' ? { success: true, rows: [dn] } : base(q, p)))(window.electronAPI.namedQuery.getMockImplementation()));
    render(
      <MemoryRouter>
        <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1 }, setAuthUser: vi.fn() }}><DNList /></RoleContext.Provider>
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByTestId('dn-tab-history'));
    const row = (await screen.findByText(dn.request_no)).closest('tr');
    fireEvent.click(within(row).getByTitle('查看詳情'));
    await waitFor(() => expect(screen.getByText('SRV-1')).toBeInTheDocument());
    return document.querySelector('.dm-modal .dm-summary');
  };
  const auditLogs = () => window.electronAPI.namedQuery.mock.calls.filter(([q]) => q === 'insertAuditLog')
    .map(([, p]) => ({ module: p[4], target: p[6], summary: p[8], details: p[9] }));

  it('沒填過 End-user 的單也有欄位可以改', async () => {
    const summary = await openDN({ ...DN, end_user: null });
    expect(within(summary).getByText('End-user:')).toBeInTheDocument();
    expect(within(summary).getByRole('button', { name: '修改 End-user' })).toBeInTheDocument();
  });

  it('修改後覆蓋單上設備／硬體（含搭載的）的 End-user，並寫事件紀錄', async () => {
    const summary = await openDN();
    await userEvent.click(within(summary).getByRole('button', { name: '修改 End-user' }));
    const input = within(summary).getByLabelText('修改 End-user');
    expect(input).toHaveValue('元大投信');
    await userEvent.clear(input);
    await userEvent.type(input, '元大期貨');
    await userEvent.click(within(summary).getByRole('button', { name: '儲存 End-user' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    // 確認視窗列出會被覆蓋的序號
    expect(window.confirm.mock.calls[0][0]).toContain('SRV-1、NIC-1');
    expect(txSteps.map((s) => s.queryName)).toEqual([
      'updateOutboundRequestEndUser', 'updateAssetEndUserBySn', 'updateMountedHardwareEndUser', 'updateAssetEndUserBySn', 'updateMountedHardwareEndUser',
    ]);
    expect(txSteps.every((s) => s.params[0] === '元大期貨')).toBe(true);
    expect(within(summary).getByText('元大期貨')).toBeInTheDocument();
    expect(window.alert.mock.calls[0][0]).toContain('覆蓋了 3 件設備／硬體');

    const log = auditLogs().find((l) => l.module === 'OUTBOUND');
    expect(log).toMatchObject({ target: 'DN-20260930-01', summary: '修改出貨單 [DN-20260930-01] End-user：[元大投信] → [元大期貨]，覆蓋資產 3 件' });
    expect(log.details).toMatchObject({ dnId: 22, before: '元大投信', after: '元大期貨' });
    expect([...log.details.endUserSns].sort()).toEqual(['NIC-1', 'RAM-1', 'SRV-1']);
  });

  it('沒改就不送出；確認視窗取消也不改', async () => {
    const summary = await openDN();
    await userEvent.click(within(summary).getByRole('button', { name: '修改 End-user' }));
    await userEvent.click(within(summary).getByRole('button', { name: '儲存 End-user' }));
    expect(window.electronAPI.runTransaction).not.toHaveBeenCalled();

    window.confirm = vi.fn(() => false);
    await userEvent.click(within(summary).getByRole('button', { name: '修改 End-user' }));
    await userEvent.type(within(summary).getByLabelText('修改 End-user'), 'X');
    await userEvent.click(within(summary).getByRole('button', { name: '儲存 End-user' }));
    expect(window.electronAPI.runTransaction).not.toHaveBeenCalled();
  });
});
