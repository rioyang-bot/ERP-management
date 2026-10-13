import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RepairList from '../pages/RepairList';
import SwapFromStockModal from '../components/SwapFromStockModal';
import { queries } from '../../database/queries';
import { rankSwapCandidates, validateSwap, swapResultsText, buildSwapSteps } from '../utils/repairSwap';

/**
 * 維修單：以庫存設備換貨
 *
 * 客戶的設備故障，直接從庫存拿一台換給客戶，故障的那台取回。
 * 同一個交易：維修單結案、新設備出貨（沿用客戶、地點、專案、客戶保固）、
 * 換回來的設備回到在庫（客戶、地點清空，不標維修中）、產生已出貨的出貨單。
 */
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-13T10:00:00')); });
afterAll(() => { vi.useRealTimers(); });

const BROKEN_ITEM = { id: 31, sn: 'X0341997', brand: 'BLACKCORE', type: 'SERVER', model: 'BCHFT-1PC', item_master_id: 336, asset_id: 1689 };
const ORDER = {
  id: 7, repair_no: 'RMA-20261013-01', customer_name: '凱基', status: 'ON_SITE_HANDLING', is_internal: false,
  on_site_date: '2026-10-13', on_site_status: '無法開機', contact_person: '吳先生', contact_phone: '0900',
  item_count: 1, items: [BROKEN_ITEM], created_at: '2026-10-13T01:00:00Z',
};
const BROKEN_ASSET = { id: 1689, sn: 'X0341997', status: 'REPAIRING', client: '凱基 吳沛恆', location: 'COLO', item_master_id: 336, brand: 'BLACKCORE', model: 'BCHFT-1PC', type: 'SERVER', category_name: '設備', custom_attributes: { project_name: '凱基 HFT' } };
const CANDIDATES = [
  { id: 1801, sn: 'Z-OTHER', item_master_id: 900, brand: 'DELL', model: 'R750', type: 'STORAGE', category_name: '設備', mounted_count: 0 },
  { id: 1767, sn: 'X0346994', item_master_id: 401, brand: 'BLACKCORE', model: '3122-RL', type: 'SERVER', category_name: '設備', mounted_count: 2 },
  { id: 1702, sn: 'X0340001', item_master_id: 336, brand: 'BLACKCORE', model: 'BCHFT-1PC', type: 'SERVER', category_name: '設備', mounted_count: 0 },
];

describe('規則', () => {
  it('候選設備：同品項最前面，其次同型號、同類型', () => {
    const ranked = rankSwapCandidates(CANDIDATES, { ...BROKEN_ITEM, category_name: '設備' });
    expect(ranked.map((c) => [c.sn, c.match])).toEqual([['X0340001', 'item'], ['X0346994', 'type'], ['Z-OTHER', 'category']]);
  });

  it('每一台都要選，不能重複選、不能換成自己，日期與原因必填', () => {
    const items = [{ id: 1, sn: 'A' }, { id: 2, sn: 'B' }];
    expect(validateSwap({ items, picks: { 1: { sn: 'N1' } }, date: 'd', reason: 'r' })).toContain('B');
    expect(validateSwap({ items, picks: { 1: { sn: 'N1' }, 2: { sn: 'n1' } }, date: 'd', reason: 'r' })).toContain('不能同時');
    expect(validateSwap({ items: [{ id: 1, sn: 'A' }], picks: { 1: { sn: 'a' } }, date: 'd', reason: 'r' })).toContain('不能換成它自己');
    expect(validateSwap({ items: [{ id: 1, sn: 'A' }], picks: { 1: { sn: 'N' } }, date: '', reason: 'r' })).toContain('日期');
    expect(validateSwap({ items: [{ id: 1, sn: 'A' }], picks: { 1: { sn: 'N' } }, date: 'd', reason: ' ' })).toContain('原因');
    expect(validateSwap({ items: [{ id: 1, sn: 'A' }], picks: { 1: { sn: 'N' } }, date: 'd', reason: 'r' })).toBeNull();
  });

  it('維修結果記下換貨對照與出貨單號，不用換行（伺服器會刪掉換行）', () => {
    const text = swapResultsText('無法開機', [{ oldSn: 'A', newSn: 'B' }], 'DN-20261013-01');
    expect(text).toBe('無法開機；【以庫存設備換貨】A → B（出貨單 DN-20261013-01）');
    expect(text).not.toContain('\n');
  });

  it('交易：先結案與建出貨單，新設備先出貨再取回故障機，最後出貨單設為已出貨', () => {
    const steps = buildSwapSteps({
      order: ORDER, date: '2026-10-13', results: 'R', remarks: '', dnNo: 'DN-1', userId: 3,
      pairs: [{ repairItemId: 31, oldAssetId: 1689, oldSn: 'X0341997', newAssetId: 1767, newSn: 'X0346994', newItemMasterId: 401 }],
      dn: { customer: '凱基', location: 'COLO', contact: '吳先生 0900', project: '凱基 HFT' },
    });
    expect(steps.map((s) => s.queryName)).toEqual([
      'updateRepairSwapCompleted', 'insertOutboundRequestWithProject',
      'swapShipReplacementAsset', 'swapShipMountedOnReplacement', 'syncMountedHardwareToDevice',
      'swapReturnBrokenAsset', 'swapClearMountedOnBroken', 'syncMountedHardwareToDevice',
      'updateRepairItemReplacement', 'insertOutboundItem', 'insertSwapMountedOutboundItems', 'updateOutboundRequestStatus',
    ]);
    expect(steps[1].params).toEqual(['DN-1', '凱基', 'COLO', '2026-10-13', 3, '吳先生 0900', 'SALE', null, '凱基 HFT']);
    expect(steps[2]).toMatchObject({ params: [1767, 1689, '2026-10-13', 'RMA-20261013-01'], expectRows: 1 });
    expect(steps[5]).toMatchObject({ params: [1689, 'X0346994', '2026-10-13', 'RMA-20261013-01'], expectRows: 1 });
    // 搭載硬體跟著各自的設備：新設備上的變已出貨，換回來的設備上的變在庫
    expect(steps[4].params).toEqual(['X0346994']);
    expect(steps[7].params).toEqual(['X0341997']);
    expect(steps.at(-1)).toMatchObject({ params: ['SHIPPED', { $ref: 'dn.rows.0.id' }], expectRows: 1 });
  });
});

describe('查詢', () => {
  it('只有客戶送修、還在現場處理的單能換貨', () => {
    expect(queries.updateRepairSwapCompleted).toContain("status = 'ON_SITE_HANDLING' AND COALESCE(is_internal, FALSE) = FALSE");
  });
  it('新設備必須還在庫；客戶、地點、專案、客戶保固沿用故障機', () => {
    const q = queries.swapShipReplacementAsset;
    expect(q).toContain("n.status = 'ACTIVE'");
    for (const s of ['client = o.client', 'end_user = o.end_user', 'location = o.location', "'project_name', o.custom_attributes->>'project_name'", 'COALESCE(o.customer_warranty_expire, n.customer_warranty_expire)']) {
      expect(q).toContain(s);
    }
  });
  it('換回來的設備：回到在庫（不標維修中），客戶、地點、出貨日期、專案清空', () => {
    const q = queries.swapReturnBrokenAsset;
    expect(q).not.toContain("status = 'REPAIRING'");
    for (const s of ["status = 'ACTIVE'", 'client = NULL', 'location = NULL', 'shipping_date = NULL', "- 'project_name'"]) expect(q).toContain(s);
  });
  it('候選只有在庫、有序號、沒掛在別台上的設備與硬體', () => {
    expect(queries.fetchSwapCandidates).toContain("a.status = 'ACTIVE'");
    expect(queries.fetchSwapCandidates).toContain("COALESCE(TRIM(a.custom_attributes->>'server_sn'), '') = ''");
  });
});

describe('換貨視窗', () => {
  let calls;
  let txSteps;
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    txSteps = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.electronAPI = {
      namedQuery: vi.fn(async (query, params) => {
        calls.push({ query, params });
        if (query === 'fetchSwapCandidates') return { success: true, rows: CANDIDATES };
        if (query === 'fetchAssetBySn') return { success: true, rows: params[0] === 'X0341997' ? [BROKEN_ASSET] : [] };
        if (query === 'countOutboundRequests') return { success: true, rows: [{ count: 3 }] };
        return { success: true, rows: [] };
      }),
      runTransaction: vi.fn(async (steps) => { txSteps.push(steps); return { success: true, results: {} }; }),
    };
  });

  const openModal = async (onSuccess = vi.fn()) => {
    render(<SwapFromStockModal isOpen repairOrder={ORDER} onClose={vi.fn()} onSuccess={onSuccess} />);
    const dialog = await screen.findByRole('dialog', { name: '以庫存設備換貨' });
    await waitFor(() => expect(within(dialog).getByLabelText('換給客戶的設備 X0341997').options.length).toBeGreaterThan(1));
    return dialog;
  };

  it('列出故障設備的客戶與地點，候選依相近程度排列並標示', async () => {
    const dialog = await openModal();
    expect(within(dialog).getByTestId('swap-item-31')).toHaveTextContent(/客戶：凱基 吳沛恆\s*地點：COLO/);
    const options = [...within(dialog).getByLabelText('換給客戶的設備 X0341997').options].slice(1).map((o) => o.textContent);
    expect(options[0]).toMatch(/^【同品項】X0340001/);
    expect(options[1]).toContain('（搭載 2 件）');
    // 原因預設帶入現場狀況
    expect(within(dialog).getByLabelText(/換貨原因/)).toHaveValue('無法開機');
  });

  it('可以搜尋候選設備', async () => {
    const dialog = await openModal();
    await userEvent.type(within(dialog).getByLabelText('搜尋庫存設備 X0341997'), 'r750');
    const options = [...within(dialog).getByLabelText('換給客戶的設備 X0341997').options].slice(1);
    expect(options.map((o) => o.value)).toEqual(['1801']);
  });

  it('確認換貨：一個交易完成，產生出貨單號，記下事件紀錄', async () => {
    const onSuccess = vi.fn();
    const dialog = await openModal(onSuccess);
    await userEvent.selectOptions(within(dialog).getByLabelText('換給客戶的設備 X0341997'), '1767');
    await userEvent.click(within(dialog).getByRole('button', { name: /確認換貨/ }));

    await waitFor(() => expect(txSteps).toHaveLength(1));
    expect(calls.find((c) => c.query === 'countOutboundRequests').params).toEqual(['DN-20261013-']);
    const pairs = [{ repairItemId: 31, oldAssetId: 1689, oldSn: 'X0341997', oldStatus: 'REPAIRING', newAssetId: 1767, newSn: 'X0346994', newItemMasterId: 401 }];
    expect(txSteps[0]).toEqual(buildSwapSteps({
      order: ORDER, pairs, date: '2026-10-13', results: swapResultsText('無法開機', pairs, 'DN-20261013-03'),
      remarks: '', dnNo: 'DN-20261013-03', userId: undefined,
      dn: { customer: '凱基', location: 'COLO', contact: '吳先生 0900', project: '凱基 HFT' },
    }));
    const logs = JSON.stringify(calls.filter((c) => c.query === 'insertAuditLog'));
    expect(logs).toContain('出貨給 [凱基]，取代故障的 [X0341997]');
    expect(logs).toContain('自 [凱基] 換回（由 [X0346994] 替換），回到在庫');
    expect(logs).toContain('自動建立出貨單 [DN-20261013-03]');
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('DN-20261013-03'));
  });

  it('沒選設備就說明，不送出', async () => {
    const dialog = await openModal();
    await userEvent.click(within(dialog).getByRole('button', { name: /確認換貨/ }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('請為每一台故障設備選擇');
    expect(txSteps).toHaveLength(0);
  });

  it('交易失敗時說明已退回', async () => {
    window.electronAPI.runTransaction = vi.fn(async () => ({ success: false, error: '[X0346994] 已經不在庫' }));
    const dialog = await openModal();
    await userEvent.selectOptions(within(dialog).getByLabelText('換給客戶的設備 X0341997'), '1767');
    await userEvent.click(within(dialog).getByRole('button', { name: /確認換貨/ }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('已經不在庫'));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('所有變更已退回');
  });
});

describe('維修單列表', () => {
  const renderList = (orders) => {
    window.electronAPI = {
      namedQuery: vi.fn(async (query) => (query === 'fetchRepairOrders' ? { success: true, rows: orders } : { success: true, rows: [] })),
      runTransaction: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
    render(<MemoryRouter><RepairList /></MemoryRouter>);
  };

  it('客戶送修、現場處理階段有「以庫存換貨」，按下開啟換貨視窗', async () => {
    renderList([ORDER]);
    await screen.findByText(ORDER.repair_no);
    fireEvent.click(screen.getByRole('button', { name: /以庫存換貨/ }));
    expect(await screen.findByRole('dialog', { name: '以庫存設備換貨' })).toBeInTheDocument();
  });

  it('內部維修沒有換貨', async () => {
    renderList([{ ...ORDER, is_internal: true, status: 'SENT_OEM', customer_name: null }]);
    fireEvent.click(screen.getByTestId('repair-tab-SENT_OEM'));
    await screen.findByText(ORDER.repair_no);
    expect(screen.queryByRole('button', { name: /以庫存換貨/ })).not.toBeInTheDocument();
  });

  it('換過貨的單在設備明細標出換成了哪一台', async () => {
    renderList([{ ...ORDER, status: 'COMPLETED', completion_date: '2026-10-13', items: [{ ...BROKEN_ITEM, replacement_sn: 'X0346994' }] }]);
    fireEvent.click(screen.getByTestId('repair-tab-COMPLETED'));
    expect(await screen.findByText('→ 換為 X0346994')).toBeInTheDocument();
  });
});
