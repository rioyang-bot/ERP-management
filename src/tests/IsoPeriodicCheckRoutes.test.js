import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import {
  createIsoPeriodicCheckRoutes, FORMS as SERVER_FORMS, normalizeResults, validDate, describeResults, canManage,
} from '../../server/isoPeriodicCheckRoutes.js';
import { ISO_CHECK_FORMS, ISO_CHECK_FORM_CODES } from '../utils/isoPeriodicCheck';

/**
 * ISO 27001 定期檢查紀錄的伺服器端（S-409-01 備份檢查紀錄表、S-409-02 日誌審查紀錄表）
 *
 * - 檢查人員取自連線階段，用戶端送來的檢查人員一律不理
 * - 每個項目都要勾正常或異常，異常要寫說明；備份檢查勾正常要填最後備份日；日期不能是未來
 * - 只有檢查人員本人或管理員能改、刪；修改不換檢查人員
 * - 新增、修改、刪除都寫事件紀錄（ISO 表單模組）
 */
const LOG_NORMAL = [{ key: 'FIREWALL', status: 'NORMAL', note: '' }, { key: 'CORE_SWITCH', status: 'NORMAL', note: '' }];
const LOG_ABNORMAL = [{ key: 'FIREWALL', status: 'NORMAL', note: '不該留下' }, { key: 'CORE_SWITCH', status: 'ABNORMAL', note: '  Port 12 flapping  ' }];
const BACKUP = [
  { key: 'FIREWALL', status: 'NORMAL', note: 'x', lastBackup: ' 115/11/01 ' },
  { key: 'CORE_SWITCH', status: 'ABNORMAL', note: '備份失敗：TFTP 逾時', lastBackup: '不該留下' },
];

const EXISTING = { id: 5, form_code: 'S-409-02', check_date: '2026-10-28', results: LOG_NORMAL, reviewer_id: 7, reviewer_name: '王機房', created_at: '2026-10-28T02:00:00Z', updated_at: '2026-10-28T02:00:00Z' };

const makePool = ({ existing = EXISTING, latest = [] } = {}) => {
  const calls = [];
  const query = vi.fn(async (sql, params) => {
    calls.push({ sql, params });
    if (/INSERT INTO iso_periodic_checks/.test(sql)) {
      return { rows: [{ id: 9, form_code: params[0], check_date: params[1], results: JSON.parse(params[2]), reviewer_id: params[3], reviewer_name: params[4] }] };
    }
    if (/UPDATE iso_periodic_checks/.test(sql)) return { rows: [{ ...existing, check_date: params[1], results: JSON.parse(params[2]) }] };
    if (/DELETE FROM iso_periodic_checks/.test(sql)) return { rows: existing ? [{ id: existing.id }] : [] };
    if (/DISTINCT ON \(form_code\)/.test(sql)) return { rows: latest };
    if (/WHERE id = \$1 AND form_code = \$2/.test(sql)) return { rows: existing && existing.form_code === params[1] ? [existing] : [] };
    if (/FROM iso_periodic_checks WHERE form_code = \$1/.test(sql)) return { rows: existing && existing.form_code === params[0] ? [existing] : [] };
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
  reviewer: { id: 7, username: 'tom', full_name: '王機房', role: 'IT' },
  other: { id: 9, username: 'joe', full_name: '張倉管', role: 'WAREHOUSE' },
  admin: { id: 1, username: 'METECH', full_name: '系統管理員', role: 'ADMIN' },
};

const makeReq = (user, params = {}, body = {}) => ({ user, params, body, ip: '192.168.100.55', get: () => undefined });
const auditRows = (calls) => calls.filter((c) => /INSERT INTO system_audit_logs/.test(c.sql)).map((c) => c.params);
const writes = (calls) => calls.filter((c) => /INSERT INTO iso_periodic_checks|UPDATE iso_periodic_checks|DELETE FROM iso_periodic_checks/.test(c.sql));

const call = async (pool, method, path, req) => {
  const router = createIsoPeriodicCheckRoutes(pool, auth);
  const res = makeRes();
  await handlerFor(router, method, path)(req, res);
  return res;
};

describe('ISO 定期檢查 API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('資料表的 migration 列在清單裡；伺服器有掛上路由；前後端表單定義一致', () => {
    const { migrations } = JSON.parse(fs.readFileSync('database/migrations.manifest.json', 'utf8'));
    expect(migrations.find((m) => m.file === 'migration_iso_periodic_checks.sql')).toMatchObject({ type: 'schema' });
    const sql = fs.readFileSync('database/migration_iso_periodic_checks.sql', 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS iso_periodic_checks');
    expect(sql).toContain('form_code VARCHAR(20) NOT NULL');
    expect(sql).toContain('reviewer_name VARCHAR(255) NOT NULL');
    const server = fs.readFileSync('server.js', 'utf8');
    expect(server).toContain("app.use('/api/iso-checks', createIsoPeriodicCheckRoutes(pool, auth))");

    expect(Object.keys(SERVER_FORMS).sort()).toEqual([...ISO_CHECK_FORM_CODES].sort());
    for (const code of ISO_CHECK_FORM_CODES) {
      const s = SERVER_FORMS[code];
      const c = ISO_CHECK_FORMS[code];
      expect([s.label, s.verb, s.lastBackup]).toEqual([c.docName, c.verb, c.lastBackup]);
      expect(s.items.map(({ key, label }) => ({ key, label }))).toEqual(c.items.map(({ key, label }) => ({ key, label })));
    }
  });

  it('日誌審查：新增時審查人員取自連線階段，用戶端送的不理；寫一筆事件紀錄', async () => {
    const { pool, calls } = makePool();
    const res = await call(pool, 'post', '/:form', makeReq(USERS.reviewer, { form: 'S-409-02' }, {
      checkDate: '2026-11-10', results: LOG_ABNORMAL, reviewerName: '別人', reviewerId: 99,
    }));
    expect(res.statusCode).toBe(200);
    const insert = writes(calls)[0];
    expect(insert.params[0]).toBe('S-409-02');
    expect(insert.params[1]).toBe('2026-11-10');
    // 正常的說明清掉、異常的說明去頭尾空白；日誌審查沒有最後備份日
    expect(JSON.parse(insert.params[2])).toEqual([
      { key: 'FIREWALL', status: 'NORMAL', note: '' },
      { key: 'CORE_SWITCH', status: 'ABNORMAL', note: 'Port 12 flapping' },
    ]);
    expect(insert.params.slice(3)).toEqual([7, '王機房']);
    expect(res.body.row).toMatchObject({ id: 9, formCode: 'S-409-02', checkDate: '2026-11-10', reviewerName: '王機房', canManage: true });

    const logs = auditRows(calls);
    expect(logs).toHaveLength(1);
    const [userId, userName, role, action, module, moduleLabel, targetId, targetName, summary, details, ip] = logs[0];
    expect([userId, userName, role, action, module, moduleLabel]).toEqual([7, '王機房', 'IT', 'CREATE', 'ISO_FORM', 'ISO 表單']);
    expect(targetId).toBe('S-409-02 #9');
    expect(targetName).toBe('日誌審查紀錄表 115/11/10');
    expect(summary).toBe('新增日誌審查紀錄表（115/11/10）：防火牆 正常、Core Switch 異常（Port 12 flapping）');
    expect(JSON.parse(details)).toMatchObject({ form: 'S-409-02', id: 9, checkDate: '2026-11-10', reviewer: '王機房' });
    expect(ip).toBe('192.168.100.55');
  });

  it('備份檢查：正常要填最後備份日，異常的不留最後備份日；事件紀錄帶最後備份日', async () => {
    const { pool, calls } = makePool();
    const res = await call(pool, 'post', '/:form', makeReq(USERS.reviewer, { form: 'S-409-01' }, { checkDate: '2026-11-10', results: BACKUP }));
    expect(res.body.success).toBe(true);
    expect(JSON.parse(writes(calls)[0].params[2])).toEqual([
      { key: 'FIREWALL', status: 'NORMAL', note: '', lastBackup: '115/11/01' },
      { key: 'CORE_SWITCH', status: 'ABNORMAL', note: '備份失敗：TFTP 逾時', lastBackup: '' },
    ]);
    const [, , , , , , targetId, targetName, summary] = auditRows(calls)[0];
    expect([targetId, targetName]).toEqual(['S-409-01 #9', '備份檢查紀錄表 115/11/10']);
    expect(summary).toBe('新增備份檢查紀錄表（115/11/10）：防火牆 正常（最後備份日 115/11/01）、Core Switch 異常（備份失敗：TFTP 逾時）');

    const missing = makePool();
    const bad = await call(missing.pool, 'post', '/:form', makeReq(USERS.reviewer, { form: 'S-409-01' }, {
      checkDate: '2026-11-10', results: [{ key: 'FIREWALL', status: 'NORMAL', lastBackup: '  ' }, BACKUP[1]],
    }));
    expect(bad.statusCode).toBe(400);
    expect(bad.body.error).toBe('「防火牆」勾了正常，請填寫最後備份日。');
    expect(writes(missing.calls)).toHaveLength(0);
  });

  it('沒勾結果、異常沒寫說明、日期不對、表單不存在都擋下，不寫入也不寫紀錄', async () => {
    const cases = [
      ['S-409-02', { checkDate: '2026-11-10', results: [LOG_NORMAL[0]] }, '請勾選「Core Switch」的審查結果'],
      ['S-409-01', { checkDate: '2026-11-10', results: [] }, '請勾選「防火牆」的檢查結果'],
      ['S-409-02', { checkDate: '2026-11-10', results: [LOG_NORMAL[0], { key: 'CORE_SWITCH', status: 'ABNORMAL', note: '  ' }] }, '「Core Switch」勾了異常，請填寫異常說明'],
      ['S-409-02', { checkDate: '2026-02-30', results: LOG_NORMAL }, '審查日期不正確'],
      ['S-409-01', { checkDate: '2999-01-01', results: BACKUP }, '檢查日期不正確'],
      ['S-409-02', { results: LOG_NORMAL }, '審查日期不正確'],
      ['S-408-02', { checkDate: '2026-11-10', results: LOG_NORMAL }, '不支援的表單'],
      ['toString', { checkDate: '2026-11-10', results: LOG_NORMAL }, '不支援的表單'],
    ];
    for (const [form, body, msg] of cases) {
      const { pool, calls } = makePool();
      const res = await call(pool, 'post', '/:form', makeReq(USERS.reviewer, { form }, body));
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain(msg);
      expect(writes(calls)).toHaveLength(0);
      expect(auditRows(calls)).toHaveLength(0);
    }
  });

  it('列表：只列這張表的，標出目前帳號能不能改', async () => {
    const { pool, calls } = makePool();
    const list = await call(pool, 'get', '/:form', makeReq(USERS.other, { form: 'S-409-02' }));
    expect(calls[0].params).toEqual(['S-409-02']);
    expect(list.body.rows).toEqual([expect.objectContaining({ id: 5, checkDate: '2026-10-28', reviewerName: '王機房', canManage: false })]);
    const mine = await call(pool, 'get', '/:form', makeReq(USERS.reviewer, { form: 'S-409-02' }));
    expect(mine.body.rows[0].canManage).toBe(true);
  });

  it('最後一次：每張表各一筆，沒做過的是 null', async () => {
    const { pool } = makePool({ latest: [{ form_code: 'S-409-02', check_date: '2026-10-28', reviewer_name: '王機房' }] });
    const res = await call(pool, 'get', '/latest', makeReq(USERS.other));
    expect(res.body).toEqual({
      success: true,
      forms: {
        'S-409-01': { lastDate: null, reviewerName: null },
        'S-409-02': { lastDate: '2026-10-28', reviewerName: '王機房' },
      },
    });
    // /latest 要排在 /:form 前面，否則會被當成表單代號
    const router = createIsoPeriodicCheckRoutes(pool, auth);
    const paths = router.stack.filter((l) => l.route?.methods?.get).map((l) => l.route.path);
    expect(paths.indexOf('/latest')).toBeLessThan(paths.indexOf('/:form'));
  });

  it('修改：本人可以改，審查人員不變；事件紀錄記改前改後', async () => {
    const { pool, calls } = makePool();
    const res = await call(pool, 'put', '/:form/:id', makeReq(USERS.reviewer, { form: 'S-409-02', id: '5' }, { checkDate: '2026-10-29', results: LOG_ABNORMAL, reviewerName: '別人' }));
    expect(res.body.success).toBe(true);
    const update = writes(calls)[0];
    expect(update.sql.split('RETURNING')[0]).not.toContain('reviewer');
    expect(update.params).not.toContain('別人');
    expect(update.params[0]).toBe(5);
    const [, , , action, module, , targetId, , summary, details] = auditRows(calls)[0];
    expect([action, module, targetId]).toEqual(['UPDATE', 'ISO_FORM', 'S-409-02 #5']);
    expect(summary).toBe('修改日誌審查紀錄表（115/10/28 → 115/10/29，審查人員 王機房）：防火牆 正常、Core Switch 異常（Port 12 flapping）');
    const d = JSON.parse(details);
    expect(d.before).toEqual({ checkDate: '2026-10-28', results: LOG_NORMAL });
    expect(d.after.checkDate).toBe('2026-10-29');
  });

  it('修改、刪除：不是本人也不是管理員就擋下；別張表的編號找不到', async () => {
    for (const [method, path, body] of [['put', '/:form/:id', { checkDate: '2026-10-29', results: LOG_NORMAL }], ['delete', '/:form/:id', {}]]) {
      const { pool, calls } = makePool();
      const res = await call(pool, method, path, makeReq(USERS.other, { form: 'S-409-02', id: '5' }, body));
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('審查人員（王機房）');
      expect(writes(calls)).toHaveLength(0);
      expect(auditRows(calls)).toHaveLength(0);
    }
    const { pool } = makePool();
    const wrongForm = await call(pool, 'delete', '/:form/:id', makeReq(USERS.admin, { form: 'S-409-01', id: '5' }));
    expect(wrongForm.statusCode).toBe(404);
  });

  it('刪除：管理員可以刪別人的，事件紀錄記下原本的內容', async () => {
    const { pool, calls } = makePool();
    const res = await call(pool, 'delete', '/:form/:id', makeReq(USERS.admin, { form: 'S-409-02', id: '5' }));
    expect(res.body.success).toBe(true);
    const [userId, , , action, , , targetId, targetName, summary, details] = auditRows(calls)[0];
    expect([userId, action, targetId, targetName]).toEqual([1, 'DELETE', 'S-409-02 #5', '日誌審查紀錄表 115/10/28']);
    expect(summary).toBe('刪除日誌審查紀錄表（115/10/28，審查人員 王機房）：防火牆 正常、Core Switch 正常');
    expect(JSON.parse(details)).toMatchObject({ checkDate: '2026-10-28', reviewer: '王機房', results: LOG_NORMAL });
  });

  it('檢查函式', () => {
    const now = new Date(2026, 10, 11, 9);
    expect(validDate('2026-11-11', now)).toBe(true);
    expect(validDate('2026-11-12', now)).toBe(true); // 伺服器時區差一天，放寬一天
    expect(validDate('2026-11-13', now)).toBe(false);
    expect(validDate('2026-13-01', now)).toBe(false);
    const log = SERVER_FORMS['S-409-02'];
    expect(normalizeResults(log, 'x').error).toContain('防火牆');
    expect(normalizeResults(log, [LOG_NORMAL[0], { key: 'CORE_SWITCH', status: 'ABNORMAL', note: 'x'.repeat(501) }]).error).toContain('太長');
    expect(describeResults(log, [])).toBe('防火牆 未填、Core Switch 未填');
    expect(canManage(USERS.admin, EXISTING)).toBe(true);
    expect(canManage(USERS.reviewer, { ...EXISTING, reviewer_id: null })).toBe(false);
  });
});
