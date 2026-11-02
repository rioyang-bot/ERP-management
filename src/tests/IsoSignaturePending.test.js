import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createIsoSignatureRoutes, contentHash, monthsToRemind, FORMS } from '../../server/isoSignatureRoutes.js';

/**
 * 設備攜出入單待簽提醒（營運總覽）：GET /api/iso-signatures/S-408-02/pending
 *
 * 只列出同時符合的月份：
 *   1. 上個月（含）以前 —— 本月還沒結束不算；也不早於表單開始使用的月份（115/06）
 *   2. 有設備進出 —— 沒有進出的月份不用簽
 *   3. 還沒簽完 —— 機房管理員或權責主管任一沒簽，或簽核後資料有異動（要重簽）
 */
const namedQueries = { fetchEquipmentMovements: 'SELECT fetchEquipmentMovements' };
const mv = (date, sn) => ({ move_date: date, direction: 'OUT', reason: '出貨', vendor: '客戶', brand: 'ARISTA', model: 'DCS', specification: '', sn });

// 2026-11-02：提醒範圍是 2026-06 ~ 2026-10
const NOW = new Date(2026, 10, 2, 9, 0, 0);

const makePool = ({ moves = [], sigs = [] } = {}) => {
  const calls = [];
  const query = vi.fn(async (sql, params) => {
    calls.push({ sql, params });
    if (sql === namedQueries.fetchEquipmentMovements) return { rows: moves };
    if (/FROM iso_form_signatures/.test(sql)) return { rows: sigs };
    return { rows: [] };
  });
  return { pool: { query }, calls };
};

const auth = { requireAuth: (req, res, next) => next() };
const handler = (pool) => createIsoSignatureRoutes(pool, auth, namedQueries).stack
  .find((l) => l.route?.path === '/:form/pending' && l.route.methods.get).route.stack.at(-1).handle;
const makeRes = () => ({
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});
const call = async (opts, form = 'S-408-02') => {
  const ctx = makePool(opts);
  const res = makeRes();
  await handler(ctx.pool)({ params: { form }, user: { id: 1 } }, res);
  return { ...ctx, res };
};
const sig = (period, role, rows, extra = {}) => ({ period, signer_role: role, user_name: role === 'ROOM_ADMIN' ? '王機房' : '李主管', content_hash: contentHash(rows), ...extra });

describe('提醒的月份範圍', () => {
  it('從表單開始使用的月份到上個月（含），本月不算', () => {
    expect(FORMS['S-408-02'].since).toBe('2026-06');
    expect(monthsToRemind('2026-06', NOW)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('跨年', () => {
    expect(monthsToRemind('2026-11', new Date(2027, 1, 1))).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('還在開始月份當月：沒有要提醒的', () => {
    expect(monthsToRemind('2026-06', new Date(2026, 5, 30))).toEqual([]);
  });
});

describe('待簽月份 API', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
  afterEach(() => vi.useRealTimers());

  it('整段期間只查一次進出（6/1 到 11/1，不含本月）', async () => {
    const { calls } = await call({});
    const q = calls.filter((c) => c.sql === namedQueries.fetchEquipmentMovements);
    expect(q).toHaveLength(1);
    expect(q[0].params).toEqual(['2026-06-01', '2026-11-01']);
    const s = calls.find((c) => /FROM iso_form_signatures/.test(c.sql));
    expect(s.params).toEqual(['S-408-02', '2026-06', '2026-10']);
  });

  it('沒有設備進出的月份不列', async () => {
    const { res } = await call({ moves: [] });
    expect(res.body).toEqual({ success: true, months: [] });
  });

  it('兩個角色都簽、資料沒異動：不列', async () => {
    const sep = [mv('2026-09-03', 'A1'), mv('2026-09-20', 'A2')];
    const { res } = await call({ moves: sep, sigs: [sig('2026-09', 'ROOM_ADMIN', sep), sig('2026-09', 'SUPERVISOR', sep)] });
    expect(res.body.months).toEqual([]);
  });

  it('列出沒簽完的月份：缺誰、誰要重簽，最近的月份排前面', async () => {
    const aug = [mv('2026-08-05', 'B1')];
    const sep = [mv('2026-09-03', 'A1'), mv('2026-09-20', 'A2')];
    const oct = [mv('2026-10-01', 'C1')];
    const { res } = await call({
      moves: [...aug, ...sep, ...oct],
      sigs: [
        // 8 月：兩個都簽了，但簽完後 8 月又多了一筆（簽的時候只有 0 筆）→ 兩個都要重簽
        sig('2026-08', 'ROOM_ADMIN', []), sig('2026-08', 'SUPERVISOR', []),
        // 9 月：機房管理員簽了，權責主管還沒簽
        sig('2026-09', 'ROOM_ADMIN', sep),
      ],
    });
    expect(res.body.months.map((m) => m.period)).toEqual(['2026-10', '2026-09', '2026-08']);
    const [o, s, a] = res.body.months;
    expect(o).toMatchObject({ label: '115年10月', rowCount: 1 });
    expect(o.roles.map((r) => r.status)).toEqual(['MISSING', 'MISSING']);
    expect(s).toMatchObject({ label: '115年09月', rowCount: 2 });
    expect(s.roles).toEqual([
      { role: 'ROOM_ADMIN', label: '機房管理員', status: 'SIGNED', userName: '王機房' },
      { role: 'SUPERVISOR', label: '權責主管', status: 'MISSING', userName: null },
    ]);
    expect(a.roles.map((r) => r.status)).toEqual(['STALE', 'STALE']);
  });

  it('本月與表單開始前的月份即使有進出、沒簽也不列', async () => {
    // 查詢本身就只查 6/1 ~ 11/1；就算資料庫多回了範圍外的列也不會被列進來
    const { res } = await call({ moves: [mv('2026-05-30', 'X'), mv('2026-11-01', 'Y')] });
    expect(res.body.months).toEqual([]);
  });

  it('月份欄位是 CHAR(7) 時（可能帶空白）也對得上', async () => {
    const sep = [mv('2026-09-03', 'A1')];
    const { res } = await call({ moves: sep, sigs: [sig('2026-09 ', 'ROOM_ADMIN', sep), sig('2026-09', 'SUPERVISOR', sep)] });
    expect(res.body.months).toEqual([]);
  });

  it('日期是 Date 物件時照本機日期分月', async () => {
    const rows = [mv(new Date(2026, 8, 30, 23, 30), 'A1')];
    const { res } = await call({ moves: rows });
    expect(res.body.months.map((m) => m.period)).toEqual(['2026-09']);
  });

  it('不支援的表單回 400；查詢失敗回 500', async () => {
    expect((await call({}, 'X-999')).res.statusCode).toBe(400);
    const ctx = makePool({});
    ctx.pool.query.mockRejectedValueOnce(new Error('db down'));
    const res = makeRes();
    await handler(ctx.pool)({ params: { form: 'S-408-02' }, user: { id: 1 } }, res);
    expect(res.statusCode).toBe(500);
  });

  it('pending 路由排在 /:form/:period 前面，不會被當成月份', () => {
    const paths = createIsoSignatureRoutes(makePool().pool, auth, namedQueries).stack
      .filter((l) => l.route?.methods?.get).map((l) => l.route.path);
    expect(paths.indexOf('/:form/pending')).toBeLessThan(paths.indexOf('/:form/:period'));
  });
});
