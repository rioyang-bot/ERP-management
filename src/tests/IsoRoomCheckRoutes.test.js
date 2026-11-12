import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import {
  createIsoRoomCheckRoutes, ITEMS as SERVER_ITEMS, TEMP_RANGE as SERVER_TEMP, HUMIDITY_RANGE as SERVER_HUMIDITY,
  normalizeCheck, weekOf as serverWeekOf, roomCheckHash, canManage, SIGN_CONTENT_SQL,
} from '../../server/isoRoomCheckRoutes.js';
import { createIsoSignatureRoutes, FORMS as SIGN_FORMS, canSign, canRevoke } from '../../server/isoSignatureRoutes.js';
import { ITEMS, TEMP_RANGE, HUMIDITY_RANGE, MAX_TEXT, weekOf, SIGN_ROLES } from '../utils/isoRoomCheck';

/**
 * ISO 27001 S-408-03 機房檢查表的伺服器端
 *
 * - 填寫人取自連線階段，用戶端送來的一律不理；只記在資料與事件紀錄，不印在表單上
 * - 溫度、溼度要填數字；四個項目都要勾正常或異常；有異常（勾異常或溫溼度超出管制範圍）要寫說明與處理方式
 * - 依日期排到這個月第幾周（1～7 日第一周…29 日以後第五周），同一周只能一筆（409）
 * - 只有填寫人本人或管理員能改、刪；修改不換填寫人
 * - 新增、修改、刪除都寫事件紀錄（ISO 表單模組）
 * - 每月簽核：檢查人任何登入帳號都能簽（撤銷限本人或管理員）、單位主管要有權責主管的簽核權限
 */
const OK = { CCTV: 'NORMAL', ACCESS: 'NORMAL', EQUIPMENT: 'NORMAL', ENVIRONMENT: 'NORMAL' };
const BODY = { checkDate: '2026-11-10', checkTime: '14:30', temperature: 22.5, humidity: 55, results: OK };
const NOW = new Date(2026, 10, 12, 9, 0);

const ROW = {
  id: 5, check_date: '2026-11-03', check_time: '09:15', period: '2026-11', week_no: 1, temperature: '22.0', humidity: '50.0',
  results: OK, abnormal_note: '', abnormal_action: '', created_by: 7, created_by_name: '王機房', created_at: 'x', updated_at: 'x',
};

const makePool = ({ existing = ROW, latest = null, conflict = false } = {}) => {
  const calls = [];
  const query = vi.fn(async (sql, params) => {
    calls.push({ sql, params });
    if (/INSERT INTO iso_room_checks/.test(sql)) {
      if (conflict) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      return {
        rows: [{
          id: 9, check_date: params[0], check_time: params[1], period: params[2], week_no: params[3], temperature: String(params[4]), humidity: String(params[5]),
          results: JSON.parse(params[6]), abnormal_note: params[7], abnormal_action: params[8], created_by: params[9], created_by_name: params[10],
        }],
      };
    }
    if (/UPDATE iso_room_checks/.test(sql)) {
      if (conflict) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      return {
        rows: [{
          ...existing, check_date: params[1], check_time: params[2], period: params[3], week_no: params[4], temperature: String(params[5]), humidity: String(params[6]),
          results: JSON.parse(params[7]), abnormal_note: params[8], abnormal_action: params[9],
        }],
      };
    }
    if (/DELETE FROM iso_room_checks/.test(sql)) return { rows: [] };
    if (/LIMIT 1/.test(sql)) return { rows: latest ? [latest] : [] };
    if (/WHERE id = \$1/.test(sql)) return { rows: existing ? [existing] : [] };
    if (/WHERE period = \$1/.test(sql)) return { rows: existing ? [existing] : [] };
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
  filler: { id: 7, username: 'tom', full_name: '王機房', role: 'IT', menu_access: {} },
  other: { id: 9, username: 'joe', full_name: '張倉管', role: 'WAREHOUSE', menu_access: {} },
  supervisor: { id: 8, username: 'amy', full_name: '李主管', role: 'IT', menu_access: { isoSignSupervisor: true } },
  admin: { id: 1, username: 'METECH', full_name: '系統管理員', role: 'ADMIN', menu_access: {} },
};

const makeReq = (user, params = {}, body = {}) => ({ user, params, body, ip: '192.168.100.55', get: () => undefined });
const auditRows = (calls) => calls.filter((c) => /INSERT INTO system_audit_logs/.test(c.sql)).map((c) => c.params);
const writes = (calls) => calls.filter((c) => /INSERT INTO iso_room_checks|UPDATE iso_room_checks|DELETE FROM iso_room_checks/.test(c.sql));

const call = async (pool, method, path, req) => {
  const router = createIsoRoomCheckRoutes(pool, auth);
  const res = makeRes();
  await handlerFor(router, method, path)(req, res);
  return res;
};

describe('機房檢查表 API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('migration 列在清單裡（含簽核角色多一個檢查人）；伺服器有掛上路由；前後端項目定義一致', () => {
    const { migrations } = JSON.parse(fs.readFileSync('database/migrations.manifest.json', 'utf8'));
    expect(migrations.find((m) => m.file === 'migration_iso_room_checks.sql')).toMatchObject({ type: 'schema' });
    const sql = fs.readFileSync('database/migration_iso_room_checks.sql', 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS iso_room_checks');
    expect(sql).toContain('UNIQUE (period, week_no)');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS iso_form_signatures_signer_role_check');
    expect(sql).toContain("CHECK (signer_role IN ('ROOM_ADMIN', 'SUPERVISOR', 'INSPECTOR'))");
    const server = fs.readFileSync('server.js', 'utf8');
    expect(server).toContain("app.use('/api/iso-room-checks', createIsoRoomCheckRoutes(pool, auth))");

    expect(SERVER_ITEMS).toEqual(ITEMS.map(({ key, label }) => ({ key, label })));
    expect([SERVER_TEMP, SERVER_HUMIDITY]).toEqual([TEMP_RANGE, HUMIDITY_RANGE]);
    // 簽核角色：前端顯示的與伺服器允許的一致
    expect(Object.entries(SIGN_FORMS['S-408-03'].roles)).toEqual(SIGN_ROLES.map((r) => [r.role, r.label]));
  });

  it('第幾周：1～7 日第一周、8～14 日第二周…29 日以後第五周（前後端算法一致）', () => {
    const cases = [['2026-11-01', 1], ['2026-11-07', 1], ['2026-11-08', 2], ['2026-11-21', 3], ['2026-11-28', 4], ['2026-11-29', 5], ['2026-12-31', 5]];
    for (const [d, w] of cases) {
      expect(serverWeekOf(d)).toBe(w);
      expect(weekOf(d)).toBe(w);
    }
  });

  it('新增：填寫人取自連線階段，用戶端送的不理；依日期算出月份與第幾周；寫一筆事件紀錄', async () => {
    const { pool, calls } = makePool();
    const res = await call(pool, 'post', '/', makeReq(USERS.filler, {}, {
      ...BODY, temperature: '22.46', abnormalNote: '沒有異常不該留下', createdByName: '別人', created_by: 99,
    }));
    expect(res.statusCode).toBe(200);
    const insert = writes(calls)[0];
    expect(insert.params).toEqual(['2026-11-10', '14:30', '2026-11', 2, 22.5, 55, JSON.stringify(OK), '', '', 7, '王機房']);
    expect(res.body.row).toMatchObject({ id: 9, checkDate: '2026-11-10', weekNo: 2, temperature: 22.5, humidity: 55, createdByName: '王機房', canManage: true });

    const logs = auditRows(calls);
    expect(logs).toHaveLength(1);
    const [userId, userName, role, action, module, moduleLabel, targetId, targetName, summary, details, ip] = logs[0];
    expect([userId, userName, role, action, module, moduleLabel]).toEqual([7, '王機房', 'IT', 'CREATE', 'ISO_FORM', 'ISO 表單']);
    expect([targetId, targetName]).toEqual(['S-408-03 #9', '機房檢查表 115/11/10']);
    expect(summary).toBe('新增機房檢查表（115/11/10 14:30，第二周）：溫度 22.5℃、溼度 55%、監視設備 正常、門禁管理 正常、設備管理 正常、機房環境 正常');
    expect(JSON.parse(details)).toMatchObject({ form: 'S-408-03', id: 9, after: { checkDate: '2026-11-10', weekNo: 2, temperature: 22.5 } });
    expect(ip).toBe('192.168.100.55');
  });

  it('有異常（勾異常、溫度或溼度超出管制範圍）要寫說明與處理方式，會記進事件紀錄', async () => {
    const { pool, calls } = makePool();
    const res = await call(pool, 'post', '/', makeReq(USERS.filler, {}, {
      ...BODY, results: { ...OK, EQUIPMENT: 'ABNORMAL' }, abnormalNote: '  Core Switch 風扇亮紅燈 ', abnormalAction: ' 更換風扇 ',
    }));
    expect(res.body.success).toBe(true);
    expect(writes(calls)[0].params.slice(7, 9)).toEqual(['Core Switch 風扇亮紅燈', '更換風扇']);
    expect(auditRows(calls)[0][8]).toBe('新增機房檢查表（115/11/10 14:30，第二周）：溫度 22.5℃、溼度 55%、監視設備 正常、門禁管理 正常、設備管理 異常、機房環境 正常；說明：Core Switch 風扇亮紅燈；處理方式：更換風扇');

    // 只有溫度或溼度超出也算異常
    for (const extra of [{ temperature: 27 }, { temperature: 14.9 }, { humidity: 81 }, { humidity: 39.5 }]) {
      expect(normalizeCheck({ ...BODY, ...extra }, NOW).error).toContain('請填寫異常說明');
      expect(normalizeCheck({ ...BODY, ...extra, abnormalNote: '冷氣故障' }, NOW).error).toBe('有異常，請填寫處理方式。');
    }
    // 邊界值還在範圍內
    expect(normalizeCheck({ ...BODY, temperature: 26, humidity: 80 }, NOW).value).toBeTruthy();
    expect(normalizeCheck({ ...BODY, temperature: 15, humidity: 40 }, NOW).value).toBeTruthy();
  });

  it('日期時間、溫溼度、結果不對都擋下，不寫入也不寫紀錄', async () => {
    const cases = [
      [{ ...BODY, checkDate: '2026-02-30' }, '檢查日期不正確'],
      [{ ...BODY, checkDate: '2999-01-01' }, '檢查日期不正確'],
      [{ ...BODY, checkTime: '25:00' }, '請填寫檢查時間'],
      [{ ...BODY, checkTime: '' }, '請填寫檢查時間'],
      [{ ...BODY, temperature: '' }, '請填寫機房溫度'],
      [{ ...BODY, temperature: 'abc' }, '請填寫機房溫度'],
      [{ ...BODY, temperature: 99 }, '請填寫機房溫度'],
      [{ ...BODY, humidity: 101 }, '請填寫相對溼度'],
      [{ ...BODY, results: { ...OK, ACCESS: '' } }, '請勾選「門禁管理」的檢查結果'],
      [{ ...BODY, results: undefined }, '請勾選「監視設備」的檢查結果'],
      [{ ...BODY, results: { ...OK, CCTV: 'ABNORMAL' }, abnormalNote: 'x'.repeat(MAX_TEXT + 1), abnormalAction: '處理' }, '異常說明太長'],
    ];
    for (const [body, msg] of cases) {
      const { pool, calls } = makePool();
      const res = await call(pool, 'post', '/', makeReq(USERS.filler, {}, body));
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain(msg);
      expect(writes(calls)).toHaveLength(0);
      expect(auditRows(calls)).toHaveLength(0);
    }
  });

  it('同一個月的同一周已經有紀錄：409，不寫事件紀錄', async () => {
    const { pool, calls } = makePool({ conflict: true });
    const res = await call(pool, 'post', '/', makeReq(USERS.filler, {}, { ...BODY, checkDate: '2026-11-05' }));
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('115年11月第一周已經有檢查紀錄（每週一筆），請改那一筆或換日期。');
    expect(auditRows(calls)).toHaveLength(0);

    const upd = makePool({ conflict: true });
    const res2 = await call(upd.pool, 'put', '/:id', makeReq(USERS.filler, { id: '5' }, { ...BODY, checkDate: '2026-10-30' }));
    expect(res2.statusCode).toBe(409);
    expect(res2.body.error).toBe('115年10月第五周已經有檢查紀錄（每週一筆），請改那一筆或換日期。');
    expect(auditRows(upd.calls)).toHaveLength(0);
  });

  it('這個月的紀錄：標出目前帳號能不能改；月份格式不對 400', async () => {
    const { pool, calls } = makePool();
    const res = await call(pool, 'get', '/:period', makeReq(USERS.other, { period: '2026-11' }));
    expect(calls[0].params).toEqual(['2026-11']);
    expect(res.body.rows).toEqual([expect.objectContaining({ id: 5, checkDate: '2026-11-03', checkTime: '09:15', weekNo: 1, temperature: 22, humidity: 50, createdByName: '王機房', canManage: false })]);
    expect((await call(pool, 'get', '/:period', makeReq(USERS.filler, { period: '2026-11' }))).body.rows[0].canManage).toBe(true);
    expect((await call(pool, 'get', '/:period', makeReq(USERS.admin, { period: '2026-11' }))).body.rows[0].canManage).toBe(true);
    expect((await call(pool, 'get', '/:period', makeReq(USERS.filler, { period: '2026-13' }))).statusCode).toBe(400);
  });

  it('最後一次檢查：日期、時間、填寫人；沒有紀錄是 null；/latest 排在 /:period 前面', async () => {
    const { pool } = makePool({ latest: ROW });
    expect((await call(pool, 'get', '/latest', makeReq(USERS.other))).body).toEqual({ success: true, lastDate: '2026-11-03', lastTime: '09:15', userName: '王機房' });
    const empty = makePool({ latest: null });
    expect((await call(empty.pool, 'get', '/latest', makeReq(USERS.other))).body).toEqual({ success: true, lastDate: null, lastTime: null, userName: null });
    const router = createIsoRoomCheckRoutes(pool, auth);
    const paths = router.stack.filter((l) => l.route?.methods?.get).map((l) => l.route.path);
    expect(paths.indexOf('/latest')).toBeLessThan(paths.indexOf('/:period'));
  });

  it('修改：本人可以改，填寫人不變、重新算第幾周（日期不能是未來）；事件紀錄記改前改後', async () => {
    const { pool, calls } = makePool();
    const res = await call(pool, 'put', '/:id', makeReq(USERS.filler, { id: '5' }, { ...BODY, checkDate: '2026-11-11', createdByName: '別人' }));
    expect(res.body.success).toBe(true);
    const update = writes(calls)[0];
    expect(update.sql.split('RETURNING')[0]).not.toContain('created_by');
    expect(update.params).toEqual([5, '2026-11-11', '14:30', '2026-11', 2, 22.5, 55, JSON.stringify(OK), '', '']);
    const [, , , action, module, , targetId, targetName, summary, details] = auditRows(calls)[0];
    expect([action, module, targetId, targetName]).toEqual(['UPDATE', 'ISO_FORM', 'S-408-03 #5', '機房檢查表 115/11/11']);
    expect(summary).toBe('修改機房檢查表（115/11/03 09:15，第一周 → 115/11/11 14:30，第二周，填寫人 王機房）：溫度 22.5℃、溼度 55%、監視設備 正常、門禁管理 正常、設備管理 正常、機房環境 正常');
    expect(JSON.parse(details)).toMatchObject({ before: { checkDate: '2026-11-03', weekNo: 1, temperature: 22 }, after: { checkDate: '2026-11-11', weekNo: 2, temperature: 22.5 } });
  });

  it('別人不能改、刪（403），管理員可以；找不到 404；都不寫入', async () => {
    for (const [method, path, body] of [['put', '/:id', BODY], ['delete', '/:id', {}]]) {
      const { pool, calls } = makePool();
      const res = await call(pool, method, path, makeReq(USERS.other, { id: '5' }, body));
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('只有填寫人（王機房）本人或管理員可以修改、刪除。');
      expect(writes(calls)).toHaveLength(0);
      expect(auditRows(calls)).toHaveLength(0);

      const gone = makePool({ existing: null });
      expect((await call(gone.pool, method, path, makeReq(USERS.admin, { id: '5' }, body))).statusCode).toBe(404);
    }
    expect(canManage(USERS.admin, ROW)).toBe(true);
    expect(canManage(USERS.filler, ROW)).toBe(true);
    expect(canManage(USERS.other, ROW)).toBe(false);
    expect(canManage(USERS.filler, { ...ROW, created_by: null })).toBe(false);
  });

  it('刪除：管理員可以刪別人的；事件紀錄帶原本的內容與填寫人', async () => {
    const { pool, calls } = makePool();
    const res = await call(pool, 'delete', '/:id', makeReq(USERS.admin, { id: '5' }));
    expect(res.body.success).toBe(true);
    expect(writes(calls)[0].params).toEqual([5]);
    const [userId, , , action, , , targetId, , summary, details] = auditRows(calls)[0];
    expect([userId, action, targetId]).toEqual([1, 'DELETE', 'S-408-03 #5']);
    expect(summary).toBe('刪除機房檢查表（115/11/03 09:15，第一周，填寫人 王機房）：溫度 22℃、溼度 50%、監視設備 正常、門禁管理 正常、設備管理 正常、機房環境 正常');
    expect(JSON.parse(details).before).toMatchObject({ checkDate: '2026-11-03', temperature: 22, humidity: 50 });
  });

  it('簽核用的內容雜湊：表單上的欄位一改就不同；數字 22 與 "22.0" 一樣', () => {
    const base = { check_date: '2026-11-03', check_time: '09:15', temperature: '22.0', humidity: '50.0', results: OK, abnormal_note: '', abnormal_action: '' };
    const h = roomCheckHash([base]);
    expect(roomCheckHash([{ ...base, temperature: 22, humidity: 50 }])).toBe(h);
    for (const change of [{ check_time: '09:16' }, { temperature: '22.5' }, { humidity: '51.0' }, { results: { ...OK, CCTV: 'ABNORMAL' } }, { abnormal_note: 'x' }, { abnormal_action: 'y' }]) {
      expect(roomCheckHash([{ ...base, ...change }])).not.toBe(h);
    }
    expect(roomCheckHash([])).not.toBe(h);
    expect(SIGN_CONTENT_SQL).toContain('ORDER BY check_date, check_time, id');
  });
});

describe('機房檢查表：每月線上簽核', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const CONTENT = [{ check_date: '2026-10-06', check_time: '09:00', temperature: '22.0', humidity: '50.0', results: OK, abnormal_note: '', abnormal_action: '' }];

  const makeSignPool = ({ existing = null, rows = CONTENT, sigs = [] } = {}) => {
    const calls = [];
    const query = vi.fn(async (sql, params) => {
      calls.push({ sql, params });
      if (sql === SIGN_CONTENT_SQL) return { rows };
      if (/SELECT user_id FROM iso_form_signatures/.test(sql)) return { rows: existing ? [existing] : [] };
      if (/SELECT user_name, content_hash/.test(sql)) return { rows: existing ? [existing] : [] };
      if (/SELECT signer_role, user_id/.test(sql)) return { rows: sigs };
      if (/SELECT period, signer_role/.test(sql)) return { rows: sigs };
      if (/INSERT INTO iso_form_signatures/.test(sql)) return { rows: [{ signed_at: '2026-10-31T09:00:00Z' }] };
      if (/DELETE FROM iso_form_signatures/.test(sql)) return { rows: existing ? [{ user_name: existing.user_name, signed_at: 'x' }] : [] };
      return { rows: [] };
    });
    return { pool: { query }, calls };
  };

  const signCall = async (pool, method, path, req) => {
    const router = createIsoSignatureRoutes(pool, auth, { fetchEquipmentMovements: 'SELECT moves' });
    const res = makeRes();
    await handlerFor(router, method, path)(req, res);
    return res;
  };

  it('檢查人：任何登入帳號都能簽，簽的人取自連線階段；內容雜湊用這個月的機房檢查紀錄', async () => {
    const { pool, calls } = makeSignPool();
    const res = await signCall(pool, 'post', '/:form/:period/:role', makeReq(USERS.other, { form: 'S-408-03', period: '2026-10', role: 'INSPECTOR' }, { signature: PNG }));
    expect(res.body.success).toBe(true);
    const content = calls.find((c) => c.sql === SIGN_CONTENT_SQL);
    expect(content.params).toEqual(['2026-10-01', '2026-11-01']);
    const insert = calls.find((c) => /INSERT INTO iso_form_signatures/.test(c.sql));
    expect(insert.params).toEqual(['S-408-03', '2026-10', 'INSPECTOR', 9, '張倉管', PNG, roomCheckHash(CONTENT), 1]);
    const [, , , action, module, , targetId, targetName, summary] = auditRows(calls)[0];
    expect([action, module, targetId, targetName]).toEqual(['CREATE', 'ISO_FORM', 'S-408-03 2026-10', '機房檢查表 115年10月']);
    expect(summary).toBe('簽核機房檢查表 [115年10月]：檢查人 張倉管（共 1 列）');
  });

  it('單位主管：要有權責主管的簽核權限；機房檢查表沒有「機房管理員」這個角色', async () => {
    const denied = makeSignPool();
    const r1 = await signCall(denied.pool, 'post', '/:form/:period/:role', makeReq(USERS.filler, { form: 'S-408-03', period: '2026-10', role: 'SUPERVISOR' }, { signature: PNG }));
    expect(r1.statusCode).toBe(403);
    expect(r1.body.error).toContain('沒有簽「單位主管」的權限');

    const ok = makeSignPool();
    const r2 = await signCall(ok.pool, 'post', '/:form/:period/:role', makeReq(USERS.supervisor, { form: 'S-408-03', period: '2026-10', role: 'SUPERVISOR' }, { signature: PNG }));
    expect(r2.body.success).toBe(true);
    expect(auditRows(ok.calls)[0][8]).toBe('簽核機房檢查表 [115年10月]：單位主管 李主管（共 1 列）');

    const wrong = makeSignPool();
    const r3 = await signCall(wrong.pool, 'post', '/:form/:period/:role', makeReq(USERS.admin, { form: 'S-408-03', period: '2026-10', role: 'ROOM_ADMIN' }, { signature: PNG }));
    expect(r3.statusCode).toBe(400);
    expect(r3.body.error).toBe('不支援的簽核角色。');
    // 設備攜出入單也沒有檢查人
    const r4 = await signCall(wrong.pool, 'post', '/:form/:period/:role', makeReq(USERS.filler, { form: 'S-408-02', period: '2026-10', role: 'INSPECTOR' }, { signature: PNG }));
    expect(r4.statusCode).toBe(400);
  });

  it('撤銷檢查人簽核：只有簽的人本人或管理員；單位主管照權限', async () => {
    const mine = makeSignPool({ existing: { user_id: 9, user_name: '張倉管' } });
    expect((await signCall(mine.pool, 'delete', '/:form/:period/:role', makeReq(USERS.other, { form: 'S-408-03', period: '2026-10', role: 'INSPECTOR' }))).body.success).toBe(true);
    expect(auditRows(mine.calls)[0][8]).toBe('撤銷機房檢查表 [115年10月] 的檢查人簽核（原簽核人 張倉管）');

    const notMine = makeSignPool({ existing: { user_id: 9, user_name: '張倉管' } });
    const r = await signCall(notMine.pool, 'delete', '/:form/:period/:role', makeReq(USERS.filler, { form: 'S-408-03', period: '2026-10', role: 'INSPECTOR' }));
    expect(r.statusCode).toBe(403);
    expect(r.body.error).toBe('只有簽核的人本人或管理員可以撤銷檢查人簽核。');
    expect(notMine.calls.some((c) => /DELETE FROM iso_form_signatures/.test(c.sql))).toBe(false);

    const byAdmin = makeSignPool({ existing: { user_id: 9, user_name: '張倉管' } });
    expect((await signCall(byAdmin.pool, 'delete', '/:form/:period/:role', makeReq(USERS.admin, { form: 'S-408-03', period: '2026-10', role: 'INSPECTOR' }))).body.success).toBe(true);

    expect(canSign(USERS.other, 'INSPECTOR')).toBe(true);
    expect(canSign(null, 'INSPECTOR')).toBe(false);
    expect(canSign(USERS.other, 'SUPERVISOR')).toBe(false);
    expect(canRevoke(USERS.supervisor, 'SUPERVISOR', 123)).toBe(true);
    expect(canRevoke(USERS.filler, 'SUPERVISOR', 7)).toBe(false);
  });

  it('簽核狀態：只回這張表單的角色；權限依目前帳號（檢查人簽名能不能撤銷看是誰簽的）', async () => {
    const sig = { signer_role: 'INSPECTOR', user_id: 7, user_name: '王機房', signature_png: PNG, content_hash: roomCheckHash(CONTENT), row_count: 1, signed_at: 'x' };
    const { pool } = makeSignPool({ sigs: [sig] });
    const res = await signCall(pool, 'get', '/:form/:period', makeReq(USERS.filler, { form: 'S-408-03', period: '2026-10' }));
    expect(Object.keys(res.body.signatures)).toEqual(['INSPECTOR']);
    expect(res.body.signatures.INSPECTOR).toMatchObject({ userName: '王機房', stale: false });
    expect(res.body.permissions).toEqual({ INSPECTOR: { canSign: true, canRevoke: true }, SUPERVISOR: { canSign: false, canRevoke: false } });
    const other = await signCall(pool, 'get', '/:form/:period', makeReq(USERS.other, { form: 'S-408-03', period: '2026-10' }));
    expect(other.body.permissions.INSPECTOR).toEqual({ canSign: true, canRevoke: false });
  });

  it('待簽提醒：依檢查日期分月；沒有紀錄的月份不用簽；簽核後資料有異動要重簽', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 12, 9, 0));
    try {
      const sep = { ...CONTENT[0], check_date: '2026-09-07' };
      const oct = CONTENT;
      const sigs = [
        { period: '2026-09', signer_role: 'INSPECTOR', user_name: '王機房', content_hash: roomCheckHash([sep]) },
        { period: '2026-09', signer_role: 'SUPERVISOR', user_name: '李主管', content_hash: 'old' },
      ];
      const { pool, calls } = makeSignPool({ rows: [sep, ...oct], sigs });
      const res = await signCall(pool, 'get', '/:form/pending', makeReq(USERS.other, { form: 'S-408-03' }));
      expect(calls.find((c) => c.sql === SIGN_CONTENT_SQL).params).toEqual(['2026-06-01', '2026-11-01']);
      expect(res.body.months).toEqual([
        {
          period: '2026-10', label: '115年10月', rowCount: 1,
          roles: [
            { role: 'INSPECTOR', label: '檢查人', status: 'MISSING', userName: null },
            { role: 'SUPERVISOR', label: '單位主管', status: 'MISSING', userName: null },
          ],
        },
        {
          period: '2026-09', label: '115年09月', rowCount: 1,
          roles: [
            { role: 'INSPECTOR', label: '檢查人', status: 'SIGNED', userName: '王機房' },
            { role: 'SUPERVISOR', label: '單位主管', status: 'STALE', userName: '李主管' },
          ],
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
