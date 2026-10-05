import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Inbound from '../pages/Inbound';
import InboundList from '../pages/InboundList';
import { queries } from '../../database/queries';
import { buildInboundConfirmSteps, findSnConflicts, collectAssetSns, buildQtyChangeSteps } from '../utils/inboundEdit';

/**
 * 進貨單改為兩段式，與出貨單相同
 *
 * 新增進貨單只是把單據記下來（待確認），不加庫存、不建資產、不動採購單；
 * 到「已建立 (待確認)」按「確認進貨」才入庫，移到「已進貨 (歷史紀錄)」。
 * 待確認的單可以自由修改或刪除，庫存不受影響。
 */

const DRAFT = {
  id: 21, order_no: 'IN-20261001-01', status: 'DRAFT', order_date: '2026-10-01', effective_date: '2026-10-01',
  created_at: '2026-10-01T09:00:00.000Z', partner_id: null, partner_name: null, invoice_no: null,
  attachments: '[]', item_count: 3, creator_name: 'Rio',
};
const DONE = {
  id: 11, order_no: 'IN-20260921-01', status: 'COMPLETED', order_date: '2026-09-21', effective_date: '2026-09-21',
  created_at: '2026-09-21T09:00:00.000Z', partner_id: null, partner_name: null, invoice_no: null,
  attachments: '[]', item_count: 1, creator_name: 'Rio',
};
const DRAFT_ITEMS = [
  { id: 1, item_id: 7, sn: 'BC0101', quantity: 1, brand: 'BLACKCORE', model: '3122-SM', category_name: '設備', purchase_record_id: 30, po_order_no: 'PO-01', order_source: 'PO-2026-001', remarks: '展示機' },
  { id: 2, item_id: 8, sn: null, quantity: 2, brand: 'Mellanox', model: 'CX5', category_name: '硬體', purchase_record_id: null, order_source: null },
  { id: 3, item_id: 9, sn: null, quantity: 5, brand: 'METECH', model: 'LC-LC', category_name: '耗材', purchase_record_id: null, order_source: null },
];

describe('確認進貨的交易步驟', () => {
  const steps = buildInboundConfirmSteps({ orderId: 21, items: DRAFT_ITEMS });
  const names = steps.map((s) => s.queryName);

  it('設備／硬體每一個數量建一筆資產，訂單來源、備註從明細帶過去', () => {
    const assets = steps.filter((s) => s.queryName === 'insertInboundAssets');
    expect(assets.map((s) => s.params)).toEqual([
      ['BC0101', 7, null, 'PO-2026-001', '展示機'],
      [null, 8, null, null, null],
      [null, 8, null, null, null],
    ]);
    expect(queries.insertInboundAssets).toContain('remarks');
  });

  it('耗材不建資產，但三項都加庫存', () => {
    expect(steps.filter((s) => s.queryName === 'updateStockQtyOnInbound').map((s) => s.params))
      .toEqual([[1, 7], [2, 8], [5, 9]]);
  });

  it('採購單的已入庫數量到確認時才記，超收就擋下來', () => {
    const po = steps.filter((s) => s.queryName === 'receivePurchaseRecordOnInboundConfirm');
    expect(po).toHaveLength(1);
    expect(po[0]).toMatchObject({ params: [1, 30], expectRows: 1 });
    expect(queries.receivePurchaseRecordOnInboundConfirm).toContain('COALESCE(received_quantity, 0) + $1 <= quantity');
  });

  it('最後才把單改成已進貨，而且只能從待確認改', () => {
    expect(names.at(-1)).toBe('confirmInboundOrder');
    expect(steps.at(-1)).toMatchObject({ params: [21], expectRows: 1 });
    expect(queries.confirmInboundOrder).toContain("status = 'DRAFT'");
  });
});

describe('確認進貨前的序號檢查', () => {
  it('已經在資產列表裡的序號（忽略大小寫）', () => {
    expect(findSnConflicts(DRAFT_ITEMS, ['bc0101'])).toEqual({ existing: ['BC0101'], repeated: [] });
  });

  it('同一張單出現兩次，或同一列數量大於 1', () => {
    const items = [
      { sn: 'A1', quantity: 1, category_name: '設備' },
      { sn: 'a1 ', quantity: 1, category_name: '設備' },
      { sn: 'B2', quantity: 2, category_name: '硬體' },
      { sn: 'C3', quantity: 3, category_name: '耗材' },
    ];
    expect(findSnConflicts(items, []).repeated).toEqual(['A1', 'B2']);
  });

  it('只檢查會建成資產的序號', () => {
    expect(collectAssetSns([...DRAFT_ITEMS, { sn: 'X9', category_name: '耗材' }])).toEqual(['BC0101']);
  });
});

describe('待確認的單修改數量不動庫存', () => {
  it('只改明細，而且限定待確認的單', () => {
    const steps = buildQtyChangeSteps({ itemId: 3, itemMasterId: 9, nextQty: 4, delta: -1, draft: true });
    expect(steps.map((s) => s.queryName)).toEqual(['updateDraftInboundItemQty']);
    expect(queries.updateDraftInboundItemQty).toContain("io.status = 'DRAFT'");
  });
});

describe('新增進貨單只建立單據', () => {
  let calls;
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    window.electronAPI = {
      namedQuery: vi.fn(async (query, params) => {
        calls.push({ query, params });
        if (query === 'countInboundOrders') return { success: true, rows: [{ count: 1 }] };
        return { success: true, rows: [] };
      }),
      runTransaction: vi.fn().mockResolvedValue({ success: true, results: {} }),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  it('狀態是待確認，不建資產、不加庫存、不動採購單', async () => {
    render(<Inbound />);
    await userEvent.click(await screen.findByTestId('open-item-select-btn-1'));
    await userEvent.click(await screen.findByRole('button', { name: /快速新增品項/i }));
    await screen.findByText('快速建檔品項範本');
    await userEvent.type(screen.getByPlaceholderText('例如：SUPERMICRO'), 'SUPERMICRO');
    await userEvent.type(screen.getByPlaceholderText('例如：SERVER'), 'SERVER');
    await userEvent.type(screen.getByPlaceholderText('例如：SYS-1029P'), 'SYS-1029P');
    await userEvent.click(screen.getByRole('button', { name: /儲存並帶入單據/ }));

    await userEvent.click(screen.getByRole('button', { name: /建立進貨單/ }));
    await waitFor(() => expect(window.electronAPI.runTransaction).toHaveBeenCalled());
    const steps = window.electronAPI.runTransaction.mock.calls.at(-1)[0];
    const names = steps.map((s) => s.queryName);

    expect(steps.find((s) => s.queryName === 'insertInboundOrder').params[3]).toBe('DRAFT');
    expect(names).not.toContain('insertInboundAssets');
    expect(names).not.toContain('updateStockQtyOnInbound');
    expect(names).not.toContain('updatePurchaseRecordStatus');
    // 訂單來源先記在明細上（第 6 個參數）
    expect(steps.find((s) => s.queryName === 'insertInboundItems').params).toHaveLength(6);
    expect(queries.insertInboundItems).toContain('order_source');
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('已建立 (待確認)'));
  });
});

describe('進貨單列表的兩個頁籤', () => {
  let calls;
  let txSteps;
  let existingSns;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    txSteps = [];
    existingSns = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    window.electronAPI = {
      namedQuery: vi.fn(async (query, params) => {
        calls.push({ query, params });
        if (query === 'fetchInboundList') return { success: true, rows: [DRAFT, DONE] };
        if (query === 'fetchInboundItems') return { success: true, rows: params[0] === 21 ? DRAFT_ITEMS : [] };
        if (query === 'fetchExistingAssetSns') return { success: true, rows: existingSns.map((sn) => ({ sn })) };
        return { success: true, rows: [] };
      }),
      runTransaction: vi.fn(async (steps) => { txSteps.push(steps); return { success: true, results: {} }; }),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const renderList = () => render(<MemoryRouter><InboundList /></MemoryRouter>);
  const openDraft = async (label = '查看進貨明細') => {
    renderList();
    await screen.findByText(DRAFT.order_no);
    await userEvent.click(screen.getByLabelText(label));
    await screen.findByText('BC0101');
  };
  // 「查看」是純唯讀；刪除、更正序號／數量、訂單來源都在「編輯」
  const openDraftEdit = () => openDraft('編輯進貨單');

  it('預設是待確認，只列待確認的單；頁籤上有數量', async () => {
    renderList();
    expect(await screen.findByText(DRAFT.order_no)).toBeInTheDocument();
    expect(screen.queryByText(DONE.order_no)).not.toBeInTheDocument();
    expect(screen.getByTestId('inbound-tab-pending')).toHaveTextContent('已建立 (待確認)1');
    expect(screen.getByTestId('inbound-tab-history')).toHaveTextContent('已進貨 (歷史紀錄)1');
  });

  it('歷史紀錄只列已進貨的單', async () => {
    renderList();
    await screen.findByText(DRAFT.order_no);
    fireEvent.click(screen.getByTestId('inbound-tab-history'));
    expect(screen.getByText(DONE.order_no)).toBeInTheDocument();
    expect(screen.queryByText(DRAFT.order_no)).not.toBeInTheDocument();
  });

  it('已進貨的單沒有確認進貨按鈕', async () => {
    renderList();
    await screen.findByText(DRAFT.order_no);
    fireEvent.click(screen.getByTestId('inbound-tab-history'));
    await userEvent.click(screen.getByLabelText('查看進貨明細'));
    await waitFor(() => expect(calls.some((c) => c.query === 'fetchInboundItems')).toBe(true));
    expect(screen.queryByRole('button', { name: /確認進貨/ })).not.toBeInTheDocument();
  });

  it('待確認的單按確認進貨，整張單在同一個交易裡入庫', async () => {
    await openDraft();
    expect(screen.getByTestId('inbound-draft-badge')).toHaveTextContent('待確認');
    await userEvent.click(screen.getByRole('button', { name: /確認進貨/ }));

    await waitFor(() => expect(txSteps).toHaveLength(1));
    expect(txSteps[0]).toEqual(buildInboundConfirmSteps({ orderId: 21, items: DRAFT_ITEMS }));
    expect(calls.find((c) => c.query === 'fetchExistingAssetSns').params).toEqual([['BC0101']]);
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('已確認進貨'));
  });

  it('序號已經在系統裡就不送出，並說出是哪一支', async () => {
    existingSns = ['BC0101'];
    await openDraft();
    await userEvent.click(screen.getByRole('button', { name: /確認進貨/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('已經在資產列表裡：BC0101')));
    expect(txSteps).toHaveLength(0);
  });

  it('刪除待確認的單只刪單據，不扣庫存、不刪資產', async () => {
    await openDraftEdit();
    await userEvent.click(screen.getByRole('button', { name: /刪除進貨單/ }));
    await waitFor(() => expect(txSteps).toHaveLength(1));
    expect(txSteps[0].map((s) => s.queryName)).toEqual(['deleteDraftInboundOrder']);
    expect(calls.some((c) => c.query === 'fetchInboundAssetUsage')).toBe(false);
    expect(queries.deleteDraftInboundOrder).toContain("status = 'DRAFT'");
  });

  it('待確認的單更正序號只改這一筆明細', async () => {
    await openDraftEdit();
    await userEvent.click(screen.getByLabelText('更正序號 BC0101'));
    const input = screen.getByRole('textbox', { name: '更正序號 BC0101' });
    await userEvent.clear(input);
    await userEvent.type(input, 'BC0102');
    await userEvent.click(screen.getByRole('button', { name: '儲存序號' }));
    await waitFor(() => expect(txSteps).toHaveLength(1));
    expect(txSteps[0]).toEqual([expect.objectContaining({ queryName: 'updateDraftInboundItemSn', params: [1, 'BC0102'] })]);
  });

  it('待確認的單修改數量，提示庫存不受影響', async () => {
    await openDraftEdit();
    const row = screen.getByLabelText('修改數量 METECH LC-LC').closest('tr');
    await userEvent.click(within(row).getByLabelText('修改數量 METECH LC-LC'));
    const input = within(row).getByRole('spinbutton');
    await userEvent.clear(input);
    await userEvent.type(input, '4');
    await userEvent.click(within(row).getByRole('button', { name: '儲存數量' }));
    await waitFor(() => expect(txSteps).toHaveLength(1));
    expect(txSteps[0].map((s) => s.queryName)).toEqual(['updateDraftInboundItemQty']);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('庫存不受影響'));
  });

  it('待確認的單統一填寫訂單來源，寫在明細上', async () => {
    await openDraftEdit();
    await userEvent.type(screen.getByLabelText('統一填寫訂單來源'), 'PO-9');
    await userEvent.click(screen.getByRole('button', { name: '統一填寫' }));
    await waitFor(() => expect(calls.some((c) => c.query === 'updateDraftInboundOrderSource')).toBe(true));
    expect(calls.some((c) => c.query === 'updateOrderSourceByInboundOrder')).toBe(false);
  });
});

describe('查詢', () => {
  it('待確認的單訂單來源讀明細，已進貨的讀資產', () => {
    expect(queries.fetchInboundItems).toContain("CASE WHEN io.status = 'DRAFT' THEN ii.order_source");
  });
});
