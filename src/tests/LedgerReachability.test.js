import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logBulkCreate } from '../utils/auditLogger';

/**
 * 讓事件紀錄接得回品項履歷
 *
 * 履歷只收兩種紀錄：target_id 正好是資產序號的，以及 details 裡帶了
 * itemMasterId 的。不合的紀錄即使寫進去了，打開品項履歷也看不到。
 */
describe('批次建檔逐序號各記一筆', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = { namedQuery: vi.fn(async () => ({ success: true, rows: [] })) };
  });

  const logs = () => window.electronAPI.namedQuery.mock.calls
    .filter(([q]) => q === 'insertAuditLog')
    .map(([, params]) => ({ target: params[6], summary: params[8], details: params[9] }));

  it('批次建的每一台都記一筆，履歷才接得回它自己', async () => {
    await logBulkCreate('DEVICE', {
      bulkTarget: '批次 3 台', isBulk: true, snList: ['SN-A', 'SN-B', 'SN-C'],
      targetName: 'SUPERMICRO SYS-1029P',
      summary: '新增設備 [SUPERMICRO SYS-1029P] 批次建立 3 筆',
      perSn: (sn) => `新增設備 序號: ${sn}`,
      details: { brand: 'SUPERMICRO' },
    });

    const all = logs();
    // 整批那一筆仍然保留，看得出這是一次批次作業
    expect(all.map((l) => l.target)).toEqual(
      expect.arrayContaining(['批次 3 台', 'SN-A', 'SN-B', 'SN-C']));
    expect(all).toHaveLength(4);
  });

  it('單筆建檔不會多記', async () => {
    await logBulkCreate('DEVICE', {
      bulkTarget: 'SN-ONLY', isBulk: false, snList: ['SN-ONLY'],
      targetName: 'DELL R750', summary: '新增設備',
    });

    expect(logs()).toHaveLength(1);
    expect(logs()[0].target).toBe('SN-ONLY');
  });

  it('重複與空白的序號不會各記一筆', async () => {
    await logBulkCreate('HARDWARE', {
      bulkTarget: '批次 4 件', isBulk: true, snList: ['SN-A', 'SN-A', '', '  ', 'SN-B'],
      targetName: 'X', summary: 'Y',
    });

    const targets = logs().map((l) => l.target);
    expect(targets.filter((t) => t === 'SN-A')).toHaveLength(1);
    expect(targets).not.toContain('');
    expect(logs()).toHaveLength(3);
  });

  it('每一筆都標明自己是批次的一員', async () => {
    await logBulkCreate('DEVICE', {
      bulkTarget: '批次 2 台', isBulk: true, snList: ['SN-A', 'SN-B'],
      targetName: 'X', summary: 'Y', details: { brand: 'SUPERMICRO' },
    });

    const members = logs().filter((l) => l.details?.isBulkMember);
    expect(members).toHaveLength(2);
    expect(members[0].details.brand).toBe('SUPERMICRO');
  });
});
