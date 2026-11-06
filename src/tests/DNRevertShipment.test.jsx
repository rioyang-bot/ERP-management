import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import DNList from '../pages/DNList';
import { createRunTransactionMock } from './helpers/mockTransaction';
import { queries } from '../../database/queries';

/**
 * 撤銷出貨：已出貨的出貨單退回「待出貨」，以便修改內容後再確認出貨
 *
 * 「確認出貨」的反向，在同一個交易裡：
 *   - 設備／硬體回到在庫（只撤銷還是已出貨的），清掉這次出貨寫入的安裝／出貨日期
 *   - 搭載硬體在所有品項之後才跟著設備（單上也列了硬體時，不會先被設備帶成在庫而擋下）
 *   - 耗材加回庫存；隨設備出貨的掛載耗材回到 LAB 並掛回原來那台設備
 *   - 單據狀態改回 PENDING
 * 事件紀錄：出貨單一筆（已出貨 → 待出貨），每台設備／硬體各一筆，跟著設備的搭載硬體各一筆。
 */
const SHIPPED_DN = {
  id: 30, request_no: 'DN-20261106-01', customer: '元大證券股份有限公司', status: 'SHIPPED', request_type: 'SALE',
  shipping_date: '2026-11-06', created_at: '2026-11-06T02:48:16Z', location: '', contact_info: '林宏訓',
};
const ITEMS = [
  { id: 114, item_id: 347, sn: 'NEO264000001', quantity: 1, category_name: '設備', brand: 'LDA', model: 'L1', location: 'COLO U08' },
  // 掛在 NEO264000001 上、單上也列了的硬體
  { id: 117, item_id: 500, sn: 'NIC-001', quantity: 1, category_name: '硬體', brand: 'Mellanox', model: 'CX5', location: 'COLO U08' },
  { id: 116, item_id: 249, sn: '', quantity: 60, category_name: '耗材', brand: 'METECH', model: 'GLC-T', location: 'COLO' },
  // 隨設備出貨的掛載耗材
  { id: 118, item_id: 260, sn: '', quantity: 2, category_name: '耗材', brand: 'METECH', model: 'DAC', lab_asset_id: 3064, lab_device_sn: 'NEO264000001' },
];

let calls;
let txSteps;
let blockedSn;
const called = (name) => calls.filter((c) => c.query === name);
const auditLogs = () => called('insertAuditLog').map((c) => ({ action: c.params[3], module: c.params[4], targetId: c.params[6], summary: c.params[8], details: c.params[9] }));

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  txSteps = [];
  blockedSn = null;
  window.alert = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const namedQuery = vi.fn(async (query, params) => {
    calls.push({ query, params });
    if (query === 'fetchDNList') return { success: true, rows: [SHIPPED_DN] };
    if (query === 'fetchDNItems') return { success: true, rows: ITEMS };
    if (query === 'revertShippedAssetBySn') {
      if (params[0] === blockedSn) return { success: true, rows: [], rowCount: 0 };
      return { success: true, rows: [{ id: 1, sn: params[0], old_status: 'SHIPPED' }], rowCount: 1 };
    }
    // 設備改回在庫後，掛在上面、單上沒列的硬體跟著（單上列了的 NIC-001 已經自己改回在庫，不會再回傳）
    if (query === 'syncMountedHardwareToDevice' && params[0] === 'NEO264000001') {
      return { success: true, rows: [{ id: 9, sn: 'RAM-001', status: 'ACTIVE', old_status: 'SHIPPED' }] };
    }
    return { success: true, rows: [] };
  });
  const tx = createRunTransactionMock(namedQuery);
  window.electronAPI = {
    namedQuery,
    runTransaction: vi.fn((steps) => { txSteps = steps; return tx(steps); }),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
});

const PAGE_LOAD = { timeout: 5000 };
const openRevert = async () => {
  render(<BrowserRouter><DNList /></BrowserRouter>);
  fireEvent.click(await screen.findByTestId('dn-tab-history', {}, PAGE_LOAD));
  const row = (await screen.findByText('DN-20261106-01', {}, PAGE_LOAD)).closest('tr');
  fireEvent.click(within(row).getByRole('button', { name: '撤銷出貨' }));
  return screen.getByRole('dialog', { name: '撤銷出貨' });
};

describe('撤銷出貨：查詢', () => {
  it('只撤銷還是已出貨的資產；這次出貨寫入的日期才清掉，自動算的客戶保固一併清', () => {
    const q = queries.revertShippedAssetBySn;
    expect(q).toContain("status = 'ACTIVE'");
    expect(q).toContain("a.status = 'SHIPPED'");
    expect(q).toContain('CASE WHEN a.installed_date = $2::date THEN NULL ELSE a.installed_date END');
    expect(q).toContain('CASE WHEN a.shipping_date = $2::date THEN NULL ELSE a.shipping_date END');
    expect(q).toContain('a.customer_warranty_years IS NOT NULL AND a.installed_date = $2::date');
    expect(q).toContain('prev.status AS old_status');
    expect(queries.revertMountedHardwareShipDates).toContain("custom_attributes->>'server_sn' = $2");
    expect(queries.updateStockQtyOnOutboundRevert).toContain('stock_qty = COALESCE(stock_qty, 0) + $1');
    // 只加回 LAB，不動借出中的數量
    expect(queries.updateLabQtyOnOutboundRevert).toContain('lab_qty = COALESCE(lab_qty, 0) + $1::int');
    expect(queries.updateLabQtyOnOutboundRevert).not.toContain('lent_qty');
  });
});

describe('撤銷出貨：畫面與交易', () => {
  it('只有已出貨的單有「撤銷出貨」鈕；確認視窗說明會還原哪些東西', async () => {
    const dialog = await openRevert();
    expect(dialog).toHaveTextContent('將出貨單 DN-20261106-01 退回「待出貨」');
    expect(dialog).toHaveTextContent('這次出貨沒有發生');
  });

  it('取消：不動任何東西', async () => {
    const dialog = await openRevert();
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog', { name: '撤銷出貨' })).toBeNull();
    expect(window.electronAPI.runTransaction).not.toHaveBeenCalled();
  });

  it('同一個交易：資產改回在庫、耗材加回、掛載耗材掛回設備，搭載硬體最後才跟，單據最後改回待出貨', async () => {
    const dialog = await openRevert();
    fireEvent.click(within(dialog).getByRole('button', { name: '確定撤銷' }));
    await waitFor(() => expect(window.electronAPI.runTransaction).toHaveBeenCalledTimes(1));

    expect(txSteps.map((s) => [s.queryName, s.params])).toEqual([
      ['revertShippedAssetBySn', ['NEO264000001', '2026-11-06']],
      ['revertMountedHardwareShipDates', ['2026-11-06', 'NEO264000001']],
      ['revertShippedAssetBySn', ['NIC-001', '2026-11-06']],
      ['revertMountedHardwareShipDates', ['2026-11-06', 'NIC-001']],
      ['updateStockQtyOnOutboundRevert', [60, 249]],
      ['updateLabQtyOnOutboundRevert', [2, 260]],
      ['insertLabAssignment', [260, 3064, 2, '出貨單 DN-20261106-01 撤銷出貨，掛回設備']],
      ['syncMountedHardwareToDevice', ['NEO264000001']],
      ['syncMountedHardwareToDevice', ['NIC-001']],
      ['updateOutboundRequestStatus', ['PENDING', 30]],
    ]);
    // 資產與單據狀態都要真的改到才算數
    expect(txSteps.find((s) => s.queryName === 'revertShippedAssetBySn').expectRows).toBe(1);
    expect(txSteps.at(-1).expectRows).toBe(1);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('已撤銷出貨，單據退回「待出貨」')));
    // 回到「已建立 (待確認)」頁籤，讓使用者接著修改
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '撤銷出貨' })).toBeNull());
  });

  it('事件紀錄：出貨單一筆（已出貨 → 待出貨）、單上每台設備／硬體各一筆、跟著設備的搭載硬體一筆', async () => {
    const dialog = await openRevert();
    fireEvent.click(within(dialog).getByRole('button', { name: '確定撤銷' }));
    await waitFor(() => expect(auditLogs().some((l) => l.module === 'OUTBOUND')).toBe(true));
    const logs = auditLogs();

    const dnLog = logs.find((l) => l.module === 'OUTBOUND');
    expect(dnLog).toMatchObject({
      action: 'STATUS_CHANGE', targetId: 'DN-20261106-01',
      summary: '撤銷出貨：出貨單 [DN-20261106-01] 退回待出貨，庫存與資產狀態已還原 (共 4 項品項)',
    });
    expect(dnLog.details).toMatchObject({ oldStatus: 'SHIPPED', newStatus: 'PENDING', dnId: 30, itemsCount: 4 });

    const assetLogs = logs.filter((l) => l.module === 'DEVICE' || l.module === 'HARDWARE');
    expect(assetLogs.map((l) => [l.module, l.targetId, l.details.oldStatus, l.details.newStatus])).toEqual([
      ['DEVICE', 'NEO264000001', 'SHIPPED', 'ACTIVE'],
      ['HARDWARE', 'NIC-001', 'SHIPPED', 'ACTIVE'],
      // 單上沒列、跟著設備改回在庫的搭載硬體
      ['HARDWARE', 'RAM-001', 'SHIPPED', 'ACTIVE'],
    ]);
    expect(assetLogs[0].summary).toBe('撤銷出貨：出貨單 [DN-20261106-01] 退回待出貨，回到在庫');
  });

  it('有資產已經不是已出貨（例如送修）：整張單擋下，說明是哪一台，不寫事件紀錄', async () => {
    blockedSn = 'NEO264000001';
    const dialog = await openRevert();
    fireEvent.click(within(dialog).getByRole('button', { name: '確定撤銷' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('序號 [NEO264000001] 目前不是「已出貨」')));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('所有變更已全部退回'));
    expect(called('updateOutboundRequestStatus')).toHaveLength(0);
    expect(auditLogs()).toHaveLength(0);
    // 視窗留著，可以取消
    expect(screen.getByRole('dialog', { name: '撤銷出貨' })).toBeInTheDocument();
  });
});
