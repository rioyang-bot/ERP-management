import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { createStockAdjustRoutes, describeDiff } from '../../server/stockAdjustRoutes.js';
import { queries } from '../../database/queries';

/**
 * 耗材盤點調整 API（只調整 Stock）
 *
 * - 要有 menu_access.stockAdjust（權限設定的「可盤點調整」），管理員也一樣
 * - 帶上畫面看到的系統數量；鎖列後跟目前數量不同就回 409，不蓋掉別人的異動
 * - 數量更新與事件紀錄在同一個交易裡
 * - 這支 SQL 不放進 database/queries.js：/api/namedQuery 只檢查有沒有登入
 */
const ITEM = { id: 42, brand: 'CISCO', model: '10G-SR', type: 'SFP', specification: '10G 多模', stock_qty: 120, category_name: '耗材' };

const makePool = ({ item = ITEM, failOn = null } = {}) => {
  const calls = [];
  const query = vi.fn(async (sql, params) => {
    calls.push({ sql, params });
    if (failOn && failOn.test(sql)) throw new Error('db error');
    if (/FROM item_master i/.test(sql)) return { rows: item ? [item] : [] };
    return { rows: [], rowCount: 1 };
  });
  const client = { query, release: vi.fn() };
  return { pool: { connect: vi.fn(async () => client) }, client, calls };
};

const auth = { requireAuth: (req, res, next) => next() };
const handler = (pool) => createStockAdjustRoutes(pool, auth).stack.find((l) => l.route?.path === '/' && l.route.methods.post).route.stack.at(-1).handle;
const makeRes = () => ({
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});

const USERS = {
  keeper: { id: 7, username: 'tom', full_name: '王倉管', role: 'WAREHOUSE', menu_access: { stockAdjust: true } },
  // 管理員沒勾「可盤點調整」一樣不能調
  admin: { id: 1, username: 'METECH', full_name: '系統管理員', role: 'ADMIN', menu_access: { inventory: true } },
};
const BODY = { itemMasterId: 42, expectedStock: 120, actualStock: 117, reason: '遺失', note: '10/29 盤點' };

const call = async ({ user = USERS.keeper, body = BODY, ...poolOpts } = {}) => {
  const ctx = makePool(poolOpts);
  const res = makeRes();
  await handler(ctx.pool)({ user, body, ip: '192.168.100.55', get: () => undefined }, res);
  return { ...ctx, res, sqls: ctx.calls.map((c) => c.sql.trim().split(/\s+/).slice(0, 2).join(' ')) };
};
const auditOf = (calls) => calls.find((c) => /INSERT INTO system_audit_logs/.test(c.sql));

describe('盤點調整 API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('有權限：鎖列、改 Stock、寫事件紀錄，在同一個交易裡', async () => {
    const { res, calls, sqls, client } = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, before: 120, after: 117, diff: -3 });
    expect(sqls).toEqual(['BEGIN', 'SELECT i.id,', 'UPDATE item_master', 'INSERT INTO', 'COMMIT']);
    expect(calls[1].sql).toContain('FOR UPDATE');
    expect(calls[2].params).toEqual([117, 42]);
    expect(client.release).toHaveBeenCalled();
  });

  it('事件紀錄：耗材模組、品項 id、前後數量與差額、原因，品項履歷接得回來', async () => {
    const { calls } = await call();
    const p = auditOf(calls).params;
    expect(p.slice(0, 3)).toEqual([7, '王倉管', 'WAREHOUSE']);
    expect(p[3]).toBe('42');
    expect(p[4]).toBe('CISCO 10G-SR');
    expect(p[5]).toBe('盤點調整 [CISCO 10G-SR]：Stock 120 → 117（盤虧 −3），原因：遺失；10/29 盤點');
    const d = JSON.parse(p[6]);
    expect(d).toMatchObject({ itemMasterId: '42', stockAdjust: 'LOSS', quantity: 3, before: 120, after: 117, diff: -3, reason: '遺失', note: '10/29 盤點' });
    expect(p[7]).toBe('192.168.100.55');
    expect(auditOf(calls).sql).toContain("'UPDATE', 'CONSUMABLE', '耗材物料'");
  });

  it('盤盈也可以', async () => {
    const { res, calls } = await call({ body: { ...BODY, actualStock: 125, reason: '找回先前短少', note: '' } });
    expect(res.body.diff).toBe(5);
    expect(auditOf(calls).params[5]).toBe('盤點調整 [CISCO 10G-SR]：Stock 120 → 125（盤盈 +5），原因：找回先前短少');
    expect(JSON.parse(auditOf(calls).params[6]).stockAdjust).toBe('GAIN');
  });

  it('沒有「可盤點調整」權限回 403，管理員也一樣，什麼都不碰', async () => {
    for (const user of [USERS.admin, { ...USERS.keeper, menu_access: {} }, null]) {
      const { res, pool } = await call({ user });
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('可盤點調整');
      expect(pool.connect).not.toHaveBeenCalled();
    }
  });

  it('數量被別人異動過：回 409 與目前數量，不改', async () => {
    const { res, sqls } = await call({ item: { ...ITEM, stock_qty: 118 } });
    expect(res.statusCode).toBe(409);
    expect(res.body.currentStock).toBe(118);
    expect(res.body.error).toContain('畫面上是 120，目前是 118');
    expect(sqls).not.toContain('UPDATE item_master');
    expect(sqls.at(-1)).toBe('ROLLBACK');
  });

  it('只限耗材：設備、硬體的數量是算出來的', async () => {
    const { res, sqls } = await call({ item: { ...ITEM, category_name: '設備' } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('只有耗材');
    expect(sqls).not.toContain('UPDATE item_master');
  });

  it('找不到品項回 404', async () => {
    const { res } = await call({ item: null });
    expect(res.statusCode).toBe(404);
  });

  it('數量相同不調整', async () => {
    const { res, sqls } = await call({ body: { ...BODY, actualStock: 120 } });
    expect(res.statusCode).toBe(400);
    expect(sqls).not.toContain('UPDATE item_master');
  });

  it.each([
    [{ actualStock: -1 }, '數量'],
    [{ actualStock: 1.5 }, '數量'],
    [{ actualStock: '117' }, '數量'],
    [{ expectedStock: undefined }, '數量'],
    [{ itemMasterId: 'x' }, '品項'],
    [{ reason: '  ' }, '原因'],
    [{ note: 'x'.repeat(501) }, '說明'],
  ])('輸入不對回 400：%o', async (patch, word) => {
    const { res, pool } = await call({ body: { ...BODY, ...patch } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain(word);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('事件紀錄寫不進去就整筆回滾，回 500', async () => {
    const { res, sqls, client } = await call({ failOn: /INSERT INTO system_audit_logs/ });
    expect(res.statusCode).toBe(500);
    expect(sqls.at(-1)).toBe('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('差額文字', () => {
    expect(describeDiff(-3)).toBe('盤虧 −3');
    expect(describeDiff(2)).toBe('盤盈 +2');
  });
});

describe('接線', () => {
  it('伺服器掛上 /api/stock-adjustments', () => {
    const src = fs.readFileSync('server.js', 'utf8');
    expect(src).toContain("app.use('/api/stock-adjustments', createStockAdjustRoutes(pool, auth));");
  });

  it('調整用的 SQL 不做成具名查詢（/api/namedQuery 不檢查權限）', () => {
    const src = fs.readFileSync('server/stockAdjustRoutes.js', 'utf8');
    const sql = src.match(/`(UPDATE item_master SET stock_qty[^`]*)`/)[1];
    expect(Object.values(queries).map((q) => q.trim())).not.toContain(sql.trim());
    expect(src).not.toMatch(/namedQueries/);
  });

  it('品項履歷把盤點調整顯示成自己的類型', () => {
    expect(queries.fetchItemFlowHistory).toContain("WHEN l.details->>'stockAdjust' IN ('LOSS', 'GAIN') THEN 'STOCK_ADJUST'");
  });
});
