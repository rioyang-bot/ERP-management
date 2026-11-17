import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RepairList from '../pages/RepairList';
import RepairOrderDetailModal from '../components/RepairOrderDetailModal';
import RepairActionModal from '../components/RepairActionModal';
import SwapFromStockModal from '../components/SwapFromStockModal';
import { performInPlaceReplacement } from '../utils/rmaService';
import { swapWarrantyChanges, swapRepairChanges } from '../utils/repairSwap';

/**
 * 維修單各處的事件紀錄：每個改到的欄位都要記「變更前 → 變更後」
 *
 *   - 刪除維修單：留下單頭與明細的快照
 *   - 不需送回原廠：否 → 是
 *   - 詳情就地修改階段說明：舊內容 → 新內容
 *   - 階段動作（送修、完工）：狀態、日期、結果、備註、供應商
 *   - 原廠就地換號：走共用的序號變更紀錄，狀態改回在庫也記下來
 *   - 以庫存換貨：新設備帶入、舊機被清空的客戶／地點／保固，以及維修單結案
 */

/** insertAuditLog 的參數順序見 utils/auditLogger.js */
const auditLogs = () => window.electronAPI.namedQuery.mock.calls
  .filter(([q]) => q === 'insertAuditLog')
  .map(([, p]) => ({ actionType: p[3], module: p[4], target: p[6], summary: p[8], details: p[9] }));

const mockDb = (extra = {}) => {
  window.electronAPI = {
    namedQuery: vi.fn(async (query, params) => {
      if (extra[query]) return extra[query](params);
      if (query === 'updateAssetStatusBySn') return { success: true, rows: [{ id: 9, sn: params[1], old_status: 'REPAIRING' }] };
      if (query === 'syncMountedHardwareToDevice') return { success: true, rows: [] };
      return { success: true, rows: [{ id: 1 }] };
    }),
    runTransaction: vi.fn(),
    saveFile: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
};

describe('維修單列表', () => {
  const ORDER = {
    id: 9, repair_no: 'RMA-20260917-01', customer_name: '元大Yuanta',
    status: 'ON_SITE_HANDLING', on_site_date: '2026-09-17', on_site_status: '無法開機',
    contact_person: '王先生', no_oem_required: false, item_count: 1,
    items: [{ id: 1, brand: 'DELL', type: 'SERVER', model: 'R740', specification: '2U', sn: 'SRV-001' }],
    created_at: '2026-09-17T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
  });

  it('刪除維修單：敘述與 details 帶單頭與明細的快照', async () => {
    mockDb({
      fetchRepairOrders: () => ({ success: true, rows: [ORDER] }),
      restoreAssetsFromRepair: () => ({ success: true, rows: [] }),
    });
    render(<MemoryRouter><RepairList /></MemoryRouter>);
    await screen.findByText('RMA-20260917-01');
    fireEvent.click(screen.getByTitle('刪除維修單'));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    const del = auditLogs().find((l) => l.module === 'REPAIR');
    expect(del.actionType).toBe('DELETE');
    expect(del.summary).toBe('刪除維修單 [RMA-20260917-01]：客戶：元大Yuanta；狀態：現場處理；開單日期：2026-09-17；明細：DELL SERVER R740 [SRV-001]');
    expect(del.details).toMatchObject({
      repairNo: 'RMA-20260917-01',
      header: { customer: '元大Yuanta', status: 'ON_SITE_HANDLING', onSiteDate: '2026-09-17', onSiteStatus: '無法開機', contactPerson: '王先生' },
      items: [{ brand: 'DELL', type: 'SERVER', model: 'R740', specification: '2U', sn: 'SRV-001' }],
    });
  });

  it('標記不需送回原廠：記「否 → 是」', async () => {
    mockDb({
      fetchRepairOrders: () => ({ success: true, rows: [ORDER] }),
      setRepairNoOemRequired: () => ({ success: true, rows: [{ id: 9, no_oem_required: true }] }),
    });
    render(<MemoryRouter><RepairList /></MemoryRouter>);
    await screen.findByText('RMA-20260917-01');
    fireEvent.click(screen.getByRole('button', { name: /免送原廠/ }));

    await waitFor(() => expect(auditLogs().some((l) => l.module === 'REPAIR')).toBe(true));
    const log = auditLogs().find((l) => l.module === 'REPAIR');
    expect(log.actionType).toBe('UPDATE');
    expect(log.summary).toContain('不需送回原廠：否 → 是');
    expect(log.details.changes).toEqual([{ field: 'no_oem_required', label: '不需送回原廠', from: '否', to: '是' }]);
  });
});

describe('詳情就地修改階段說明', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    mockDb();
  });

  it('送修備註：敘述與 details.changes 都有變更前後，舊的 before/after 保留', async () => {
    const order = { id: 7, repair_no: 'RMA-7', customer_name: '元大', status: 'SENT_OEM', send_oem_date: '2026-09-19', send_oem_remarks: '黑貓 123', items: [] };
    render(<RepairOrderDetailModal isOpen repairOrder={order} onClose={() => {}} onUpdated={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '修改送修備註' }));
    const box = await screen.findByRole('textbox', { name: '修改送修備註' });
    await userEvent.clear(box);
    await userEvent.type(box, '黑貓 456');
    await userEvent.click(screen.getByRole('button', { name: '儲存送修備註' }));

    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    const [log] = auditLogs();
    expect(log).toMatchObject({ actionType: 'UPDATE', module: 'REPAIR', target: 'RMA-7', summary: '修改維修單 [RMA-7]：送修備註：黑貓 123 → 黑貓 456' });
    expect(log.details).toMatchObject({ before: '黑貓 123', after: '黑貓 456' });
    expect(log.details.changes).toEqual([{ field: 'send_oem_remarks', label: '送修備註', from: '黑貓 123', to: '黑貓 456' }]);
  });
});

describe('階段動作', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    mockDb();
  });

  it('送修原廠：狀態、送修日期、送修備註「變更前 → 變更後」', async () => {
    const order = { id: 3, repair_no: 'RMA-1', customer_name: '凱基', status: 'ON_SITE_HANDLING', send_oem_remarks: null, items: [{ id: 1, sn: 'DEV-1' }] };
    render(<RepairActionModal isOpen repairOrder={order} actionType="SEND_OEM" onClose={vi.fn()} onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/送修備註/), '黑貓 999');
    await userEvent.click(screen.getByRole('button', { name: /確認送修原廠/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    const repair = auditLogs().find((l) => l.module === 'REPAIR');
    expect(repair.actionType).toBe('UPDATE');
    expect(repair.summary).toContain('狀態：現場處理 → 送修原廠');
    expect(repair.summary).toMatch(/送修日期：（空白） → \d{4}-\d{2}-\d{2}/);
    expect(repair.summary).toContain('送修備註：（空白） → 黑貓 999');
    expect(repair.details.changes).toEqual(expect.arrayContaining([
      { field: 'status', label: '狀態', from: '現場處理', to: '送修原廠' },
      { field: 'send_oem_remarks', label: '送修備註', from: '', to: '黑貓 999' },
    ]));
    // 既有的 details 照舊
    expect(repair.details).toMatchObject({ repairNo: 'RMA-1', action: 'SEND_OEM', remarks: '黑貓 999', sns: ['DEV-1'] });
  });

  it('完工出貨：出貨備註與狀態的變更前取自維修單原本的值', async () => {
    const order = { id: 3, repair_no: 'RMA-1', customer_name: '凱基', status: 'OEM_RETURNED', completion_remarks: '舊備註', items: [{ id: 1, sn: 'DEV-1' }] };
    render(<RepairActionModal isOpen repairOrder={order} actionType="COMPLETE" onClose={vi.fn()} onSuccess={vi.fn()} />);
    const box = screen.getByLabelText(/出貨備註/);
    await userEvent.clear(box);
    await userEvent.type(box, '新備註');
    await userEvent.click(screen.getByRole('button', { name: /確認出貨完工/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    const repair = auditLogs().find((l) => l.module === 'REPAIR');
    expect(repair.summary).toContain('狀態：原廠返還 → 完工結案');
    expect(repair.summary).toContain('出貨備註：舊備註 → 新備註');
    expect(repair.details.changes).toEqual(expect.arrayContaining([
      { field: 'completion_remarks', label: '出貨備註', from: '舊備註', to: '新備註' },
    ]));
  });
});

describe('原廠就地換號', () => {
  const ASSET = { id: 5, sn: 'OLD-SN', status: 'REPAIRING', brand: 'DELL', model: 'R740', category_name: '設備', custom_attributes: {} };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb({ checkAssetSnExistsExcludeSelf: () => ({ success: true, rows: [] }) });
  });

  it('走共用的序號變更紀錄（details.snChanged），RMA 單號保留；狀態維修中 → 在庫另記一筆', async () => {
    await performInPlaceReplacement(ASSET, 'NEW-SN', { rmaNo: 'R-1', date: '2026-10-01' });
    const logs = auditLogs();
    const sn = logs.find((l) => l.details?.snChanged);
    expect(sn).toMatchObject({ actionType: 'UPDATE', module: 'DEVICE', target: 'NEW-SN' });
    expect(sn.summary).toBe('序號變更：[OLD-SN] → [NEW-SN]（原廠 RMA 直接換號，承接歷史，RMA單號: R-1；狀態：維修中 → 在庫）');
    expect(sn.details).toMatchObject({ oldSn: 'OLD-SN', newSn: 'NEW-SN', rmaNo: 'R-1', mode: 'IN_PLACE' });
    expect(sn.details.changes).toEqual([
      { field: 'sn', label: '序號', from: 'OLD-SN', to: 'NEW-SN' },
      { field: 'status', label: '狀態', from: '維修中', to: '在庫' },
    ]);
    const status = logs.find((l) => l.actionType === 'STATUS_CHANGE');
    expect(status).toMatchObject({ target: 'NEW-SN', summary: '原廠 RMA 直接換號後改為在庫：狀態：維修中 → 在庫' });
    expect(status.details).toMatchObject({ oldStatus: 'REPAIRING', newStatus: 'ACTIVE', rmaNo: 'R-1' });
  });

  it('維修單原廠返還時由呼叫端記狀態，不多記中間的在庫', async () => {
    await performInPlaceReplacement(ASSET, 'NEW-SN', { rmaNo: 'R-1', callerLogsStatus: true });
    expect(auditLogs().filter((l) => l.actionType === 'STATUS_CHANGE')).toEqual([]);
    expect(auditLogs().filter((l) => l.details?.snChanged)).toHaveLength(1);
  });
});

describe('以庫存設備換貨', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-13T10:00:00')); });
  afterAll(() => { vi.useRealTimers(); });

  const ITEM = { id: 31, sn: 'OLD-1', brand: 'BLACKCORE', type: 'SERVER', model: 'M1', item_master_id: 336, asset_id: 1689 };
  const ORDER = {
    id: 7, repair_no: 'RMA-20261013-01', customer_name: '凱基', status: 'ON_SITE_HANDLING', is_internal: false,
    on_site_date: '2026-10-13', on_site_status: '無法開機', contact_person: '吳先生', contact_phone: '0900',
    results: null, items: [ITEM],
  };
  const BROKEN = {
    id: 1689, sn: 'OLD-1', status: 'REPAIRING', client: '凱基', location: 'COLO', item_master_id: 336, category_name: '設備',
    custom_attributes: { project_name: '凱基 HFT' },
    installed_date: '2026-01-05', system_date: '2026-01-06', warranty_expire: '2029-01-05', customer_warranty_expire: null,
    warranty_years: 3, customer_warranty_years: null,
  };
  const NEW = { id: 1767, sn: 'NEW-1', status: 'ACTIVE', client: null, location: 'WH', item_master_id: 336, category_name: '設備',
    system_date: null, warranty_expire: '2030-01-01', warranty_years: 3, customer_warranty_years: null };
  const CANDIDATES = [{ id: 1767, sn: 'NEW-1', item_master_id: 336, brand: 'BLACKCORE', model: 'M1', type: 'SERVER', category_name: '設備', mounted_count: 0 }];

  const SNAP_BEFORE = [
    { sn: 'OLD-1', client: '凱基', location: 'COLO', end_user: '吳沛恆', project_name: '凱基 HFT', installed_date: '2026-01-05', shipping_date: '2026-01-05', customer_warranty_expire: null, category_name: '設備' },
    { sn: 'NEW-1', client: null, location: 'WH', end_user: null, project_name: null, installed_date: null, shipping_date: null, customer_warranty_expire: null, category_name: '設備' },
  ];
  const SNAP_AFTER = [
    { sn: 'OLD-1', client: null, location: null, end_user: null, project_name: null, installed_date: null, shipping_date: null, customer_warranty_expire: null, category_name: '設備' },
    { sn: 'NEW-1', client: '凱基', location: 'COLO', end_user: '吳沛恆', project_name: '凱基 HFT', installed_date: '2026-01-05', shipping_date: '2026-10-13', customer_warranty_expire: null, category_name: '設備' },
  ];

  it('換貨兩邊每台記「變更前 → 變更後」，維修單結案也列出狀態與結果', async () => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
    let snapCalls = 0;
    mockDb({
      fetchSwapCandidates: () => ({ success: true, rows: CANDIDATES }),
      fetchAssetBySn: ([sn]) => ({ success: true, rows: sn === 'OLD-1' ? [BROKEN] : sn === 'NEW-1' ? [NEW] : [] }),
      fetchMountedHardwareBySn: () => ({ success: true, rows: [] }),
      countOutboundRequests: () => ({ success: true, rows: [{ count: 3 }] }),
      fetchAssetFieldSnapshotBySns: () => ({ success: true, rows: (snapCalls++ === 0 ? SNAP_BEFORE : SNAP_AFTER) }),
    });
    window.electronAPI.runTransaction = vi.fn(async () => ({ success: true, results: {} }));

    render(<SwapFromStockModal isOpen repairOrder={ORDER} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const dialog = await screen.findByRole('dialog', { name: '以庫存設備換貨' });
    await waitFor(() => expect(within(dialog).getByLabelText('換給客戶的設備 OLD-1').options.length).toBeGreaterThan(1));
    await userEvent.selectOptions(within(dialog).getByLabelText('換給客戶的設備 OLD-1'), '1767');
    await userEvent.click(within(dialog).getByRole('button', { name: /確認換貨/ }));
    await waitFor(() => expect(auditLogs().some((l) => l.module === 'REPAIR')).toBe(true));

    const logs = auditLogs();
    const fieldLog = (sn) => logs.find((l) => l.target === sn && l.details?.assetSideEffect);
    const newLog = fieldLog('NEW-1');
    expect(newLog).toMatchObject({ actionType: 'UPDATE', module: 'DEVICE' });
    expect(newLog.summary).toContain('維修單 [RMA-20261013-01] 以庫存設備換貨（出貨單 DN-20261013-03）：');
    expect(newLog.summary).toContain('客戶：（空白） → 凱基');
    expect(newLog.summary).toContain('放置位置：WH → COLO');
    expect(newLog.summary).toContain('系統日期：（空白） → 2026-01-06');
    expect(newLog.summary).toContain('原廠保固到期：2030-01-01 → 2029-01-05');
    expect(newLog.summary).toContain('原廠保固(年)：3 → （空白）');
    expect(newLog.details.changes).toEqual(expect.arrayContaining([
      { field: 'end_user', label: 'End-user', from: '', to: '吳沛恆' },
    ]));

    const oldLog = fieldLog('OLD-1');
    expect(oldLog.summary).toContain('客戶：凱基 → （空白）');
    expect(oldLog.summary).toContain('專案名稱：凱基 HFT → （空白）');
    expect(oldLog.summary).toContain('系統日期：2026-01-06 → （空白）');
    expect(oldLog.details.changes).toEqual(expect.arrayContaining([
      { field: 'location', label: '放置位置', from: 'COLO', to: '' },
    ]));

    const repair = logs.find((l) => l.module === 'REPAIR');
    expect(repair.summary).toContain('OLD-1 → NEW-1');
    expect(repair.summary).toContain('狀態：現場處理 → 完工結案');
    expect(repair.summary).toContain('換貨出貨單：（空白） → DN-20261013-03');
    expect(repair.details.changes).toEqual(expect.arrayContaining([
      { field: 'status', label: '狀態', from: '現場處理', to: '完工結案' },
    ]));
    expect(repair.details.pairs).toEqual([{ oldSn: 'OLD-1', newSn: 'NEW-1' }]);
  });

  it('保固與維修單的比對（純函式）', () => {
    const pairs = [{ oldSn: 'OLD-1', newSn: 'NEW-1' }];
    const w = swapWarrantyChanges(pairs, { brokenBefore: { 'OLD-1': BROKEN }, newBefore: { 'NEW-1': NEW } });
    expect(w['NEW-1']).toEqual(expect.arrayContaining([{ field: 'system_date', label: '系統日期', from: '', to: '2026-01-06' }]));
    expect(w['OLD-1']).toEqual(expect.arrayContaining([{ field: 'warranty_years', label: '原廠保固(年)', from: '3', to: '' }]));
    expect(swapRepairChanges(ORDER, { date: '2026-10-13', results: 'R', remarks: '', dnNo: 'DN-1' }))
      .toEqual(expect.arrayContaining([{ field: 'results', label: '維修與檢測結果', from: '', to: 'R' }]));
  });
});
