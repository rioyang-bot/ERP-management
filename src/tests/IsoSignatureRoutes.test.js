import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { createIsoSignatureRoutes, contentHash } from '../../server/isoSignatureRoutes.js';
import { MODULE_MAP } from '../utils/auditLogger';

/**
 * ISO 表單線上簽核的伺服器端（設備攜出入單）
 *
 * - 簽的人取自連線階段，不能代簽；誰能簽看帳號權限 isoSignRoomAdmin／isoSignSupervisor
 * - 簽名時記下內容雜湊（伺服器自己查），之後內容不同就是「簽核後資料有異動」
 * - 簽核、重簽、撤銷都寫事件紀錄
 */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const MOVES = [
  { move_date: '2026-10-01', direction: 'IN', reason: '進貨', vendor: '華峻', brand: 'ARISTA', model: 'DCS-7010TX', specification: '', sn: 'HBG254808R4' },
];
const namedQueries = { fetchEquipmentMovements: 'SELECT fetchEquipmentMovements' };

const makePool = ({ moves = MOVES, existing = null, mine = null } = {}) => {
  const calls = [];
  const query = vi.fn(async (sql, params) => {
    calls.push({ sql, params });
    if (sql === namedQueries.fetchEquipmentMovements) return { rows: moves };
    if (/FROM user_signatures/.test(sql) && /SELECT/.test(sql)) return { rows: mine ? [{ signature_png: mine, updated_at: '2026-10-20T08:00:00Z' }] : [] };
    if (/INSERT INTO user_signatures/.test(sql)) return { rows: [{ replaced: !!mine }] };
    if (/DELETE FROM user_signatures/.test(sql)) return { rows: mine ? [{ user_id: params[0] }] : [], rowCount: mine ? 1 : 0 };
    if (/SELECT signer_role/.test(sql)) return { rows: existing ? [existing] : [] };
    if (/SELECT user_name, content_hash/.test(sql)) return { rows: existing ? [existing] : [] };
    if (/INSERT INTO iso_form_signatures/.test(sql)) return { rows: [{ signed_at: '2026-10-31T09:00:00Z' }] };
    if (/DELETE FROM iso_form_signatures/.test(sql)) return { rows: existing ? [{ user_name: existing.user_name, signed_at: existing.signed_at }] : [] };
    return { rows: [] };
  });
  return { pool: { query }, calls };
};

const auth = { requireAuth: (req, res, next) => next() };

const handlerFor = (router, method, path) => {
  const layer = router.stack.find((l) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`找不到路由 ${method.toUpperCase()} ${path}`);
  return layer.route.stack.at(-1).handle;
};

const makeRes = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});

const USERS = {
  roomAdmin: { id: 7, username: 'tom', full_name: '王機房', role: 'IT', menu_access: { isoSignRoomAdmin: true } },
  supervisor: { id: 8, username: 'amy', full_name: '李主管', role: 'IT', menu_access: { isoSignSupervisor: true } },
  // 管理員沒勾簽核權限：不能簽，但可以撤銷
  admin: { id: 1, username: 'METECH', full_name: '系統管理員', role: 'ADMIN', menu_access: { reports: true } },
  nobody: { id: 9, username: 'joe', full_name: '張倉管', role: 'WAREHOUSE', menu_access: { reports: true } },
};

const makeReq = (user, params, body = {}) => ({ user, params, body, ip: '192.168.100.55', get: () => undefined });

const auditRows = (calls) => calls.filter((c) => /INSERT INTO system_audit_logs/.test(c.sql)).map((c) => c.params);

describe('ISO 表單簽核 API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('資料表的 migration 列在清單裡；事件紀錄有 ISO 表單模組', () => {
    const { migrations } = JSON.parse(fs.readFileSync('database/migrations.manifest.json', 'utf8'));
    expect(migrations.find((m) => m.file === 'migration_iso_form_signatures.sql')).toMatchObject({ type: 'schema' });
    const sql = fs.readFileSync('database/migration_iso_form_signatures.sql', 'utf8');
    expect(sql).toContain('UNIQUE (form_code, period, signer_role)');
    expect(sql).toContain("CHECK (signer_role IN ('ROOM_ADMIN', 'SUPERVISOR'))");
    expect(MODULE_MAP.ISO_FORM.label).toBe('ISO 表單');
  });

  it('伺服器有掛上簽核路由', () => {
    const server = fs.readFileSync('server.js', 'utf8');
    expect(server).toContain("app.use('/api/iso-signatures', createIsoSignatureRoutes(pool, auth, namedQueries))");
  });

  it('簽名：簽的人取自連線階段，內容雜湊由伺服器依當月資料計算；寫一筆事件紀錄', async () => {
    const { pool, calls } = makePool();
    const res = makeRes();
    await handlerFor(createIsoSignatureRoutes(pool, auth, namedQueries), 'post', '/:form/:period/:role')(
      // 用戶端送來的名字不採用
      makeReq(USERS.roomAdmin, { form: 'S-408-02', period: '2026-10', role: 'ROOM_ADMIN' }, { signature: PNG, userName: '別人' }), res);
    expect(res.statusCode).toBe(200);
    expect(calls.find((c) => c.sql === namedQueries.fetchEquipmentMovements).params).toEqual(['2026-10-01', '2026-11-01']);
    const insert = calls.find((c) => /INSERT INTO iso_form_signatures/.test(c.sql)).params;
    expect(insert).toEqual(['S-408-02', '2026-10', 'ROOM_ADMIN', 7, '王機房', PNG, contentHash(MOVES), 1]);

    const logs = auditRows(calls);
    expect(logs).toHaveLength(1);
    const [userId, userName, , actionType, module, moduleLabel, targetId, targetName, summary, details, ip] = logs[0];
    expect([userId, userName, actionType, module, moduleLabel]).toEqual([7, '王機房', 'CREATE', 'ISO_FORM', 'ISO 表單']);
    expect(targetId).toBe('S-408-02 2026-10');
    expect(targetName).toBe('設備攜出入單 115年10月');
    expect(summary).toBe('簽核設備攜出入單 [115年10月]：機房管理員 王機房（共 1 列）');
    expect(JSON.parse(details)).toMatchObject({ form: 'S-408-02', period: '2026-10', role: 'ROOM_ADMIN', rowCount: 1 });
    // 簽名圖不放進事件紀錄
    expect(details).not.toContain('base64');
    expect(ip).toBe('192.168.100.55');
  });

  it('沒有權限的不能簽；管理員也要勾了才能簽；不能簽別的角色', async () => {
    for (const [user, role] of [[USERS.nobody, 'ROOM_ADMIN'], [USERS.admin, 'SUPERVISOR'], [USERS.roomAdmin, 'SUPERVISOR']]) {
      const { pool, calls } = makePool();
      const res = makeRes();
      await handlerFor(createIsoSignatureRoutes(pool, auth, namedQueries), 'post', '/:form/:period/:role')(
        makeReq(user, { form: 'S-408-02', period: '2026-10', role }, { signature: PNG }), res);
      expect(res.statusCode).toBe(403);
      expect(calls.some((c) => /INSERT/.test(c.sql))).toBe(false);
    }
  });

  it('擋掉不對的表單、月份、角色與簽名圖', async () => {
    const cases = [
      [{ form: 'X-1', period: '2026-10', role: 'ROOM_ADMIN' }, { signature: PNG }],
      [{ form: 'S-408-02', period: '2026-13', role: 'ROOM_ADMIN' }, { signature: PNG }],
      [{ form: 'S-408-02', period: '2026-10', role: 'BOSS' }, { signature: PNG }],
      [{ form: 'S-408-02', period: '2026-10', role: 'ROOM_ADMIN' }, { signature: 'data:image/svg+xml;base64,PHN2Zz4=' }],
      [{ form: 'S-408-02', period: '2026-10', role: 'ROOM_ADMIN' }, { signature: `data:image/png;base64,${'A'.repeat(500 * 1024)}` }],
    ];
    for (const [params, body] of cases) {
      const { pool, calls } = makePool();
      const res = makeRes();
      await handlerFor(createIsoSignatureRoutes(pool, auth, namedQueries), 'post', '/:form/:period/:role')(makeReq(USERS.roomAdmin, params, body), res);
      expect(res.statusCode).toBe(400);
      expect(calls.some((c) => /INSERT/.test(c.sql))).toBe(false);
    }
  });

  it('已有有效簽名不能直接蓋過（409）；簽核後資料有異動的可以重簽，事件紀錄寫明原簽核人', async () => {
    const valid = { user_name: '王機房', content_hash: contentHash(MOVES) };
    const blocked = makePool({ existing: valid });
    const res1 = makeRes();
    await handlerFor(createIsoSignatureRoutes(blocked.pool, auth, namedQueries), 'post', '/:form/:period/:role')(
      makeReq(USERS.roomAdmin, { form: 'S-408-02', period: '2026-10', role: 'ROOM_ADMIN' }, { signature: PNG }), res1);
    expect(res1.statusCode).toBe(409);
    expect(blocked.calls.some((c) => /INSERT/.test(c.sql))).toBe(false);

    const stale = makePool({ existing: { user_name: '王機房', content_hash: 'old' } });
    const res2 = makeRes();
    await handlerFor(createIsoSignatureRoutes(stale.pool, auth, namedQueries), 'post', '/:form/:period/:role')(
      makeReq(USERS.roomAdmin, { form: 'S-408-02', period: '2026-10', role: 'ROOM_ADMIN' }, { signature: PNG }), res2);
    expect(res2.statusCode).toBe(200);
    const [log] = auditRows(stale.calls);
    expect(log[8]).toBe('重新簽核設備攜出入單 [115年10月]：機房管理員 王機房（共 1 列），原簽核人 王機房 的簽名因資料異動失效');
    expect(JSON.parse(log[9]).replaced).toEqual({ userName: '王機房', reason: '簽核後資料有異動' });
  });

  it('讀取：內容沒變的是有效簽名，變了就標示 stale；回傳這個帳號能簽／能撤銷哪個角色', async () => {
    const sig = { signer_role: 'ROOM_ADMIN', user_name: '王機房', signature_png: PNG, content_hash: contentHash(MOVES), row_count: 1, signed_at: '2026-10-31T09:00:00Z' };
    const fresh = makePool({ existing: sig });
    const res = makeRes();
    await handlerFor(createIsoSignatureRoutes(fresh.pool, auth, namedQueries), 'get', '/:form/:period')(
      makeReq(USERS.admin, { form: 'S-408-02', period: '2026-10' }), res);
    expect(res.body.signatures.ROOM_ADMIN).toMatchObject({ userName: '王機房', signaturePng: PNG, stale: false });
    expect(res.body.signatures.SUPERVISOR).toBeUndefined();
    expect(res.body.permissions).toEqual({ ROOM_ADMIN: { canSign: false, canRevoke: true }, SUPERVISOR: { canSign: false, canRevoke: true } });

    // 補登了一台：內容不同了
    const changed = makePool({ moves: [...MOVES, { ...MOVES[0], sn: 'HBG254908RY' }], existing: sig });
    const res2 = makeRes();
    await handlerFor(createIsoSignatureRoutes(changed.pool, auth, namedQueries), 'get', '/:form/:period')(
      makeReq(USERS.supervisor, { form: 'S-408-02', period: '2026-10' }), res2);
    expect(res2.body.signatures.ROOM_ADMIN.stale).toBe(true);
    expect(res2.body.rowCount).toBe(2);
    expect(res2.body.permissions.SUPERVISOR).toEqual({ canSign: true, canRevoke: true });
    expect(res2.body.permissions.ROOM_ADMIN).toEqual({ canSign: false, canRevoke: false });
  });

  it('撤銷：有權限的人或管理員；寫事件紀錄', async () => {
    const existing = { user_name: '王機房', signed_at: '2026-10-31T09:00:00Z' };
    const denied = makePool({ existing });
    const res1 = makeRes();
    await handlerFor(createIsoSignatureRoutes(denied.pool, auth, namedQueries), 'delete', '/:form/:period/:role')(
      makeReq(USERS.nobody, { form: 'S-408-02', period: '2026-10', role: 'ROOM_ADMIN' }), res1);
    expect(res1.statusCode).toBe(403);
    expect(denied.calls.some((c) => /DELETE/.test(c.sql))).toBe(false);

    const ok = makePool({ existing });
    const res2 = makeRes();
    await handlerFor(createIsoSignatureRoutes(ok.pool, auth, namedQueries), 'delete', '/:form/:period/:role')(
      makeReq(USERS.admin, { form: 'S-408-02', period: '2026-10', role: 'ROOM_ADMIN' }), res2);
    expect(res2.statusCode).toBe(200);
    const [log] = auditRows(ok.calls);
    expect([log[1], log[3], log[4], log[6]]).toEqual(['系統管理員', 'DELETE', 'ISO_FORM', 'S-408-02 2026-10']);
    expect(log[8]).toBe('撤銷設備攜出入單 [115年10月] 的機房管理員簽核（原簽核人 王機房）');

    // 沒簽過的撤銷不了，也不寫紀錄
    const none = makePool();
    const res3 = makeRes();
    await handlerFor(createIsoSignatureRoutes(none.pool, auth, namedQueries), 'delete', '/:form/:period/:role')(
      makeReq(USERS.admin, { form: 'S-408-02', period: '2026-10', role: 'SUPERVISOR' }), res3);
    expect(res3.statusCode).toBe(404);
    expect(auditRows(none.calls)).toHaveLength(0);
  });

  it('個人簽名檔的資料表列在 migration 清單；路由寫在 /:form/:period 前面', () => {
    const { migrations } = JSON.parse(fs.readFileSync('database/migrations.manifest.json', 'utf8'));
    expect(migrations.find((m) => m.file === 'migration_user_signatures.sql')).toMatchObject({ type: 'schema' });
    expect(fs.readFileSync('database/migration_user_signatures.sql', 'utf8')).toContain('user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE');
    const paths = createIsoSignatureRoutes(makePool().pool, auth, namedQueries).stack.map((l) => l.route.path);
    expect(paths.indexOf('/me/signature')).toBeLessThan(paths.indexOf('/:form/:period'));
  });

  it('個人簽名檔：只讀寫自己的（對象取自連線階段），設定、更新、刪除都寫事件紀錄', async () => {
    const router = (p) => createIsoSignatureRoutes(p.pool, auth, namedQueries);
    // 讀取
    const read = makePool({ mine: PNG });
    const res0 = makeRes();
    await handlerFor(router(read), 'get', '/me/signature')(makeReq(USERS.roomAdmin, {}, { userId: 99 }), res0);
    expect(res0.body).toMatchObject({ success: true, signaturePng: PNG });
    expect(read.calls.find((c) => /FROM user_signatures/.test(c.sql)).params).toEqual([7]);

    // 第一次設定
    const first = makePool();
    const res1 = makeRes();
    await handlerFor(router(first), 'put', '/me/signature')(makeReq(USERS.roomAdmin, {}, { signature: PNG, userId: 99 }), res1);
    expect(res1.statusCode).toBe(200);
    expect(first.calls.find((c) => /INSERT INTO user_signatures/.test(c.sql)).params).toEqual([7, PNG]);
    let [log] = auditRows(first.calls);
    expect([log[0], log[3], log[4], log[6], log[8]]).toEqual([7, 'CREATE', 'USER', 'tom', '設定個人簽名檔 [tom]']);
    expect(log[9]).not.toContain('base64');

    // 更新
    const again = makePool({ mine: PNG });
    await handlerFor(router(again), 'put', '/me/signature')(makeReq(USERS.roomAdmin, {}, { signature: PNG }), makeRes());
    [log] = auditRows(again.calls);
    expect([log[3], log[8]]).toEqual(['UPDATE', '更新個人簽名檔 [tom]']);

    // 格式不對不存
    const bad = makePool();
    const res2 = makeRes();
    await handlerFor(router(bad), 'put', '/me/signature')(makeReq(USERS.roomAdmin, {}, { signature: 'data:image/gif;base64,R0lG' }), res2);
    expect(res2.statusCode).toBe(400);
    expect(bad.calls.some((c) => /INSERT/.test(c.sql))).toBe(false);

    // 刪除；沒有的刪不了也不寫紀錄
    const del = makePool({ mine: PNG });
    await handlerFor(router(del), 'delete', '/me/signature')(makeReq(USERS.roomAdmin, {}), makeRes());
    [log] = auditRows(del.calls);
    expect([log[3], log[8]]).toEqual(['DELETE', '刪除個人簽名檔 [tom]']);
    const none = makePool();
    const res3 = makeRes();
    await handlerFor(router(none), 'delete', '/me/signature')(makeReq(USERS.roomAdmin, {}), res3);
    expect(res3.statusCode).toBe(404);
    expect(auditRows(none.calls)).toHaveLength(0);
  });

  it('用自己的簽名檔簽核：伺服器讀這個帳號的簽名檔，不採用用戶端送來的圖', async () => {
    const MINE = 'data:image/png;base64,TUlORQ==';
    const { pool, calls } = makePool({ mine: MINE });
    const res = makeRes();
    await handlerFor(createIsoSignatureRoutes(pool, auth, namedQueries), 'post', '/:form/:period/:role')(
      makeReq(USERS.supervisor, { form: 'S-408-02', period: '2026-10', role: 'SUPERVISOR' }, { useSaved: true, signature: PNG }), res);
    expect(res.statusCode).toBe(200);
    expect(calls.find((c) => /FROM user_signatures/.test(c.sql)).params).toEqual([8]);
    const insert = calls.find((c) => /INSERT INTO iso_form_signatures/.test(c.sql)).params;
    expect(insert[4]).toBe('李主管');
    expect(insert[5]).toBe(MINE);
    expect(JSON.parse(auditRows(calls)[0][9]).source).toBe('簽名檔');

    // 還沒有簽名檔
    const empty = makePool();
    const res2 = makeRes();
    await handlerFor(createIsoSignatureRoutes(empty.pool, auth, namedQueries), 'post', '/:form/:period/:role')(
      makeReq(USERS.supervisor, { form: 'S-408-02', period: '2026-10', role: 'SUPERVISOR' }, { useSaved: true }), res2);
    expect(res2.statusCode).toBe(400);
    expect(res2.body.error).toContain('還沒有簽名檔');
    expect(empty.calls.some((c) => /INSERT/.test(c.sql))).toBe(false);
  });

  it('內容雜湊只看印在表單上的欄位；日期是 Date 或字串都一樣', () => {
    const asDate = [{ ...MOVES[0], move_date: new Date(2026, 9, 1), extra: 'x' }];
    expect(contentHash(asDate)).toBe(contentHash(MOVES));
    expect(contentHash([{ ...MOVES[0], sn: 'OTHER' }])).not.toBe(contentHash(MOVES));
  });
});
