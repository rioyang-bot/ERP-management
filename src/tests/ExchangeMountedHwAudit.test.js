import { describe, it, expect, vi, beforeEach } from 'vitest';
import { snapshotExchangeMounted, logExchange } from '../utils/customerExchange';

/**
 * 客戶換貨：搭載在換出／換回設備上的硬體，客戶、地點、專案、日期被改寫時逐支記「變更前 → 變更後」
 *
 * 換出時硬體跟著帶入客戶、地點與日期，換回時清掉客戶與專案；兩支 SQL 都只回傳 id，
 * 所以交易前後各讀一次比對。設備本身由 exchangeShipAsset／exchangeReturnAsset 的舊值另記，這裡不重複。
 */
const OUT_DEVICE = { kind: 'ASSET', sn: 'DEV-OUT', assetId: 1, itemId: 10, brand: 'Dell', model: 'R760', categoryName: '設備' };
const IN_DEVICE = { kind: 'ASSET', sn: 'DEV-IN', assetId: 2, itemId: 10, brand: 'Dell', model: 'R760', categoryName: '設備' };

const BEFORE_ROWS = [
  { sn: 'DEV-OUT', category_name: '設備', client: null, location: null },
  { sn: 'HW-OUT-1', category_name: '硬體', client: null, location: '倉庫', project_name: null, shipping_date: null },
  { sn: 'hw-out-2', category_name: '硬體', client: null, location: '倉庫' },
  { sn: 'DEV-IN', category_name: '設備', client: '凱基', location: 'COLO' },
  { sn: 'HW-IN-1', category_name: '硬體', client: '凱基', location: 'COLO', project_name: 'P-1' },
];
const AFTER_ROWS = [
  { sn: 'DEV-OUT', category_name: '設備', client: '富邦', location: 'IDC' },
  { sn: 'HW-OUT-1', category_name: '硬體', client: '富邦', location: 'IDC', project_name: null, shipping_date: '2026-11-17' },
  { sn: 'hw-out-2', category_name: '硬體', client: '富邦', location: 'IDC' },
  { sn: 'DEV-IN', category_name: '設備', client: null, location: null },
  { sn: 'HW-IN-1', category_name: '硬體', client: null, location: 'COLO', project_name: null },
];

const audits = () => window.electronAPI.namedQuery.mock.calls
  .filter(([q]) => q === 'insertAuditLog')
  .map(([, p]) => ({ module: p[4], target: p[6], summary: p[8], details: p[9] }));

describe('客戶換貨：搭載硬體逐支記變更前後', () => {
  let snapshotCalls;

  beforeEach(() => {
    vi.clearAllMocks();
    snapshotCalls = 0;
    window.electronAPI.namedQuery.mockImplementation(async (q) => {
      if (q === 'fetchAssetFieldSnapshotBySns') {
        snapshotCalls += 1;
        return { success: true, rows: snapshotCalls === 1 ? BEFORE_ROWS : AFTER_ROWS };
      }
      return { success: true, rows: [] };
    });
  });

  it('交易前只留下搭載的硬體，不含換出／換回的設備本身', async () => {
    const before = await snapshotExchangeMounted({ inLines: [IN_DEVICE], outLines: [OUT_DEVICE] });
    expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('fetchAssetFieldSnapshotBySns', [['DEV-IN', 'DEV-OUT']]);
    expect([...before.rows.keys()].sort()).toEqual(['HW-IN-1', 'HW-OUT-1', 'HW-OUT-2']);
  });

  it('耗材與沒有序號的明細不讀；沒有搭載硬體時回傳 null', async () => {
    expect(await snapshotExchangeMounted({ outLines: [{ kind: 'CONSUMABLE', itemId: 5, qty: 2 }] })).toBeNull();
    expect(window.electronAPI.namedQuery).not.toHaveBeenCalled();

    window.electronAPI.namedQuery.mockResolvedValueOnce({ success: true, rows: [BEFORE_ROWS[0]] });
    expect(await snapshotExchangeMounted({ outLines: [OUT_DEVICE] })).toBeNull();
  });

  it('換貨完成後每支硬體各記一筆「欄位：舊 → 新」（換出帶入、換回清掉），設備本身不重複記', async () => {
    const mountedBefore = await snapshotExchangeMounted({ inLines: [IN_DEVICE], outLines: [OUT_DEVICE] });
    await logExchange({
      exNo: 'EX-20261117-01', dnNo: 'DN-20261117-01', customer: '富邦', date: '2026-11-17', reason: '',
      inLines: [IN_DEVICE], outLines: [OUT_DEVICE], results: {}, mountedBefore,
    });

    const hwLogs = audits().filter((a) => a.details?.mountedSync);
    expect(hwLogs.map((a) => a.target).sort()).toEqual(['HW-IN-1', 'HW-OUT-1', 'hw-out-2']);
    expect(hwLogs.every((a) => a.module === 'HARDWARE')).toBe(true);

    const out1 = hwLogs.find((a) => a.target === 'HW-OUT-1');
    expect(out1.summary).toBe('換貨單 [EX-20261117-01]（客戶 [富邦]）搭載硬體跟著設備異動：客戶：（空白） → 富邦；放置位置：倉庫 → IDC；出貨日期：（空白） → 2026-11-17');
    expect(out1.details).toMatchObject({ exchangeNo: 'EX-20261117-01', dnNumber: 'DN-20261117-01', sn: 'HW-OUT-1' });
    expect(out1.details.changes).toContainEqual({ field: 'client', label: '客戶', from: '', to: '富邦' });

    const in1 = hwLogs.find((a) => a.target === 'HW-IN-1');
    expect(in1.summary).toContain('客戶：凱基 → （空白）');
    expect(in1.summary).toContain('專案名稱：P-1 → （空白）');
    expect(in1.summary).not.toContain('放置位置');

    // 設備本身不在這一段
    expect(hwLogs.some((a) => ['DEV-OUT', 'DEV-IN'].includes(a.target))).toBe(false);
  });

  it('交易前讀不到（mountedBefore 為 null）時照常完成，只是不記這一段', async () => {
    await logExchange({
      exNo: 'EX-1', dnNo: 'DN-1', customer: '富邦', date: '2026-11-17', reason: '',
      inLines: [], outLines: [OUT_DEVICE], results: {}, mountedBefore: null,
    });
    expect(audits().filter((a) => a.details?.mountedSync)).toHaveLength(0);
    expect(audits().length).toBeGreaterThan(0);
  });
});
