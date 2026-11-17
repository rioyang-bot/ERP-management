import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { autoMergeDuplicateItemMasters, cleanupUnusedItemMasters } from '../../server/itemMasterMaintenance.js';

/**
 * 品項主檔維護（伺服器啟動時與系統設定的「整併重複主檔」）的事件紀錄
 *
 * - 清理未使用的設備／硬體主檔：有刪到東西才記一筆，列出刪掉的廠牌／類型／型號／規格
 * - 整併大小寫重複主檔：每一組記一筆，保留哪個、刪掉哪些、各資料表搬了幾筆
 * - 啟動時記在「系統」名下；從 API 觸發記在操作的使用者名下
 */
const audits = (calls) => calls
  .filter((c) => /INSERT INTO system_audit_logs/.test(c.sql))
  .map((c) => ({
    userId: c.params[0], userName: c.params[1], userRole: c.params[2], actionType: c.params[3],
    module: c.params[4], targetId: c.params[6], summary: c.params[8], details: JSON.parse(c.params[9]), ip: c.params[10],
  }));

const makePool = (handler) => {
  const calls = [];
  const query = vi.fn(async (sql, params) => {
    calls.push({ sql, params });
    return handler(sql, params) || { rows: [], rowCount: 0 };
  });
  return { pool: { query }, calls };
};

describe('清理未使用的品項主檔', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));

  it('有刪到：DELETE 帶 RETURNING，寫一筆列出刪掉主檔的事件紀錄（系統）', async () => {
    const { pool, calls } = makePool((sql) => {
      if (/DELETE FROM item_master/.test(sql)) {
        return { rows: [
          { id: 11, cat_name: '設備', brand: 'DELL', type: 'SERVER', model: 'R750', specification: '' },
          { id: 12, cat_name: '硬體', brand: 'INTEL', type: 'NIC', model: 'X710', specification: '10G' },
        ] };
      }
      return null;
    });
    const rows = await cleanupUnusedItemMasters(pool);
    expect(rows).toHaveLength(2);
    expect(calls[0].sql).toMatch(/RETURNING/);
    expect(calls[0].sql).toMatch(/NOT EXISTS \(SELECT 1 FROM assets/);

    const [log] = audits(calls);
    expect(log).toMatchObject({ userName: '系統', userRole: 'SYSTEM', module: 'SYSTEM_SETTINGS', actionType: 'DELETE', targetId: '11,12' });
    expect(log.summary).toContain('DELL / SERVER / R750');
    expect(log.summary).toContain('INTEL / NIC / X710（10G）');
    expect(log.details.removed).toEqual([
      expect.objectContaining({ id: 11, brand: 'DELL', type: 'SERVER', model: 'R750' }),
      expect.objectContaining({ id: 12, specification: '10G' }),
    ]);
  });

  it('沒有可清的主檔：不寫事件紀錄', async () => {
    const { pool, calls } = makePool(() => null);
    await cleanupUnusedItemMasters(pool);
    expect(audits(calls)).toHaveLength(0);
  });
});

describe('整併大小寫重複的品項主檔', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));

  const mergePool = () => makePool((sql) => {
    if (/array_agg/.test(sql)) {
      return { rows: [{ cat_name: '設備', norm_brand: 'dell', norm_type: 'server', norm_model: 'r750', ids: [3, 5, 9] }] };
    }
    if (/FROM assets\s+WHERE item_master_id = ANY/.test(sql)) return { rows: [{ item_master_id: 5, cnt: '4' }] };
    if (/SELECT id, brand, type, model, specification FROM item_master/.test(sql)) {
      return { rows: [
        { id: 3, brand: 'dell', type: 'server', model: 'r750', specification: '' },
        { id: 5, brand: 'DELL', type: 'SERVER', model: 'R750', specification: '' },
        { id: 9, brand: 'Dell ', type: 'Server', model: 'R750', specification: '' },
      ] };
    }
    if (/UPDATE assets/.test(sql)) return { rows: [], rowCount: 2 };
    if (/UPDATE inbound_items/.test(sql)) return { rows: [], rowCount: 1 };
    if (/UPDATE (outbound_items|item_lab_assignments|repair_items)/.test(sql)) return { rows: [], rowCount: 0 };
    return null;
  });

  it('啟動時：每組一筆，記保留的主檔、刪掉的主檔與各表搬了幾筆（系統）', async () => {
    const { pool, calls } = mergePool();
    const result = await autoMergeDuplicateItemMasters(pool);
    expect(result).toEqual({ mergedGroups: 1, removedMasters: 2 });

    const [log] = audits(calls);
    expect(log).toMatchObject({ userName: '系統', userRole: 'SYSTEM', module: 'SYSTEM_SETTINGS', actionType: 'UPDATE', targetId: '5' });
    expect(log.summary).toContain('保留 #5');
    expect(log.summary).toContain('#3 dell / server / r750');
    expect(log.summary).toContain('資產 2 筆');
    expect(log.summary).toContain('進貨單項目 1 筆');
    expect(log.details).toMatchObject({
      keptId: 5,
      kept: { id: 5, brand: 'DELL', type: 'SERVER', model: 'R750' },
      removedIds: [3, 9],
      movedRows: { assets: 2, inbound_items: 1, outbound_items: 0, item_lab_assignments: 0, repair_items: 0 },
    });
    // 讀原本內容要在刪除之前
    const readIdx = calls.findIndex((c) => /SELECT id, brand, type, model, specification FROM item_master/.test(c.sql));
    const delIdx = calls.findIndex((c) => /DELETE FROM item_master WHERE id = ANY/.test(c.sql));
    expect(readIdx).toBeGreaterThan(-1);
    expect(readIdx).toBeLessThan(delIdx);
  });

  it('從 API 觸發：記在操作的使用者名下，含來源 IP', async () => {
    const { pool, calls } = mergePool();
    const req = { user: { id: 1, username: 'admin', full_name: '系統管理員', role: 'ADMIN' }, ip: '10.0.0.8', get: () => undefined };
    await autoMergeDuplicateItemMasters(pool, { req });
    const [log] = audits(calls);
    expect(log).toMatchObject({ userId: 1, userName: '系統管理員', userRole: 'ADMIN', ip: '10.0.0.8' });
  });

  it('沒有重複：不寫事件紀錄', async () => {
    const { pool, calls } = makePool(() => null);
    expect(await autoMergeDuplicateItemMasters(pool)).toEqual({ mergedGroups: 0, removedMasters: 0 });
    expect(audits(calls)).toHaveLength(0);
  });

  it('server.js 啟動時清理與整併都改用這支模組，API 傳入 req', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
    expect(src).toContain("from './server/itemMasterMaintenance.js'");
    expect(src).toContain('await cleanupUnusedItemMasters(pool);');
    expect(src).toContain('autoMergeDuplicateItemMasters(pool, { req })');
    expect(src).not.toMatch(/async function autoMergeDuplicateItemMasters/);
  });
});
