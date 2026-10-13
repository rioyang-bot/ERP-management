import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import DNList from '../pages/DNList';
import LentList from '../pages/LentList';
import { createHwSyncTracker, createBackToStockTracker } from '../utils/mountedHwSync';
import { createRunTransactionMock } from './helpers/mockTransaction';
import { queries } from '../../database/queries';

/**
 * 出貨、借出、歸還、撤銷借出、設備／硬體列表改狀態時的事件紀錄
 *
 * 先前的問題：
 *   - 搭載硬體的狀態跟著設備改了，卻沒有任何紀錄，硬體的履歷看不出它出貨、借出過
 *   - 借用歸還只有借用單本身記一筆，設備歷程上看得到借出，看不到它回來了
 *   - 設備／硬體列表手動改狀態，紀錄裡的原狀態寫的是字面上的「舊狀態」
 */

const auditLogs = () => window.electronAPI.namedQuery.mock.calls
  .filter(([q]) => q === 'insertAuditLog')
  .map(([, p]) => ({ actionType: p[3], module: p[4], target: p[6], summary: p[8], details: p[9] }));

const hwRow = (sn, status, oldStatus) => ({ id: sn.length, sn, status, old_status: oldStatus });

/** syncMountedHardwareToDevice：依設備序號回傳狀態有變的硬體 */
const mockApi = ({ synced = {}, extra = {} } = {}) => {
  window.electronAPI = {
    runTransaction: (steps) => createRunTransactionMock(window.electronAPI.namedQuery)(steps),
    namedQuery: vi.fn(async (query, params) => {
      if (extra[query]) return extra[query](params);
      if (query === 'syncMountedHardwareToDevice') return { success: true, rows: synced[params[0]] || [] };
      return { success: true, rows: [] };
    }),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
};

describe('查詢回傳改之前的狀態', () => {
  it.each(['updateAssetStatus', 'updateAssetStatusAndLocationBySn', 'syncHardwareToItsDevice', 'syncMountedHardwareToDevice'])(
    '%s', (name) => {
      expect(queries[name]).toContain('prev.status AS old_status');
      expect(queries[name]).toContain('prev.id = ');
    },
  );
});

describe('createHwSyncTracker', () => {
  beforeEach(() => vi.clearAllMocks());

  it('每台設備一個具名步驟，交易完成後逐件記錄；單據上自己列了的不重複記', async () => {
    mockApi({ synced: { 'DEV-1': [hwRow('NIC-1', 'SHIPPED', 'ACTIVE'), hwRow('HW-LISTED', 'SHIPPED', 'ACTIVE')] } });
    const hwSync = createHwSyncTracker();
    const steps = [hwSync.step('DEV-1'), hwSync.step('DEV-2')];
    expect(steps.map((s) => [s.id, s.queryName, s.params[0]])).toEqual([
      ['hwsync-0', 'syncMountedHardwareToDevice', 'DEV-1'],
      ['hwsync-1', 'syncMountedHardwareToDevice', 'DEV-2'],
    ]);
    const tx = await window.electronAPI.runTransaction(steps);
    await hwSync.log(tx.results, '出貨單 [DN-1] 確認出貨', { dnNumber: 'DN-1' }, { skipSns: ['hw-listed '] });

    const logs = auditLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actionType: 'STATUS_CHANGE', module: 'HARDWARE', target: 'NIC-1',
      summary: '搭載硬體跟著設備 [DEV-1] 變更狀態：出貨單 [DN-1] 確認出貨',
    });
    expect(logs[0].details).toMatchObject({ oldStatus: 'ACTIVE', newStatus: 'SHIPPED', serverSn: 'DEV-1', dnNumber: 'DN-1' });
  });
});

describe('createBackToStockTracker', () => {
  beforeEach(() => vi.clearAllMocks());

  it('單據上的設備記「借出 ➔ 在庫」，上面的硬體也各記一筆', async () => {
    mockApi({
      synced: { 'DEV-1': [hwRow('NIC-1', 'ACTIVE', 'LENT')] },
      extra: { updateAssetStatusAndLocationBySn: (p) => ({ success: true, rows: [{ id: 1, sn: p[2], old_status: 'LENT' }] }) },
    });
    const back = createBackToStockTracker();
    const steps = back.steps({ sn: 'DEV-1', category_name: '設備' });
    expect(steps.map((s) => s.queryName)).toEqual(['updateAssetStatusAndLocationBySn', 'syncMountedHardwareToDevice']);
    expect(steps[0]).toMatchObject({ params: ['ACTIVE', '', 'DEV-1'], expectRows: 1 });
    const tx = await window.electronAPI.runTransaction(steps);
    await back.log(tx.results, '借用單 [DN-1] 歸還入庫', { dnNumber: 'DN-1' });

    const logs = auditLogs();
    expect(logs.map((l) => [l.module, l.target, l.details.oldStatus, l.details.newStatus])).toEqual([
      ['DEVICE', 'DEV-1', 'LENT', 'ACTIVE'],
      ['HARDWARE', 'NIC-1', 'LENT', 'ACTIVE'],
    ]);
  });

  it('單據上也列了的硬體先跟著設備回來了：以跟著設備的那一次為準，不寫「在庫 ➔ 在庫」，也不重複記', async () => {
    mockApi({
      synced: { 'DEV-1': [hwRow('NIC-1', 'ACTIVE', 'LENT')] },
      // 輪到 NIC-1 自己那一步時，它已經是在庫了
      extra: { updateAssetStatusAndLocationBySn: (p) => ({ success: true, rows: [{ id: 1, sn: p[2], old_status: p[2] === 'NIC-1' ? 'ACTIVE' : 'LENT' }] }) },
    });
    const back = createBackToStockTracker();
    const steps = [...back.steps({ sn: 'DEV-1', category_name: '設備' }), ...back.steps({ sn: 'NIC-1', category_name: '硬體' })];
    const tx = await window.electronAPI.runTransaction(steps);
    await back.log(tx.results, '歸還');

    const logs = auditLogs();
    expect(logs.map((l) => [l.module, l.target, l.details.oldStatus])).toEqual([
      ['DEVICE', 'DEV-1', 'LENT'],
      ['HARDWARE', 'NIC-1', 'LENT'],
    ]);
  });
});

describe('出貨單確認出貨', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn().mockReturnValue(true);
    window.alert = vi.fn();
  });

  it('跟著設備變成已出貨的搭載硬體各記一筆，出貨單上自己列了的不重複記', async () => {
    mockApi({
      synced: { 'SRV-1': [hwRow('NIC-1', 'SHIPPED', 'ACTIVE'), hwRow('NIC-LISTED', 'SHIPPED', 'ACTIVE')] },
      extra: {
        fetchDNList: () => ({ success: true, rows: [{ id: 1, request_no: 'DN-20260910-01', request_type: 'SALE', customer: '兆豐', shipping_date: '2026-09-15', status: 'PENDING', item_count: 2, location: '台北' }] }),
        fetchDNItems: () => ({ success: true, rows: [
          { id: 101, category_name: '設備', brand: 'SMC', model: 'SYS', sn: 'SRV-1', quantity: 1 },
          { id: 102, category_name: '硬體', brand: 'Intel', model: 'NIC', sn: 'NIC-LISTED', quantity: 1 },
        ] }),
        checkAssetActive: () => ({ success: true, rows: [{ status: 'ACTIVE' }] }),
      },
    });
    render(<BrowserRouter><DNList /></BrowserRouter>);
    await screen.findByText('DN-20260910-01');
    fireEvent.click(screen.getByLabelText('檢視'));
    fireEvent.click(await screen.findByText('確認出貨'));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    const hw = auditLogs().filter((l) => l.module === 'HARDWARE');
    expect(hw.map((l) => l.target)).toEqual(['NIC-1']);
    expect(hw[0].summary).toBe('搭載硬體跟著設備 [SRV-1] 變更狀態：出貨單 [DN-20260910-01] 確認出貨');
  });
});

describe('借用單', () => {
  const lent = (status) => ({
    id: 1, request_no: 'DN-20260913-01', customer: '台積電', location: '新竹',
    shipping_date: '2026-09-13', expected_return_date: '2026-09-20', status, request_type: 'LEND', creator_name: 'Admin',
  });
  const DEVICE = { item_id: 20, brand: 'SMC', model: 'SYS', quantity: 1, category_name: '設備', sn: 'SN123456' };

  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn().mockReturnValue(true);
    window.alert = vi.fn();
  });

  const setup = (status, synced) => mockApi({
    synced,
    extra: {
      fetchLentRequests: () => ({ success: true, rows: [lent(status)] }),
      fetchDNItems: () => ({ success: true, rows: [DEVICE] }),
      checkAssetActive: () => ({ success: true, rows: [{ status: 'ACTIVE' }] }),
      updateAssetStatusAndLocationBySn: (p) => ({ success: true, rows: [{ id: 20, sn: p[2], old_status: status === 'PENDING' ? 'ACTIVE' : 'LENT' }] }),
    },
  });

  it('確認借出：跟著設備借出的搭載硬體各記一筆', async () => {
    setup('PENDING', { SN123456: [hwRow('NIC-1', 'LENT', 'ACTIVE')] });
    render(<LentList />);
    await screen.findByText('DN-20260913-01');
    await userEvent.click(screen.getByLabelText('確認借出'));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    const hw = auditLogs().find((l) => l.module === 'HARDWARE');
    expect(hw).toMatchObject({ target: 'NIC-1', summary: '搭載硬體跟著設備 [SN123456] 變更狀態：借用單 [DN-20260913-01] 確認借出' });
    expect(hw.details).toMatchObject({ oldStatus: 'ACTIVE', newStatus: 'LENT' });
  });

  it('歸還：設備自己記「借出 ➔ 在庫」，上面的硬體也各記一筆', async () => {
    setup('SHIPPED', { SN123456: [hwRow('NIC-1', 'ACTIVE', 'LENT')] });
    render(<LentList />);
    await screen.findByText('DN-20260913-01');
    await userEvent.click(screen.getByLabelText('歸還入庫'));
    await userEvent.click(await screen.findByText('確定歸還'));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    const logs = auditLogs();
    const dev = logs.find((l) => l.module === 'DEVICE');
    expect(dev).toMatchObject({ actionType: 'STATUS_CHANGE', target: 'SN123456' });
    expect(dev.summary).toMatch(/^借用單 \[DN-20260913-01\] 歸還入庫（歸還日 \d{4}-\d{2}-\d{2}）$/);
    expect(dev.details).toMatchObject({ oldStatus: 'LENT', newStatus: 'ACTIVE', dnNumber: 'DN-20260913-01' });
    expect(logs.find((l) => l.module === 'HARDWARE')).toMatchObject({ target: 'NIC-1' });
    // 借用單本身那一筆照舊
    expect(logs.find((l) => l.module === 'LENT')).toMatchObject({ actionType: 'STATUS_CHANGE' });
  });
});
