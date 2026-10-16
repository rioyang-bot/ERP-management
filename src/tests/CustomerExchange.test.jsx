import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import DNList from '../pages/DNList';
import { validateExchange, buildExchangeSteps, logExchange, toSafeText, lineLabel } from '../utils/customerExchange';
import { createHwSyncTracker } from '../utils/mountedHwSync';
import { createRunTransactionMock } from './helpers/mockTransaction';
import { queries } from '../../database/queries';

/**
 * 客戶換貨單（出貨單列表的「換貨」頁籤）
 *
 * 客戶拿 10G-LR 來換 10G-SR：換出的產生一張已出貨的出貨單，換回的良品直接回在庫，
 * 不開進貨單。不指定原出貨單，直接挑客戶。
 */

const LR = { kind: 'CONSUMABLE', itemId: 245, qty: 2, brand: 'CISCO', model: '10G-LR' };
const SR = { kind: 'CONSUMABLE', itemId: 237, qty: 2, stock: 133, brand: 'METECH', model: '10G-SR' };
const OLD_DEV = { kind: 'ASSET', assetId: 2466, sn: 'OLD-1', itemId: 357, categoryName: '設備', brand: 'SMC', model: 'SRV' };
const NEW_DEV = { kind: 'ASSET', assetId: 2463, sn: 'NEW-1', itemId: 357, categoryName: '設備', brand: 'SMC', model: 'SRV' };

const auditLogs = () => window.electronAPI.namedQuery.mock.calls
  .filter(([q]) => q === 'insertAuditLog')
  .map(([, p]) => ({ actionType: p[3], module: p[4], target: p[6], summary: p[8], details: p[9] }));

describe('validateExchange', () => {
  const ok = { customer: '台灣大戶', date: '2026-10-16', reason: '下錯單', inLines: [LR], outLines: [SR] };

  it('齊全就通過', () => expect(validateExchange(ok)).toBeNull());
  it('要選客戶', () => expect(validateExchange({ ...ok, customer: ' ' })).toBe('請選擇客戶。'));
  it('換回、換出都要有', () => {
    expect(validateExchange({ ...ok, inLines: [] })).toBe('請加入客戶換回的品項。');
    expect(validateExchange({ ...ok, outLines: [] })).toBe('請加入換給客戶的品項。');
  });
  it('換出的耗材不能超過在庫（同一品項分兩行也加總）', () => {
    expect(validateExchange({ ...ok, outLines: [{ ...SR, qty: 100 }, { ...SR, qty: 40 }] }))
      .toBe('[METECH 10G-SR] 在庫只有 133，不夠換出 140。');
  });
  it('數量要是正整數', () => expect(validateExchange({ ...ok, inLines: [{ ...LR, qty: 0 }] })).toMatch(/正整數/));
  it('同一個序號不能重複', () => {
    expect(validateExchange({ ...ok, inLines: [OLD_DEV], outLines: [{ ...NEW_DEV, sn: 'old-1 ' }] })).toBe('同一個序號不能重複加入。');
  });
  it('要填原因', () => expect(validateExchange({ ...ok, reason: '' })).toBe('請填寫換貨原因。'));
});

describe('toSafeText', () => {
  it('伺服器會刪掉的半形符號換成全形，換行換成分號', () => {
    expect(toSafeText('下錯單 (LR 換 SR) & 測試\n第二行')).toBe('下錯單 （LR 換 SR） ＆ 測試；第二行');
  });
});

describe('buildExchangeSteps', () => {
  const build = () => buildExchangeSteps({
    exNo: 'EX-1', dnNo: 'DN-1', customer: '台灣大戶', location: '台北 (機房)', contact: '王', date: '2026-10-16',
    reason: '下錯單 (LR)', remarks: '', userId: 3, inLines: [LR, OLD_DEV], outLines: [SR, NEW_DEV],
  });

  it('出貨單與換貨單先建立，出貨單最後才改成已出貨', () => {
    const { steps } = build();
    expect(steps[0]).toMatchObject({ id: 'dn', queryName: 'insertOutboundRequestWithProject', expectRows: 1 });
    expect(steps[0].params).toEqual(['DN-1', '台灣大戶', '台北 （機房）', '2026-10-16', 3, '王', 'SALE', null, null]);
    expect(steps[1]).toMatchObject({ id: 'ex', queryName: 'insertExchangeOrder', expectRows: 1 });
    expect(steps[1].params).toEqual(['EX-1', '台灣大戶', '2026-10-16', '下錯單 （LR）', null, 3, { $ref: 'dn.rows.0.id' }, 'DN-1']);
    expect(steps.at(-1)).toMatchObject({ queryName: 'updateOutboundRequestStatus', params: ['SHIPPED', { $ref: 'dn.rows.0.id' }], expectRows: 1 });
  });

  it('換出的耗材：扣在庫（庫存不足整筆退回）、列在出貨單、記在換貨單', () => {
    const names = build().steps.map((s) => s.queryName);
    const i = names.indexOf('updateStockQtyOnOutbound');
    const { steps } = build();
    expect(steps[i]).toMatchObject({ params: [2, 237], expectRows: 1 });
    expect(steps[i + 1]).toMatchObject({ queryName: 'insertOutboundItem', params: [{ $ref: 'dn.rows.0.id' }, 237, null, 2, '台北 （機房）'] });
    expect(steps[i + 2]).toMatchObject({ queryName: 'insertExchangeItem', params: [{ $ref: 'ex.rows.0.id' }, 'OUT', 237, null, null, 2] });
  });

  it('換出的設備：在庫才能出，搭載硬體一起出貨並列在出貨單', () => {
    const { steps } = build();
    const i = steps.findIndex((s) => s.queryName === 'exchangeShipAsset');
    expect(steps[i]).toMatchObject({ params: [2463, '台灣大戶', '台北 （機房）', '2026-10-16', 'EX-1'], expectRows: 1 });
    expect(steps.slice(i + 1, i + 6).map((s) => [s.queryName, s.params[0]])).toEqual([
      ['exchangeShipMounted', 'NEW-1'],
      ['syncMountedHardwareToDevice', 'NEW-1'],
      ['insertOutboundItem', { $ref: 'dn.rows.0.id' }],
      ['insertSwapMountedOutboundItems', { $ref: 'dn.rows.0.id' }],
      ['insertExchangeItem', { $ref: 'ex.rows.0.id' }],
    ]);
  });

  it('換回的耗材加回在庫；換回的設備回到在庫、搭載硬體跟著回來', () => {
    const { steps } = build();
    expect(steps.find((s) => s.queryName === 'exchangeReturnConsumable')).toMatchObject({ params: [2, 245], expectRows: 1 });
    const i = steps.findIndex((s) => s.queryName === 'exchangeReturnAsset');
    expect(steps[i]).toMatchObject({ id: 'in-1', params: [2466, 'EX-1', '2026-10-16'], expectRows: 1 });
    expect(steps.slice(i + 1, i + 4).map((s) => s.queryName)).toEqual(['swapClearMountedOnBroken', 'syncMountedHardwareToDevice', 'insertExchangeItem']);
    expect(steps[i + 2].id).toBe('hwsync-0');
    expect(steps[i + 3].params).toEqual([{ $ref: 'ex.rows.0.id' }, 'IN', 357, 2466, 'OLD-1', 1]);
  });

  it('換回的不開進貨單', () => {
    const names = build().steps.map((s) => s.queryName);
    expect(names.some((n) => /inbound/i.test(n))).toBe(false);
  });
});

describe('logExchange：事件紀錄與履歷', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = { namedQuery: vi.fn(async () => ({ success: true, rows: [] })) };
  });

  it('換貨單、出貨單各一筆；換回的每一項各一筆，搭載硬體也各一筆', async () => {
    const hwIn = createHwSyncTracker();
    hwIn.step('OLD-1');
    await logExchange({
      exNo: 'EX-1', dnNo: 'DN-1', customer: '台灣大戶', date: '2026-10-16', reason: '下錯單',
      inLines: [LR, OLD_DEV], outLines: [SR],
      results: {
        'in-1': { rows: [{ id: 2466, sn: 'OLD-1', old_status: 'SHIPPED' }] },
        'hwsync-0': { rows: [{ id: 9, sn: 'NIC-1', status: 'ACTIVE', old_status: 'SHIPPED' }] },
      },
      hwIn,
    });
    const logs = auditLogs();
    expect(logs.map((l) => [l.module, l.actionType, l.target])).toEqual([
      ['EXCHANGE', 'CREATE', 'EX-1'],
      ['OUTBOUND', 'CREATE', 'DN-1'],
      ['CONSUMABLE', 'UPDATE', 'EX-1'],
      ['DEVICE', 'STATUS_CHANGE', 'OLD-1'],
      ['HARDWARE', 'STATUS_CHANGE', 'NIC-1'],
    ]);
    expect(logs[0].summary).toBe('建立換貨單 [EX-1]，客戶 [台灣大戶]：換回 CISCO 10G-LR ×2、SMC SRV [OLD-1]；換出 METECH 10G-SR ×2（出貨單 DN-1）');
    // 耗材靠 itemMasterId 接回品項履歷，分類成「客戶換貨退回」
    expect(logs[2].details).toMatchObject({ exchange: 'IN', itemMasterId: 245, quantity: 2, exchangeNo: 'EX-1' });
    // 有序號的以序號接回；不帶 itemMasterId，否則同一筆會在履歷出現兩次
    expect(logs[3].details).toMatchObject({ exchange: 'IN', oldStatus: 'SHIPPED', newStatus: 'ACTIVE' });
    expect(logs[3].details.itemMasterId).toBeUndefined();
    expect(logs[4].summary).toContain('EX-1');
  });

  it('履歷查詢：兩段稽核紀錄都把換回分類成 EXCHANGE_RETURN', () => {
    const sql = queries.fetchItemFlowHistory;
    expect(sql.match(/WHEN l\.details->>'exchange' = 'IN' THEN 'EXCHANGE_RETURN'/g)).toHaveLength(2);
  });
});

describe('出貨單列表的「換貨」頁籤', () => {
  const CUSTOMER = { id: 7, name: '台灣大戶', contact: '王先生', phone: '0912', address: '台北' };
  const CONSUMABLES = [
    { id: 245, brand: 'CISCO', type: 'GBIC', model: '10G-LR', specification: '', stock_qty: 19 },
    { id: 237, brand: 'METECH', type: 'GBIC', model: '10G-SR', specification: '', stock_qty: 133 },
  ];
  const EXCHANGES = [{
    id: 1, exchange_no: 'EX-20261015-01', customer: '凱基', exchange_date: '2026-10-15', dn_no: 'DN-20261015-03',
    reason: '下錯單', creator_name: 'Rio',
    items: [
      { direction: 'IN', brand: 'CISCO', model: '10G-LR', quantity: 4, sn: null },
      { direction: 'OUT', brand: 'METECH', model: '10G-SR', quantity: 4, sn: null },
    ],
  }];

  let txSteps;
  beforeEach(() => {
    vi.clearAllMocks();
    txSteps = null;
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
    const namedQuery = vi.fn(async (query) => {
      if (query === 'fetchDNList') return { success: true, rows: [] };
      if (query === 'fetchExchangeOrders') return { success: true, rows: EXCHANGES };
      if (query === 'fetchCustomers') return { success: true, rows: [CUSTOMER] };
      if (query === 'fetchConsumablesList') return { success: true, rows: CONSUMABLES };
      if (query === 'fetchExchangeStockAssets' || query === 'fetchCustomerShippedAssets') return { success: true, rows: [] };
      if (query === 'countOutboundRequests' || query === 'countExchangeOrders') return { success: true, rows: [{ count: 2 }] };
      return { success: true, rows: [{ id: 1 }] };
    });
    window.electronAPI = {
      namedQuery,
      runTransaction: vi.fn((steps) => { txSteps = steps; return createRunTransactionMock(namedQuery)(steps); }),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const openTab = async () => {
    render(<BrowserRouter><DNList /></BrowserRouter>);
    await userEvent.click(await screen.findByTestId('dn-tab-exchange'));
  };

  it('列出換貨單：換回、換出、產生的出貨單', async () => {
    await openTab();
    const row = (await screen.findByText('EX-20261015-01')).closest('tr');
    expect(row).toHaveTextContent('CISCO 10G-LR ×4');
    expect(row).toHaveTextContent('METECH 10G-SR ×4');
    expect(row).toHaveTextContent('DN-20261015-03');
  });

  it('讀不到換貨單時提示先 migrate', async () => {
    const base = window.electronAPI.namedQuery.getMockImplementation();
    window.electronAPI.namedQuery.mockImplementation(async (q, p) => (q === 'fetchExchangeOrders'
      ? { success: false, error: 'relation "exchange_orders" does not exist' } : base(q, p)));
    await openTab();
    expect(await screen.findByRole('alert')).toHaveTextContent('npm run migrate');
  });

  it('10G-LR ×2 換 10G-SR ×2：送出交易並寫事件紀錄', async () => {
    await openTab();
    await userEvent.click(await screen.findByRole('button', { name: /新增換貨單/ }));
    const dialog = await screen.findByRole('dialog', { name: '新增換貨單' });
    const customerSelect = within(dialog).getByLabelText('客戶 *');
    await waitFor(() => expect(within(customerSelect).getByRole('option', { name: /台灣大戶/ })).toBeInTheDocument());
    await userEvent.selectOptions(customerSelect, '7');

    const inBox = within(dialog).getByTestId('exchange-in');
    await userEvent.selectOptions(within(inBox).getByLabelText('換回耗材'), '245');
    await userEvent.clear(within(inBox).getByLabelText('換回數量'));
    await userEvent.type(within(inBox).getByLabelText('換回數量'), '2');
    await userEvent.click(within(inBox).getByLabelText('加入換回耗材'));

    const outBox = within(dialog).getByTestId('exchange-out');
    // 換出列出在庫數量
    expect(within(outBox).getByRole('option', { name: /10G-SR（在庫 133）/ })).toBeInTheDocument();
    await userEvent.selectOptions(within(outBox).getByLabelText('換出耗材'), '237');
    await userEvent.clear(within(outBox).getByLabelText('換出數量'));
    await userEvent.type(within(outBox).getByLabelText('換出數量'), '2');
    await userEvent.click(within(outBox).getByLabelText('加入換出耗材'));

    await userEvent.type(within(dialog).getByLabelText('換貨原因 *'), '客戶下錯單');
    await userEvent.click(within(dialog).getByRole('button', { name: /確認換貨/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    expect(txSteps).not.toBeNull();
    const exNo = txSteps.find((s) => s.queryName === 'insertExchangeOrder').params[0];
    expect(exNo).toMatch(/^EX-\d{8}-02$/);
    expect(txSteps.find((s) => s.queryName === 'insertOutboundRequestWithProject').params[0]).toMatch(/^DN-\d{8}-02$/);
    expect(txSteps.find((s) => s.queryName === 'updateStockQtyOnOutbound').params).toEqual([2, 237]);
    expect(txSteps.find((s) => s.queryName === 'exchangeReturnConsumable').params).toEqual([2, 245]);

    const logs = auditLogs();
    expect(logs.find((l) => l.module === 'EXCHANGE')).toMatchObject({ actionType: 'CREATE', target: exNo });
    expect(logs.find((l) => l.module === 'CONSUMABLE').details).toMatchObject({ exchange: 'IN', itemMasterId: 245, quantity: 2 });
    expect(window.alert.mock.calls[0][0]).toContain(exNo);
  });

  it('沒加換出的品項：擋下來，不送交易', async () => {
    await openTab();
    await userEvent.click(await screen.findByRole('button', { name: /新增換貨單/ }));
    const dialog = await screen.findByRole('dialog', { name: '新增換貨單' });
    const customerSelect = within(dialog).getByLabelText('客戶 *');
    await waitFor(() => expect(within(customerSelect).getByRole('option', { name: /台灣大戶/ })).toBeInTheDocument());
    await userEvent.selectOptions(customerSelect, '7');
    const inBox = within(dialog).getByTestId('exchange-in');
    await userEvent.selectOptions(within(inBox).getByLabelText('換回耗材'), '245');
    await userEvent.click(within(inBox).getByLabelText('加入換回耗材'));
    await userEvent.click(within(dialog).getByRole('button', { name: /確認換貨/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('請加入換給客戶的品項。');
    expect(window.electronAPI.runTransaction).not.toHaveBeenCalled();
  });

  it('明細可以移除', async () => {
    await openTab();
    await userEvent.click(await screen.findByRole('button', { name: /新增換貨單/ }));
    const dialog = await screen.findByRole('dialog', { name: '新增換貨單' });
    const inBox = within(dialog).getByTestId('exchange-in');
    await waitFor(() => expect(within(inBox).getByRole('option', { name: /10G-LR/ })).toBeInTheDocument());
    await userEvent.selectOptions(within(inBox).getByLabelText('換回耗材'), '245');
    await userEvent.click(within(inBox).getByLabelText('加入換回耗材'));
    const label = lineLabel({ ...LR, qty: 1 });
    await userEvent.click(within(inBox).getByLabelText(`移除 ${label}`));
    expect(within(inBox).queryByRole('table')).not.toBeInTheDocument();
  });
});
