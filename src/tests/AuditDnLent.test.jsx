import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DNList from '../pages/DNList';
import LentList from '../pages/LentList';
import { fixDnEndUser } from '../utils/dnEndUserFix';
import { returnLendOrder } from '../utils/lendReturn';
import { logExchange, buildExchangeSteps } from '../utils/customerExchange';
import { snapshotAssets, logAssetFieldChanges } from '../utils/assetFieldSnapshot';
import { createRunTransactionMock } from './helpers/mockTransaction';
import { queries } from '../../database/queries';

/**
 * 出貨單／借用單：每個被改到的欄位都要記「變更前 → 變更後」
 *
 *   - 確認出貨、確認借出、撤銷、歸還、修改 End-user 順帶改寫的資產欄位，每台各記一筆
 *   - 客戶換貨換回時清空、換出時帶入的欄位
 *   - 簽收單據換檔記「舊檔名 → 新檔名」，刪檔記存檔名稱
 *   - 刪除待出貨／待借出的單，留下單頭與明細的快照
 */

const auditLogs = () => window.electronAPI.namedQuery.mock.calls.filter(([q]) => q === 'insertAuditLog')
  .map(([, p]) => ({ actionType: p[3], module: p[4], target: p[6], summary: p[8], details: p[9] }));
const called = (name) => window.electronAPI.namedQuery.mock.calls.filter(([q]) => q === name);

/** fetchAssetFieldSnapshotBySns：第一次回傳變更前、之後回傳變更後 */
const snapshotSeq = (before, after) => {
  let n = 0;
  return () => ({ success: true, rows: (n++ === 0 ? before : after) });
};

const installApi = (handler) => {
  const namedQuery = vi.fn(async (query, params) => {
    const res = handler(query, params);
    return res === undefined || res === null ? { success: true, rows: [] } : res;
  });
  const tx = createRunTransactionMock(namedQuery);
  window.electronAPI = {
    namedQuery,
    runTransaction: vi.fn((steps) => tx(steps)),
    saveFile: vi.fn().mockResolvedValue({ success: true, fileName: 'new-signed-1790.pdf' }),
    releaseUploads: vi.fn().mockResolvedValue({ success: true }),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
  window.confirm = vi.fn(() => true);
});

describe('資產欄位快照：交易前後比對', () => {
  it('有變的欄位每台各記一筆 UPDATE，硬體記 HARDWARE；沒變的不記', async () => {
    const seq = snapshotSeq(
      [{ sn: 'SRV-1', client: '', location: 'LAB', category_name: '設備' },
        { sn: 'NIC-1', location: 'LAB', category_name: '硬體', installed_date: null },
        { sn: 'RAM-1', client: 'A', location: 'X', category_name: '硬體' }],
      [{ sn: 'SRV-1', client: '凱基', location: '台北', category_name: '設備' },
        { sn: 'NIC-1', location: 'LAB', category_name: '硬體', installed_date: '2026-11-17' },
        { sn: 'RAM-1', client: 'A', location: 'X', category_name: '硬體' }],
    );
    installApi((q) => (q === 'fetchAssetFieldSnapshotBySns' ? seq() : null));

    const before = await snapshotAssets(['SRV-1']);
    expect(called('fetchAssetFieldSnapshotBySns')[0][1]).toEqual([['SRV-1']]);
    await logAssetFieldChanges(before, '出貨單 [DN-1] 確認出貨', { dnNumber: 'DN-1' });

    const logs = auditLogs();
    expect(logs.map((l) => [l.actionType, l.module, l.target])).toEqual([
      ['UPDATE', 'DEVICE', 'SRV-1'],
      ['UPDATE', 'HARDWARE', 'NIC-1'],
    ]);
    expect(logs[0].summary).toBe('出貨單 [DN-1] 確認出貨：客戶：（空白） → 凱基；放置位置：LAB → 台北');
    expect(logs[0].details.changes).toEqual([
      { field: 'client', label: '客戶', from: '', to: '凱基' },
      { field: 'location', label: '放置位置', from: 'LAB', to: '台北' },
    ]);
    expect(logs[1].summary).toContain('安裝日期：（空白） → 2026-11-17');
  });

  it('查詢含搭載在這些序號上的硬體，陣列參數交給 PostgreSQL', () => {
    expect(queries.fetchAssetFieldSnapshotBySns).toContain('unnest($1::text[])');
    expect(queries.fetchAssetFieldSnapshotBySns).toContain("custom_attributes->>'server_sn'");
  });

  it('讀取失敗不擋作業，也不記', async () => {
    installApi(() => ({ success: false, error: 'x' }));
    expect(await snapshotAssets(['SRV-1'])).toBeNull();
    expect(await logAssetFieldChanges(null, 't')).toEqual([]);
  });
});

describe('出貨單修改 End-user：被覆蓋的資產各記一筆', () => {
  it('每台資產（含搭載的硬體）記 End-user 變更前 → 變更後；單頭那筆帶 changes', async () => {
    const seq = snapshotSeq(
      [{ sn: 'SRV-1', end_user: '元大投信', category_name: '設備' }, { sn: 'RAM-1', end_user: '', category_name: '硬體' }],
      [{ sn: 'SRV-1', end_user: '元大期貨', category_name: '設備' }, { sn: 'RAM-1', end_user: '元大期貨', category_name: '硬體' }],
    );
    installApi((q, p) => {
      if (q === 'fetchAssetFieldSnapshotBySns') return seq();
      if (q === 'updateOutboundRequestEndUser') return { success: true, rows: [{ id: p[1] }] };
      if (q === 'updateAssetEndUserBySn') return { success: true, rows: [{ id: 1, sn: p[1] }] };
      return null;
    });
    await fixDnEndUser({ id: 22, request_no: 'DN-1', customer: '元大', end_user: '元大投信' },
      [{ sn: 'SRV-1', category_name: '設備' }], '元大期貨');

    const logs = auditLogs();
    const header = logs.find((l) => l.module === 'OUTBOUND');
    expect(header.details.changes).toEqual([{ field: 'end_user', label: 'End-user', from: '元大投信', to: '元大期貨' }]);
    const srv = logs.find((l) => l.target === 'SRV-1');
    expect(srv).toMatchObject({ actionType: 'UPDATE', module: 'DEVICE', summary: '出貨單 [DN-1] 修改 End-user：End-user：元大投信 → 元大期貨' });
    expect(srv.details.changes[0]).toMatchObject({ from: '元大投信', to: '元大期貨' });
    const ram = logs.find((l) => l.target === 'RAM-1');
    expect(ram).toMatchObject({ module: 'HARDWARE', summary: '出貨單 [DN-1] 修改 End-user：End-user：（空白） → 元大期貨' });
  });
});

describe('借用單歸還：被清掉的放置位置', () => {
  it('每台記放置位置變更前 → 變更後', async () => {
    const seq = snapshotSeq(
      [{ sn: 'SN-1', location: '富邦機房', category_name: '設備' }],
      [{ sn: 'SN-1', location: '', category_name: '設備' }],
    );
    installApi((q, p) => {
      if (q === 'fetchAssetFieldSnapshotBySns') return seq();
      if (q === 'fetchDNItems') return { success: true, rows: [{ id: 1, item_id: 5, category_name: '設備', sn: 'SN-1', quantity: 1, brand: 'SMC', model: 'X' }] };
      if (q === 'updateAssetStatusAndLocationBySn') return { success: true, rows: [{ id: 1, sn: p[2], old_status: 'LENT' }] };
      return null;
    });
    await returnLendOrder({ id: 7, request_no: 'DN-LEND-1', customer: '富邦' }, '2026-11-17');
    const log = auditLogs().find((l) => l.actionType === 'UPDATE' && l.target === 'SN-1');
    expect(log.summary).toBe('借用單 [DN-LEND-1] 歸還入庫：放置位置：富邦機房 → （空白）');
    expect(log.details).toMatchObject({ dnNumber: 'DN-LEND-1', changes: [{ field: 'location', from: '富邦機房', to: '' }] });
  });
});

describe('客戶換貨：換回清空、換出帶入的欄位', () => {
  const OLD = { kind: 'ASSET', assetId: 2466, itemId: 357, sn: 'OLD-1', brand: 'SMC', model: 'SRV', categoryName: '設備' };
  const NEW = { kind: 'ASSET', assetId: 2463, itemId: 357, sn: 'NEW-1', brand: 'SMC', model: 'SRV', categoryName: '設備' };

  it('換出的資產步驟具名，查詢回傳改之前的欄位', () => {
    const { steps } = buildExchangeSteps({ exNo: 'EX-1', dnNo: 'DN-1', customer: 'C', date: '2026-11-17', reason: 'r', inLines: [OLD], outLines: [NEW] });
    expect(steps.find((s) => s.queryName === 'exchangeShipAsset').id).toBe('out-0');
    expect(queries.exchangeShipAsset).toContain('prev.client AS old_client');
    expect(queries.exchangeReturnAsset).toContain('prev.client AS old_client');
    expect(queries.exchangeReturnAsset).toContain('AS old_end_user');
  });

  it('換回那一筆寫出被清空的欄位；換出的每台另記一筆 UPDATE', async () => {
    installApi(() => null);
    await logExchange({
      exNo: 'EX-1', dnNo: 'DN-1', customer: '台灣大戶', date: '2026-11-17', reason: 'r', inLines: [OLD], outLines: [NEW],
      results: {
        'in-0': { rows: [{ id: 2466, sn: 'OLD-1', old_status: 'SHIPPED', old_client: '台灣大戶', old_location: '台北', old_end_user: 'EU', old_project_name: 'P1', old_shipping_date: '2026-01-02' }] },
        'out-0': { rows: [{ id: 2463, sn: 'NEW-1', old_status: 'ACTIVE', old_client: null, old_location: 'LAB', old_installed_date: null, old_shipping_date: null,
          client: '台灣大戶', location: '台北', installed_date: '2026-11-17', shipping_date: '2026-11-17' }] },
      },
    });
    const logs = auditLogs();
    const back = logs.find((l) => l.target === 'OLD-1');
    expect(back.actionType).toBe('STATUS_CHANGE');
    expect(back.summary).toBe('換貨單 [EX-1] 自客戶 [台灣大戶] 換回，回到在庫：客戶：台灣大戶 → （空白）；放置位置：台北 → （空白）；End-user：EU → （空白）；專案名稱：P1 → （空白）；出貨日期：2026-01-02 → （空白）');
    expect(back.details).toMatchObject({ exchange: 'IN', oldStatus: 'SHIPPED', newStatus: 'ACTIVE' });
    expect(back.details.changes[0]).toEqual({ field: 'client', label: '客戶', from: '台灣大戶', to: '' });

    const out = logs.find((l) => l.target === 'NEW-1');
    expect(out).toMatchObject({ actionType: 'UPDATE', module: 'DEVICE' });
    expect(out.summary).toBe('換貨單 [EX-1] 換出給客戶 [台灣大戶]（出貨單 DN-1）：客戶：（空白） → 台灣大戶；放置位置：LAB → 台北；安裝日期：（空白） → 2026-11-17；出貨日期：（空白） → 2026-11-17');
    // 換出的不帶 exchange: 'IN'，履歷才不會多一筆「客戶換貨退回」
    expect(out.details.exchange).toBeUndefined();
  });
});

describe('出貨單列表', () => {
  const PENDING = {
    id: 1, request_no: 'DN-20261117-01', request_type: 'SALE', customer: '元大證券', location: '台北', shipping_date: '2026-11-17',
    status: 'PENDING', item_count: 1, creator_name: 'Rio', created_at: '2026-11-17T02:00:00Z',
    signed_doc_url: 'old-signed-1700.pdf', signed_doc_name: '舊簽收單.pdf',
  };
  const ITEMS = [
    { id: 101, item_id: 9, category_name: '設備', brand: 'SMC', model: 'SYS-1029P', sn: 'SN12345', quantity: 1, location: '台北機房' },
    { id: 102, item_id: 10, category_name: '耗材', brand: 'METECH', model: '10G-SR', sn: null, quantity: 4, location: '台北' },
  ];
  const renderDn = async () => {
    render(<MemoryRouter><DNList /></MemoryRouter>);
    return (await screen.findByText(PENDING.request_no)).closest('tr');
  };

  it('刪除待出貨單：事件紀錄留下單頭與明細快照', async () => {
    installApi((q) => {
      if (q === 'fetchDNList') return { success: true, rows: [PENDING] };
      if (q === 'fetchDNItems') return { success: true, rows: ITEMS };
      if (q === 'deleteOutboundRequest') return { success: true, rows: [] };
      return null;
    });
    const row = await renderDn();
    fireEvent.click(within(row).getByLabelText('刪除'));
    await waitFor(() => expect(called('deleteOutboundRequest')).toHaveLength(1));
    await waitFor(() => expect(auditLogs().some((l) => l.actionType === 'DELETE')).toBe(true));
    const log = auditLogs().find((l) => l.actionType === 'DELETE');
    expect(log.summary).toBe('刪除待出貨單據 [DN-20261117-01]（客戶：元大證券；日期：2026-11-17；地點：台北；明細 2 項：SMC SYS-1029P [SN12345]、METECH 10G-SR ×4）');
    expect(log.details).toMatchObject({ dnId: 1, dnNumber: PENDING.request_no, customer: '元大證券' });
    expect(log.details.header).toMatchObject({ customer: '元大證券', location: '台北', shippingDate: '2026-11-17', signedDocName: '舊簽收單.pdf' });
    expect(log.details.items).toEqual([
      expect.objectContaining({ model: 'SYS-1029P', sn: 'SN12345', qty: 1, location: '台北機房' }),
      expect.objectContaining({ model: '10G-SR', sn: null, qty: 4 }),
    ]);
  });

  it('換簽收單：記舊檔名 → 新檔名；刪除記存檔名稱', async () => {
    installApi((q) => {
      if (q === 'fetchDNList') return { success: true, rows: [PENDING] };
      if (q === 'fetchDNItems') return { success: true, rows: ITEMS };
      if (q === 'updateOutboundSignedDoc' || q === 'removeOutboundSignedDoc') return { success: true, rows: [{ id: 1 }] };
      return null;
    });
    const row = await renderDn();
    fireEvent.click(within(row).getByTitle('查看詳情'));
    await screen.findByText('SN12345');
    const input = document.querySelector('.dm-modal input[type="file"]') || document.querySelector('input[type="file"]');
    const file = new File(['x'], '新簽收單.pdf', { type: 'application/pdf' });
    file.arrayBuffer = async () => new ArrayBuffer(1);
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(called('updateOutboundSignedDoc')).toHaveLength(1));
    await waitFor(() => expect(auditLogs().length).toBeGreaterThan(0));
    const up = auditLogs().find((l) => l.actionType === 'UPDATE');
    expect(up.summary).toBe('上傳出貨單 [DN-20261117-01] 之客戶已簽收單據 [新簽收單.pdf]：客戶簽收單據：舊簽收單.pdf → 新簽收單.pdf');
    expect(up.details).toMatchObject({ fileName: 'new-signed-1790.pdf', originalName: '新簽收單.pdf', oldFileName: 'old-signed-1700.pdf', oldOriginalName: '舊簽收單.pdf' });
    expect(up.details.changes).toEqual([{ field: 'signed_doc', label: '客戶簽收單據', from: '舊簽收單.pdf', to: '新簽收單.pdf', kind: 'file' }]);
  });

  it('刪除簽收單：敘述與 details 帶存檔名稱', async () => {
    const shipped = { ...PENDING, status: 'SHIPPED' };
    installApi((q) => {
      if (q === 'fetchDNList') return { success: true, rows: [shipped] };
      if (q === 'fetchDNItems') return { success: true, rows: ITEMS };
      if (q === 'removeOutboundSignedDoc') return { success: true, rows: [{ id: 1 }] };
      return null;
    });
    render(<MemoryRouter><DNList /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId('dn-tab-history'));
    const row = (await screen.findByText(PENDING.request_no)).closest('tr');
    fireEvent.click(within(row).getByTitle('查看詳情'));
    fireEvent.click(await screen.findByText('刪除檔案'));
    await waitFor(() => expect(auditLogs().some((l) => l.actionType === 'DELETE')).toBe(true));
    const log = auditLogs().find((l) => l.actionType === 'DELETE');
    expect(log.summary).toBe('刪除出貨單 [DN-20261117-01] 之客戶已簽收單據 [舊簽收單.pdf]（存檔名稱 old-signed-1700.pdf）');
    expect(log.details).toMatchObject({ deletedDoc: '舊簽收單.pdf', deletedFileName: 'old-signed-1700.pdf' });
    expect(log.details.changes).toEqual([{ field: 'signed_doc', label: '客戶簽收單據', from: '舊簽收單.pdf', to: '', kind: 'file' }]);
  });

  it('確認出貨：被改寫的資產欄位每台記變更前 → 變更後', async () => {
    const seq = snapshotSeq(
      [{ sn: 'SN12345', client: '', location: 'LAB', installed_date: null, category_name: '設備' }],
      [{ sn: 'SN12345', client: '', location: '台北機房', installed_date: '2026-11-17', category_name: '設備' }],
    );
    installApi((q, p) => {
      if (q === 'fetchDNList') return { success: true, rows: [PENDING] };
      if (q === 'fetchDNItems') return { success: true, rows: ITEMS };
      if (q === 'checkItemStock') return { success: true, rows: [{ stock_qty: 99 }] };
      if (q === 'checkAssetActive') return { success: true, rows: [{ status: 'ACTIVE' }] };
      if (q === 'fetchAssetFieldSnapshotBySns') return seq();
      if (q === 'updateStockQtyOnOutbound' || q === 'updateOutboundRequestStatus') return { success: true, rows: [{ id: p[1] }] };
      return null;
    });
    const row = await renderDn();
    fireEvent.click(within(row).getByTitle('查看詳情'));
    await screen.findByText('SN12345');
    fireEvent.click(screen.getByRole('button', { name: /確認出貨/ }));
    await waitFor(() => expect(auditLogs().some((l) => l.target === 'SN12345' && l.actionType === 'UPDATE')).toBe(true));
    const log = auditLogs().find((l) => l.target === 'SN12345' && l.actionType === 'UPDATE');
    expect(log.summary).toBe('出貨單 [DN-20261117-01] 確認出貨：放置位置：LAB → 台北機房；安裝日期：（空白） → 2026-11-17');
    expect(log.details.changes).toEqual([
      { field: 'location', label: '放置位置', from: 'LAB', to: '台北機房' },
      { field: 'installed_date', label: '安裝日期', from: '', to: '2026-11-17' },
    ]);
    // 交易前讀變更前的值
    const order = window.electronAPI.namedQuery.mock.calls.map(([q]) => q);
    expect(order.indexOf('fetchAssetFieldSnapshotBySns')).toBeLessThan(order.indexOf('updateAssetStatusLocationAndInstalledDateBySn'));
  });

  it('撤銷出貨：被清掉的地點與日期每台記變更前 → 變更後', async () => {
    const shipped = { ...PENDING, status: 'SHIPPED' };
    const seq = snapshotSeq(
      [{ sn: 'SN12345', location: '台北機房', installed_date: '2026-11-17', shipping_date: '2026-11-17', category_name: '設備' }],
      [{ sn: 'SN12345', location: '', installed_date: null, shipping_date: null, category_name: '設備' }],
    );
    installApi((q, p) => {
      if (q === 'fetchDNList') return { success: true, rows: [shipped] };
      if (q === 'fetchDNItems') return { success: true, rows: ITEMS };
      if (q === 'fetchAssetFieldSnapshotBySns') return seq();
      if (q === 'revertShippedAssetBySn') return { success: true, rows: [{ id: 1, sn: p[0], old_status: 'SHIPPED' }], rowCount: 1 };
      return null;
    });
    render(<MemoryRouter><DNList /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId('dn-tab-history'));
    const row = (await screen.findByText(PENDING.request_no)).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: '撤銷出貨' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: '撤銷出貨' })).getByRole('button', { name: '確定撤銷' }));
    await waitFor(() => expect(auditLogs().some((l) => l.target === 'SN12345' && l.actionType === 'UPDATE')).toBe(true));
    const log = auditLogs().find((l) => l.target === 'SN12345' && l.actionType === 'UPDATE');
    expect(log.summary).toBe('撤銷出貨：出貨單 [DN-20261117-01] 退回待出貨：放置位置：台北機房 → （空白）；安裝日期：2026-11-17 → （空白）；出貨日期：2026-11-17 → （空白）');
    expect(log.details).toMatchObject({ dnNumber: PENDING.request_no, revert: true });
    expect(log.details.changes.map((c) => [c.field, c.from, c.to])).toEqual([
      ['location', '台北機房', ''], ['installed_date', '2026-11-17', ''], ['shipping_date', '2026-11-17', ''],
    ]);
  });
});

describe('借用單列表', () => {
  const PENDING = {
    id: 5, request_no: 'DN-20261117-05', request_type: 'LEND', customer: '富邦', location: '富邦機房', shipping_date: '2026-11-17',
    expected_return_date: '2026-11-30', status: 'PENDING', creator_name: 'Rio', created_at: '2026-11-17T02:00:00Z',
    signed_doc_url: null, signed_doc_name: null,
  };
  const ITEMS = [{ id: 201, item_id: 9, category_name: '設備', brand: 'SMC', model: 'SYS-1029P', sn: 'SN-L1', quantity: 1, location: null, purpose: 'POC' }];

  it('刪除待借出單：事件紀錄留下單頭與明細快照', async () => {
    installApi((q) => {
      if (q === 'fetchLentRequests') return { success: true, rows: [PENDING] };
      if (q === 'fetchDNItems') return { success: true, rows: ITEMS };
      if (q === 'deleteOutboundRequest') return { success: true, rows: [] };
      return null;
    });
    render(<MemoryRouter><LentList /></MemoryRouter>);
    const row = (await screen.findByText(PENDING.request_no)).closest('tr');
    fireEvent.click(within(row).getByLabelText('刪除'));
    await waitFor(() => expect(auditLogs().some((l) => l.actionType === 'DELETE')).toBe(true));
    const log = auditLogs().find((l) => l.actionType === 'DELETE');
    expect(log.summary).toBe('刪除待借出單據 [DN-20261117-05]（客戶：富邦；日期：2026-11-17；地點：富邦機房；明細 1 項：SMC SYS-1029P [SN-L1]）');
    expect(log.details.header).toMatchObject({ customer: '富邦', expectedReturnDate: '2026-11-30' });
    expect(log.details.items[0]).toMatchObject({ sn: 'SN-L1', purpose: 'POC' });
  });

  it('確認借出：放置位置變更前 → 變更後', async () => {
    const seq = snapshotSeq(
      [{ sn: 'SN-L1', location: 'LAB', category_name: '設備' }],
      [{ sn: 'SN-L1', location: '富邦機房', category_name: '設備' }],
    );
    installApi((q, p) => {
      if (q === 'fetchLentRequests') return { success: true, rows: [PENDING] };
      if (q === 'fetchDNItems') return { success: true, rows: ITEMS };
      if (q === 'checkAssetActive') return { success: true, rows: [{ status: 'ACTIVE' }] };
      if (q === 'fetchAssetFieldSnapshotBySns') return seq();
      if (q === 'updateAssetStatusAndLocationBySn') return { success: true, rows: [{ id: 1, sn: p[2], old_status: 'ACTIVE' }] };
      if (q === 'updateOutboundRequestStatus') return { success: true, rows: [{ id: 5 }] };
      return null;
    });
    render(<MemoryRouter><LentList /></MemoryRouter>);
    const row = (await screen.findByText(PENDING.request_no)).closest('tr');
    fireEvent.click(within(row).getByLabelText('確認借出'));
    await waitFor(() => expect(auditLogs().some((l) => l.target === 'SN-L1' && l.actionType === 'UPDATE')).toBe(true));
    const log = auditLogs().find((l) => l.target === 'SN-L1' && l.actionType === 'UPDATE');
    expect(log.summary).toBe('借用單 [DN-20261117-05] 確認借出：放置位置：LAB → 富邦機房');
    expect(log.details.changes).toEqual([{ field: 'location', label: '放置位置', from: 'LAB', to: '富邦機房' }]);
  });
});
