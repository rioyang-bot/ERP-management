import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RepairActionModal from '../components/RepairActionModal';
import RepairList from '../pages/RepairList';
import { setRepairAssetStatus } from '../utils/repairAssetStatus';
import { buildSwapSteps, swapHwSyncLogs } from '../utils/repairSwap';

/**
 * 維修單各流程寫進事件紀錄的內容（設備歷程就是以序號讀這些紀錄）
 *
 * 先前的問題：
 *   - 送修原廠、完工出貨的紀錄一律寫「在庫 ➔ …」，但設備從建單起就是維修中
 *   - 搭載硬體的狀態跟著設備改了，卻一筆紀錄也沒有，硬體的履歷看不出送修過
 *   - 刪除維修單把設備改回在庫，設備歷程上沒有任何紀錄，掛著的硬體也還留在維修中
 *   - 維修單本身的紀錄只有一句「執行操作」，日期、結果、備註都沒留下
 */

/** insertAuditLog 的參數順序見 utils/auditLogger.js */
const auditLogs = () => window.electronAPI.namedQuery.mock.calls
  .filter(([q]) => q === 'insertAuditLog')
  .map(([, p]) => ({ actionType: p[3], module: p[4], target: p[6], summary: p[8], details: p[9] }));

const calledWith = (query) => window.electronAPI.namedQuery.mock.calls.filter(([q]) => q === query).map(([, p]) => p);

/** 在庫的設備改狀態：資料庫回傳改之前的狀態，搭載硬體回傳狀態有變的那幾張 */
const mockDb = ({ oldStatus = 'REPAIRING', hw = [], known = true, extra = {} } = {}) => {
  window.electronAPI = {
    namedQuery: vi.fn(async (query, params) => {
      if (extra[query]) return extra[query](params);
      if (query === 'updateAssetStatusBySn') {
        return { success: true, rows: known ? [{ id: 9, sn: params[1], old_status: oldStatus }] : [] };
      }
      if (query === 'syncMountedHardwareToDevice') return { success: true, rows: hw };
      return { success: true, rows: [{ id: 1 }] };
    }),
    runTransaction: vi.fn(),
    saveFile: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
};

describe('setRepairAssetStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('原狀態以資料庫改之前的為準，不再寫死成在庫', async () => {
    mockDb({ oldStatus: 'REPAIRING' });
    await setRepairAssetStatus('DEV-1', 'SHIPPED', { note: '維修單 [RMA-1] 完工', details: { repairNo: 'RMA-1' } });
    const [log] = auditLogs();
    expect(log).toMatchObject({ actionType: 'STATUS_CHANGE', module: 'DEVICE', target: 'DEV-1', summary: '維修單 [RMA-1] 完工' });
    expect(log.details).toMatchObject({ oldStatus: 'REPAIRING', newStatus: 'SHIPPED', repairNo: 'RMA-1' });
  });

  it('搭載硬體跟著改的，每張各記一筆', async () => {
    mockDb({
      oldStatus: 'REPAIRING',
      hw: [
        { id: 5, sn: 'NIC-1', status: 'SHIPPED', old_status: 'REPAIRING' },
        { id: 6, sn: 'RAM-1', status: 'SHIPPED', old_status: 'REPAIRING' },
      ],
    });
    await setRepairAssetStatus('DEV-1', 'SHIPPED', { note: '維修單 [RMA-1] 完工' });
    expect(calledWith('syncMountedHardwareToDevice')).toEqual([['DEV-1']]);
    const hw = auditLogs().filter((l) => l.module === 'HARDWARE');
    expect(hw.map((l) => l.target)).toEqual(['NIC-1', 'RAM-1']);
    expect(hw[0]).toMatchObject({ actionType: 'STATUS_CHANGE', summary: '搭載硬體跟著設備 [DEV-1] 變更狀態：維修單 [RMA-1] 完工' });
    expect(hw[0].details).toMatchObject({ oldStatus: 'REPAIRING', newStatus: 'SHIPPED', serverSn: 'DEV-1' });
  });

  it('狀態沒變（維修中送出原廠還是維修中）記成一般異動，不寫「維修中 ➔ 維修中」', async () => {
    mockDb({ oldStatus: 'REPAIRING' });
    await setRepairAssetStatus('DEV-1', 'REPAIRING', { note: '維修單 [RMA-1] 寄出送修原廠' });
    const [log] = auditLogs();
    expect(log).toMatchObject({ actionType: 'UPDATE', module: 'DEVICE', summary: '維修單 [RMA-1] 寄出送修原廠' });
    expect(log.details).toMatchObject({ status: 'REPAIRING' });
  });

  it('有給 prevStatus 就用它（原廠就地換號時資料庫裡已經先被改成在庫）', async () => {
    mockDb({ oldStatus: 'ACTIVE' });
    await setRepairAssetStatus('NEW-1', 'REPAIRING', { prevStatus: 'REPAIRING', note: '原廠返還' });
    expect(auditLogs()[0]).toMatchObject({ actionType: 'UPDATE', module: 'DEVICE' });
  });

  it('系統裡沒有這支序號：不寫設備歷程，也不去同步硬體', async () => {
    mockDb({ known: false });
    expect(await setRepairAssetStatus('TYPO-1', 'SHIPPED', { note: 'x' })).toBe(false);
    expect(auditLogs()).toEqual([]);
    expect(calledWith('syncMountedHardwareToDevice')).toEqual([]);
  });
});

describe('維修單的階段動作', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
  });

  const order = (status) => ({ id: 3, repair_no: 'RMA-1', customer_name: '凱基', status, items: [{ id: 1, sn: 'DEV-1' }] });

  it('送修原廠：設備本來就是維修中，不再記成「在庫 ➔ 維修中」', async () => {
    mockDb({ oldStatus: 'REPAIRING' });
    render(<RepairActionModal isOpen repairOrder={order('ON_SITE_HANDLING')} actionType="SEND_OEM" onClose={vi.fn()} onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /確認送修原廠/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    const dev = auditLogs().filter((l) => l.module === 'DEVICE');
    expect(dev).toHaveLength(1);
    expect(dev[0]).toMatchObject({ actionType: 'UPDATE', target: 'DEV-1', summary: '維修單 [RMA-1] 寄出送修原廠' });
    expect(auditLogs().some((l) => l.details?.oldStatus === 'ACTIVE')).toBe(false);
  });

  it('完工出貨：設備與搭載硬體都記「維修中 ➔ 已出貨」，維修單的紀錄帶日期與序號', async () => {
    mockDb({ oldStatus: 'REPAIRING', hw: [{ id: 5, sn: 'NIC-1', status: 'SHIPPED', old_status: 'REPAIRING' }] });
    render(<RepairActionModal isOpen repairOrder={order('OEM_RETURNED')} actionType="COMPLETE" onClose={vi.fn()} onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /確認出貨完工/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    const logs = auditLogs();
    const dev = logs.find((l) => l.module === 'DEVICE');
    expect(dev.details).toMatchObject({ oldStatus: 'REPAIRING', newStatus: 'SHIPPED', repairNo: 'RMA-1' });
    const hw = logs.find((l) => l.module === 'HARDWARE');
    expect(hw).toMatchObject({ target: 'NIC-1', actionType: 'STATUS_CHANGE' });
    expect(hw.summary).toContain('RMA-1');
    const repair = logs.find((l) => l.module === 'REPAIR');
    expect(repair.details).toMatchObject({ repairNo: 'RMA-1', action: 'COMPLETE', sns: ['DEV-1'] });
    expect(repair.details.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('刪除維修單', () => {
  const ON_SITE = {
    id: 9, repair_no: 'RMA-20260917-01', customer_name: '元大Yuanta',
    status: 'ON_SITE_HANDLING', on_site_date: '2026-09-17', on_site_status: '無法開機',
    item_count: 1, items: [{ id: 1, sn: 'SRV-001' }], created_at: '2026-09-17T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
  });

  it('改回在庫的設備：搭載硬體跟著，設備與硬體都記進歷程', async () => {
    mockDb({
      hw: [{ id: 5, sn: 'NIC-1', status: 'ACTIVE', old_status: 'REPAIRING' }],
      extra: {
        fetchRepairOrders: () => ({ success: true, rows: [ON_SITE] }),
        restoreAssetsFromRepair: () => ({ success: true, rows: [{ id: 1, sn: 'SRV-001' }] }),
      },
    });
    render(<MemoryRouter><RepairList /></MemoryRouter>);
    await screen.findByText('RMA-20260917-01');
    fireEvent.click(screen.getByTitle('刪除維修單'));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    expect(calledWith('syncMountedHardwareToDevice')).toEqual([['SRV-001']]);
    const logs = auditLogs();
    const dev = logs.find((l) => l.module === 'DEVICE');
    expect(dev).toMatchObject({ actionType: 'STATUS_CHANGE', target: 'SRV-001', summary: '刪除維修單 [RMA-20260917-01]，設備改回在庫' });
    expect(dev.details).toMatchObject({ oldStatus: 'REPAIRING', newStatus: 'ACTIVE' });
    expect(logs.find((l) => l.module === 'HARDWARE')).toMatchObject({ target: 'NIC-1', actionType: 'STATUS_CHANGE' });
    expect(logs.find((l) => l.module === 'REPAIR')).toMatchObject({ actionType: 'DELETE' });
  });
});

describe('以庫存換貨：搭載硬體的狀態紀錄', () => {
  const pairs = [{
    repairItemId: 11, oldAssetId: 1, oldSn: 'OLD-1', newAssetId: 2, newSn: 'NEW-1', newItemMasterId: 7,
    moveHw: [{ id: 51, sn: 'NIC-OLD-1' }],
  }];

  it('同步硬體狀態的步驟具名，交易完成後拿得到狀態有變的硬體', () => {
    const steps = buildSwapSteps({
      order: { id: 3, repair_no: 'RMA-1' }, pairs, date: '2026-10-13', results: 'r', dnNo: 'DN-1',
      dn: { customer: '凱基' },
    });
    const sync = steps.filter((s) => s.queryName === 'syncMountedHardwareToDevice');
    expect(sync.map((s) => [s.id, s.params[0]])).toEqual([
      ['hwNew-11', 'NEW-1'], ['hwMoved-11', 'NEW-1'], ['hwOld-11', 'OLD-1'],
    ]);
  });

  it('整理成每台設備各自的硬體清單，沒有變動的不列', () => {
    const results = {
      'hwNew-11': { rows: [{ id: 61, sn: 'NIC-NEW-1', status: 'SHIPPED', old_status: 'ACTIVE' }] },
      'hwMoved-11': { rows: [] },
      'hwOld-11': { rows: [{ id: 52, sn: 'RAM-OLD-1', status: 'ACTIVE', old_status: 'REPAIRING' }] },
    };
    expect(swapHwSyncLogs(pairs, results)).toEqual([
      { deviceSn: 'NEW-1', rows: results['hwNew-11'].rows },
      { deviceSn: 'OLD-1', rows: results['hwOld-11'].rows },
    ]);
  });
});
