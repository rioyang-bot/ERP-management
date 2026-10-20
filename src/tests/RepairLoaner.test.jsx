import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RepairList from '../pages/RepairList';
import RepairActionModal from '../components/RepairActionModal';
import LendOrderRegistrationModal from '../components/LendOrderRegistrationModal';
import LentList from '../pages/LentList';
import { canProvideLoaner, activeLoaners, outstandingLoaners, loanerLabel } from '../utils/repairLoaner';
import { createRunTransactionMock } from './helpers/mockTransaction';
import { queries } from '../../database/queries';

/**
 * 維修代用機
 *
 * 客戶設備送修期間借一台給客戶暫用：走借用單、連回維修單；
 * 維修單上看得到代用機，完工交回客戶時提醒收回（預設一併登記歸還）。
 */
const LOANER_OUT = { id: 9, request_no: 'DN-20261020-01', status: 'SHIPPED', customer: '凱基', expected_return_date: '2026-11-20', sns: 'X0345623' };
const LOANER_PENDING = { id: 10, request_no: 'DN-20261020-02', status: 'PENDING', customer: '凱基', sns: 'X0345624' };
const LOANER_RETURNED = { id: 8, request_no: 'DN-20261001-01', status: 'RETURNED', customer: '凱基', actual_return_date: '2026-10-05', sns: 'X0340001' };

const order = (over = {}) => ({
  id: 4, repair_no: 'RMA-20261020-01', customer_name: '凱基證券', contact_person: '吳先生', contact_phone: '0900',
  status: 'SENT_OEM', is_internal: false, on_site_date: '2026-10-19', item_count: 1,
  items: [{ id: 1, sn: 'SRV-1' }], loaners: [], created_at: '2026-10-19T00:00:00.000Z', ...over,
});

describe('repairLoaner', () => {
  it('送修期間、客戶送修的單才能提供代用機', () => {
    for (const status of ['ON_SITE_HANDLING', 'SENT_OEM', 'OEM_RETURNED']) expect(canProvideLoaner(order({ status }))).toBe(true);
    expect(canProvideLoaner(order({ status: 'COMPLETED' }))).toBe(false);
    expect(canProvideLoaner(order({ is_internal: true }))).toBe(false);
  });
  it('未歸還的、借出中的', () => {
    const o = order({ loaners: [LOANER_OUT, LOANER_PENDING, LOANER_RETURNED] });
    expect(activeLoaners(o).map((l) => l.id)).toEqual([9, 10]);
    expect(outstandingLoaners(o).map((l) => l.id)).toEqual([9]);
    expect(loanerLabel(LOANER_OUT)).toBe('DN-20261020-01（X0345623）');
  });
  it('查詢：維修單帶出連到它的借用單；借用列表帶出維修單號', () => {
    expect(queries.fetchRepairOrders).toContain('WHERE r.repair_id = ro.id AND r.request_type = \'LEND\'');
    expect(queries.fetchLentRequests).toContain('LEFT JOIN repair_orders ro ON ro.id = r.repair_id');
    expect(queries.linkLendToRepair).toContain("request_type = 'LEND'");
  });
});

describe('維修單列表', () => {
  const setup = (orders) => {
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn(async (q) => (q === 'fetchRepairOrders' ? { success: true, rows: orders } : { success: true, rows: [] })),
      runTransaction: vi.fn(),
      saveFile: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  };
  const openTab = async (status) => {
    render(<MemoryRouter><RepairList /></MemoryRouter>);
    await userEvent.click(await screen.findByTestId(`repair-tab-${status}`));
    return (await screen.findByText('RMA-20261020-01')).closest('tr');
  };

  beforeEach(() => vi.clearAllMocks());

  it('送修中、沒有代用機：有「提供代用機」，按了打開借用單並帶入維修單', async () => {
    setup([order()]);
    const row = await openTab('SENT_OEM');
    await userEvent.click(within(row).getByRole('button', { name: /提供代用機/ }));
    const banner = await screen.findByTestId('lend-repair-loaner-banner');
    expect(banner).toHaveTextContent('維修單 [RMA-20261020-01] 的代用機');
    expect(screen.getByDisplayValue('吳先生 0900')).toBeInTheDocument();
  });

  it('已有代用機借出中：狀態欄標出來，不再顯示按鈕', async () => {
    setup([order({ loaners: [LOANER_OUT] })]);
    const row = await openTab('SENT_OEM');
    expect(within(row).getByTestId('repair-loaner-4')).toHaveTextContent('代用機借出中 X0345623');
    expect(within(row).queryByRole('button', { name: /提供代用機/ })).not.toBeInTheDocument();
  });

  it('內部維修沒有「提供代用機」', async () => {
    setup([order({ is_internal: true })]);
    const row = await openTab('SENT_OEM');
    expect(within(row).queryByRole('button', { name: /提供代用機/ })).not.toBeInTheDocument();
  });
});

describe('從維修單建立代用機借用單', () => {
  it('同一個交易裡連回維修單；事件紀錄寫上維修單號；不寫一般新建的草稿', async () => {
    localStorage.setItem('lend_draft_header', JSON.stringify({ customer: '別的客戶', customerId: '', contact_info: '', location: '', date: '2026-10-20', expected_return_date: '', project_name: '', purpose: '運作測試' }));
    window.alert = vi.fn();
    let txSteps = null;
    const namedQuery = vi.fn(async (q) => {
      if (q === 'fetchCustomers') return { success: true, rows: [{ id: 7, name: '凱基證券', contact: '吳先生', phone: '0900', address: '台北 COLO' }] };
      if (q === 'fetchConsumablesList') return { success: true, rows: [{ id: 5, item_id: 5, brand: 'METECH', model: 'SFP-10G', type: 'GBIC', specification: '', stock_qty: 9 }] };
      if (q === 'countOutboundRequests') return { success: true, rows: [{ count: 1 }] };
      if (q === 'insertOutboundRequest') return { success: true, rows: [{ id: 99 }] };
      return { success: true, rows: [{ id: 1 }] };
    });
    const tx = createRunTransactionMock(namedQuery);
    window.electronAPI = { namedQuery, runTransaction: vi.fn((s) => { txSteps = s; return tx(s); }) };
    const onSuccess = vi.fn();
    const { container } = render(
      <LendOrderRegistrationModal isOpen onClose={vi.fn()} onSuccess={onSuccess}
        repairLink={{ repairId: 4, repairNo: 'RMA-20261020-01', customer: '凱基證券', contactInfo: '吳先生 0900' }} />
    );
    // 客戶帶入；地點帶入客戶主檔地址
    await waitFor(() => expect(screen.getByDisplayValue('台北 COLO')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText('搜尋耗材...'), 'SFP');
    await userEvent.click(await waitFor(() => container.querySelector('.csm-btn')));
    await userEvent.click(screen.getByRole('button', { name: /建立借用單/ }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    const link = txSteps.find((s) => s.queryName === 'linkLendToRepair');
    expect(link).toMatchObject({ params: [{ $ref: 'request.rows.0.id' }, 4], expectRows: 1 });
    expect(onSuccess.mock.calls[0][0]).toMatchObject({ repair_no: 'RMA-20261020-01', customer: '凱基證券' });
    const log = namedQuery.mock.calls.filter(([q]) => q === 'insertAuditLog').map(([, p]) => p).find((p) => p[4] === 'LENT');
    expect(log[8]).toContain('維修單 [RMA-20261020-01] 代用機');
    expect(log[9]).toMatchObject({ repairNo: 'RMA-20261020-01' });
    // 一般新建的草稿沒被蓋掉
    expect(JSON.parse(localStorage.getItem('lend_draft_header')).customer).toBe('別的客戶');
  });
});

describe('完工時收回代用機', () => {
  let txSteps;
  const setup = () => {
    txSteps = [];
    window.alert = vi.fn();
    const namedQuery = vi.fn(async (q, p) => {
      if (q === 'updateRepairCompleted') return { success: true, rows: [{ id: 4 }] };
      if (q === 'updateAssetStatusBySn') return { success: true, rows: [{ id: 1, sn: p[1], old_status: 'REPAIRING' }] };
      if (q === 'fetchDNItems') return { success: true, rows: [{ id: 1, item_id: 3, sn: 'X0345623', category_name: '設備', brand: 'SMC', model: 'SRV', quantity: 1 }] };
      if (q === 'updateAssetStatusAndLocationBySn') return { success: true, rows: [{ id: 2, sn: p[2], old_status: 'LENT' }] };
      if (q === 'updateOutboundRequestReturned') return { success: true, rows: [{ id: p[0] }] };
      return { success: true, rows: [] };
    });
    const tx = createRunTransactionMock(namedQuery);
    window.electronAPI = { namedQuery, runTransaction: vi.fn((s) => { txSteps.push(s); return tx(s); }) };
    return namedQuery;
  };
  const logs = (nq) => nq.mock.calls.filter(([q]) => q === 'insertAuditLog').map(([, p]) => ({ module: p[4], target: p[6], summary: p[8] }));

  it('提醒客戶手上還有代用機；預設一併登記歸還（歸還日同完工日）', async () => {
    const nq = setup();
    render(<RepairActionModal isOpen repairOrder={order({ status: 'OEM_RETURNED', loaners: [LOANER_OUT, LOANER_PENDING] })} actionType="COMPLETE" onClose={vi.fn()} onSuccess={vi.fn()} />);
    const reminder = screen.getByTestId('repair-loaner-reminder');
    expect(reminder).toHaveTextContent('客戶手上還有代用機：DN-20261020-01（X0345623）');
    expect(reminder).toHaveTextContent('DN-20261020-02 還沒確認借出');
    expect(within(reminder).getByRole('checkbox')).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: /確認出貨完工/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    const returned = txSteps.find((s) => s.some((st) => st.queryName === 'updateOutboundRequestReturned'));
    const date = new Date().toISOString().split('T')[0];
    expect(returned.find((st) => st.queryName === 'updateOutboundRequestReturned').params).toEqual([9, date]);
    expect(returned.find((st) => st.queryName === 'updateAssetStatusAndLocationBySn').params).toEqual(['ACTIVE', '', 'X0345623']);
    expect(window.alert.mock.calls[0][0]).toContain('代用機已登記歸還：DN-20261020-01');
    // 代用機與借用單都記進事件紀錄，註明是維修完工時一併歸還
    const l = logs(nq);
    expect(l.find((x) => x.module === 'DEVICE' && x.target === 'X0345623').summary).toContain('維修單 [RMA-20261020-01] 完工時一併歸還代用機');
    expect(l.find((x) => x.module === 'LENT').summary).toContain('登記借用單 [DN-20261020-01] 歸還入庫');
  });

  it('不勾一併歸還：不動借用單，完成後提醒到借用列表登記', async () => {
    setup();
    render(<RepairActionModal isOpen repairOrder={order({ status: 'OEM_RETURNED', loaners: [LOANER_OUT] })} actionType="COMPLETE" onClose={vi.fn()} onSuccess={vi.fn()} />);
    await userEvent.click(within(screen.getByTestId('repair-loaner-reminder')).getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /確認出貨完工/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(txSteps).toHaveLength(0);
    expect(window.alert.mock.calls[0][0]).toContain('代用機 DN-20261020-01（X0345623） 還沒歸還');
  });

  it('送修原廠不是完工，不提醒', () => {
    setup();
    render(<RepairActionModal isOpen repairOrder={order({ status: 'ON_SITE_HANDLING', loaners: [LOANER_OUT] })} actionType="SEND_OEM" onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByTestId('repair-loaner-reminder')).not.toBeInTheDocument();
  });
});

describe('借用列表', () => {
  it('維修代用機標出維修單號', async () => {
    window.electronAPI.namedQuery.mockImplementation(async (q) => (q === 'fetchLentRequests'
      ? { success: true, rows: [{ id: 9, request_no: 'DN-20261020-01', customer: '凱基', status: 'PENDING', request_type: 'LEND', shipping_date: '2026-10-20', repair_no: 'RMA-20261020-01' }] }
      : { success: true, rows: [] }));
    render(<LentList />);
    expect(await screen.findByTestId('lent-repair-tag-9')).toHaveTextContent('維修代用 RMA-20261020-01');
  });
});
