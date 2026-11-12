import { describe, it, expect } from 'vitest';
import fs from 'fs';
import JSZip from 'jszip';
import {
  createIsoThreatIntelRoutes, FORM_CODE as SERVER_FORM_CODE, MAX_FILE_BYTES as SERVER_MAX,
  safeFileName, decodeUpload, canRevoke, canDelete,
} from '../../server/isoThreatIntelRoutes.js';
import { FORM_CODE, MAX_FILE_BYTES } from '../utils/isoThreatIntel';
import { buildChecklistDocx, pngDataUrl, DEFAULT_ROWS } from './threatIntelFixture.js';

/**
 * ISO 27001 S-413-02 威脅情資自我檢核表的伺服器端
 *
 * - 任何登入帳號都能上傳；月份取檢核表上的檢核日期；同月份再上傳要帶 replace，替換會清掉簽核
 * - 刪除限上傳的人本人或管理員
 * - 檢核人：任何帳號都能簽、簽的人取自連線階段；一份只簽一次（有人簽了就 409）；撤銷限本人或管理員
 * - 每個動作都寫事件紀錄（ISO 表單模組）
 */
const NOW = () => new Date(2026, 10, 12, 9, 0);

const USERS = {
  uploader: { id: 3, username: 'vicky', full_name: '楊資安', role: 'IT', menu_access: {} },
  staff: { id: 7, username: 'tom', full_name: '王小明', role: 'WAREHOUSE', menu_access: {} },
  other: { id: 9, username: 'joe', full_name: '張倉管', role: 'IT', menu_access: {} },
  admin: { id: 1, username: 'METECH', full_name: '系統管理員', role: 'ADMIN', menu_access: {} },
};

/** 記憶體裡的資料庫：只認這支 API 會下的 SQL */
const makePool = ({ savedSignature = null } = {}) => {
  const db = { checklists: [], seq: 0 };
  const calls = [];
  const SIGN_NULL = { signed_by: null, signed_by_name: null, signature_png: null, signed_at: null };
  const query = async (sql, params = []) => {
    calls.push({ sql, params });
    if (/INSERT INTO system_audit_logs/.test(sql)) return { rows: [] };
    if (/FROM user_signatures/.test(sql)) return { rows: savedSignature ? [{ signature_png: savedSignature }] : [] };
    if (/INSERT INTO iso_threat_checklists/.test(sql)) {
      const row = {
        id: ++db.seq, period: params[0], check_date: params[1], file_name: params[2], file_data: params[3], file_size: params[4], file_hash: params[5],
        rows: JSON.parse(params[6]), uploaded_by: params[7], uploaded_by_name: params[8], uploaded_at: 'T0', ...SIGN_NULL, updated_at: 'T0',
      };
      db.checklists.push(row);
      return { rows: [{ ...row }] };
    }
    const byId = () => db.checklists.find((c) => c.id === params[0]);
    if (/UPDATE iso_threat_checklists SET check_date/.test(sql)) {
      const row = byId();
      Object.assign(row, { check_date: params[1], file_name: params[2], file_data: params[3], file_size: params[4], file_hash: params[5], rows: JSON.parse(params[6]), uploaded_by: params[7], uploaded_by_name: params[8], uploaded_at: 'T1', ...SIGN_NULL });
      return { rows: [{ ...row }] };
    }
    if (/UPDATE iso_threat_checklists SET signed_by = \$2/.test(sql)) {
      const row = byId();
      if (row.signed_by_name) return { rows: [], rowCount: 0 };
      Object.assign(row, { signed_by: params[1], signed_by_name: params[2], signature_png: params[3], signed_at: new Date(2026, 10, 12, 9, 30) });
      return { rows: [{ signed_at: row.signed_at }], rowCount: 1 };
    }
    if (/UPDATE iso_threat_checklists SET signed_by = NULL/.test(sql)) { Object.assign(byId(), SIGN_NULL); return { rows: [] }; }
    if (/DELETE FROM iso_threat_checklists/.test(sql)) { db.checklists = db.checklists.filter((c) => c.id !== params[0]); return { rows: [] }; }
    if (/ORDER BY period DESC LIMIT 1/.test(sql)) {
      const row = [...db.checklists].sort((a, b) => b.period.localeCompare(a.period))[0];
      return { rows: row ? [{ ...row }] : [] };
    }
    if (/WHERE period = \$1/.test(sql)) return { rows: db.checklists.filter((c) => c.period === params[0]).map((c) => ({ ...c })) };
    if (/WHERE id = \$1/.test(sql)) return { rows: db.checklists.filter((c) => c.id === params[0]).map((c) => ({ ...c })) };
    throw new Error(`沒有模擬這段 SQL：${sql.slice(0, 80)}`);
  };
  return { pool: { query }, calls, db };
};

const auth = { requireAuth: (req, res, next) => next() };
const handlerFor = (router, method, path) => {
  const layer = router.stack.find((l) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`找不到路由 ${method.toUpperCase()} ${path}`);
  return layer.route.stack.at(-1).handle;
};
const makeRes = () => ({
  statusCode: 200, body: null, headers: {},
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
  setHeader(k, v) { this.headers[k] = v; },
  send(payload) { this.body = payload; return this; },
});
const makeReq = (user, params = {}, body = {}) => ({ user, params, body, ip: '192.168.100.55', get: () => undefined });
const auditRows = (calls) => calls.filter((c) => /INSERT INTO system_audit_logs/.test(c.sql)).map((c) => c.params);

const call = async (pool, method, path, req) => {
  const router = createIsoThreatIntelRoutes(pool, auth, { now: NOW });
  const res = makeRes();
  await handlerFor(router, method, path)(req, res);
  return res;
};

const FILE = 'S-413-02威脅情資自我檢核表_115年10月.docx';
const uploadBody = async (opts = {}, fileName = FILE) => ({ fileName, fileBase64: (await buildChecklistDocx(opts)).toString('base64') });

/** 楊資安上傳一份 115/11/01 的檢核表 */
const seeded = async (opts) => {
  const ctx = makePool(opts);
  await call(ctx.pool, 'post', '/', makeReq(USERS.uploader, {}, await uploadBody()));
  ctx.calls.length = 0;
  return { ...ctx, checklist: ctx.db.checklists[0] };
};
const sign = (pool, user, id, body = { signature: pngDataUrl() }) => call(pool, 'post', '/:id/sign', makeReq(user, { id }, body));

describe('威脅情資自我檢核表 API', () => {
  it('migration 列在清單裡；伺服器有掛上路由；前後端的表單代號、檔案上限一致', () => {
    const { migrations } = JSON.parse(fs.readFileSync('database/migrations.manifest.json', 'utf8'));
    expect(migrations.find((m) => m.file === 'migration_iso_threat_intel.sql')).toMatchObject({ type: 'schema' });
    const sql = fs.readFileSync('database/migration_iso_threat_intel.sql', 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS iso_threat_checklists');
    expect(sql).toContain('period CHAR(7) NOT NULL UNIQUE');
    expect(sql).toContain('signed_by_name VARCHAR(255)');
    expect(fs.readFileSync('server.js', 'utf8')).toContain("app.use('/api/iso-threat-intel', createIsoThreatIntelRoutes(pool, auth))");
    expect([SERVER_FORM_CODE, SERVER_MAX]).toEqual([FORM_CODE, MAX_FILE_BYTES]);
  });

  it('上傳：任何帳號都能上傳；解析各列、月份取檢核日期、上傳者取自連線階段；寫一筆事件紀錄', async () => {
    const { pool, calls, db } = makePool();
    const res = await call(pool, 'post', '/', makeReq(USERS.staff, {}, { ...(await uploadBody()), uploadedByName: '別人' }));
    expect(res.statusCode).toBe(200);
    expect(res.body.checklist).toMatchObject({ period: '2026-11', checkDate: '2026-11-01', fileName: FILE, rowCount: 3, uploadedByName: '王小明', signedByName: null });
    expect(db.checklists[0].uploaded_by).toBe(7);
    expect(Buffer.isBuffer(db.checklists[0].file_data)).toBe(true);
    expect(db.checklists[0].rows.map((r) => [r.no, r.applicable, r.update])).toEqual([[1, '適用', '更新'], [2, '適用', '更新'], [3, '不適用', '不更新']]);

    const logs = auditRows(calls);
    expect(logs).toHaveLength(1);
    const [userId, userName, role, action, module, moduleLabel, targetId, targetName, summary, details, ip] = logs[0];
    expect([userId, userName, role, action, module, moduleLabel]).toEqual([7, '王小明', 'WAREHOUSE', 'CREATE', 'ISO_FORM', 'ISO 表單']);
    expect([targetId, targetName]).toEqual(['S-413-02 2026-11', '威脅情資自我檢核表 115年11月']);
    expect(summary).toBe(`上傳威脅情資自我檢核表 [115年11月]：${FILE}（檢核日期 115/11/01，共 3 列）`);
    expect(JSON.parse(details)).toMatchObject({ form: 'S-413-02', period: '2026-11', checkDate: '2026-11-01', rows: [{ no: 1, title: '【Windows 11】', applicable: '適用' }, { no: 2 }, { no: 3, applicable: '不適用' }] });
    expect(ip).toBe('192.168.100.55');
  });

  it('上傳：不是 .docx、不是檢核表、檢核日期在未來的月份、沒選檔案 → 400，什麼都不存', async () => {
    const { pool, db, calls } = makePool();
    let res = await call(pool, 'post', '/', makeReq(USERS.staff, {}, { ...(await uploadBody()), fileName: 'a.pdf' }));
    expect([res.statusCode, res.body.error]).toEqual([400, '只能上傳 Word（.docx）檔。']);
    res = await call(pool, 'post', '/', makeReq(USERS.staff, {}, { fileName: 'a.docx', fileBase64: Buffer.from('hello').toString('base64') }));
    expect(res.body.error).toContain('不是 Word（.docx）格式');
    res = await call(pool, 'post', '/', makeReq(USERS.staff, {}, await uploadBody({ rows: [{ date: '115/12/01', lines: ['x'] }] })));
    expect(res.body.error).toContain('檢核日期是 115/12/01，還沒到那個月份');
    res = await call(pool, 'post', '/', makeReq(USERS.staff, {}, { fileName: 'a.docx' }));
    expect(res.body.error).toBe('請選擇要上傳的檢核表（.docx）。');
    expect(db.checklists).toHaveLength(0);
    expect(auditRows(calls)).toHaveLength(0);
  });

  it('同月份再上傳：沒帶 replace → 409（附原檔名與檢核人）；帶 replace → 換檔並清掉簽核；事件紀錄寫清楚', async () => {
    const { pool, calls, db, checklist } = await seeded();
    await sign(pool, USERS.staff, checklist.id);
    calls.length = 0;

    const changed = [DEFAULT_ROWS[0], { lines: ['【ERP 管理系統】', 'Node.js 改成已完成'] }];
    let res = await call(pool, 'post', '/', makeReq(USERS.other, {}, await uploadBody({ rows: changed }, 'S-413-02_修正.docx')));
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ exists: true, period: '2026-11', fileName: FILE, signedByName: '王小明' });
    expect(auditRows(calls)).toHaveLength(0);

    res = await call(pool, 'post', '/', makeReq(USERS.other, {}, { ...(await uploadBody({ rows: changed }, 'S-413-02_修正.docx')), replace: true }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ clearedSignature: true, checklist: { fileName: 'S-413-02_修正.docx', rowCount: 2, uploadedByName: '張倉管', signedByName: null } });
    expect(db.checklists).toHaveLength(1);
    expect(db.checklists[0]).toMatchObject({ uploaded_by: 9, signed_by_name: null, signature_png: null });

    const logs = auditRows(calls);
    expect(logs).toHaveLength(1);
    expect([logs[0][1], logs[0][3]]).toEqual(['張倉管', 'UPDATE']);
    expect(logs[0][8]).toBe(`替換威脅情資自我檢核表 [115年11月]：${FILE} → S-413-02_修正.docx（檢核日期 115/11/01，共 2 列；原檢核人 王小明 的簽核一併清除）`);
    expect(JSON.parse(logs[0][9])).toMatchObject({ before: { fileName: FILE, uploadedByName: '楊資安', signedByName: '王小明' }, after: { fileName: 'S-413-02_修正.docx' } });
  });

  it('讀這個月：各列、檢核人、自己能不能刪除／撤銷；還沒上傳的月份回 null', async () => {
    const { pool, checklist } = await seeded();
    let res = await call(pool, 'get', '/:period', makeReq(USERS.uploader, { period: '2026-11' }));
    expect(res.body.checklist).toMatchObject({ id: checklist.id, rowCount: 3, signedByName: null, signaturePng: null, canDelete: true, canRevoke: false });
    expect(res.body.checklist.rows).toHaveLength(3);

    await sign(pool, USERS.staff, checklist.id);
    res = await call(pool, 'get', '/:period', makeReq(USERS.staff, { period: '2026-11' }));
    expect(res.body.checklist).toMatchObject({ signedByName: '王小明', canDelete: false, canRevoke: true });
    expect(res.body.checklist.signaturePng).toMatch(/^data:image\/png;base64,/);
    res = await call(pool, 'get', '/:period', makeReq(USERS.other, { period: '2026-11' }));
    expect(res.body.checklist).toMatchObject({ canDelete: false, canRevoke: false });
    res = await call(pool, 'get', '/:period', makeReq(USERS.admin, { period: '2026-11' }));
    expect(res.body.checklist).toMatchObject({ canDelete: true, canRevoke: true });

    expect((await call(pool, 'get', '/:period', makeReq(USERS.staff, { period: '2026-12' }))).body).toEqual({ success: true, checklist: null });
    expect((await call(pool, 'get', '/:period', makeReq(USERS.staff, { period: '2026-13' }))).statusCode).toBe(400);
  });

  it('簽核：任何帳號都能簽、檢核人取自連線階段；一份只簽一次，別人再簽 → 409；寫事件紀錄', async () => {
    const { pool, calls, db, checklist } = await seeded();
    const png = pngDataUrl();
    let res = await sign(pool, USERS.staff, checklist.id, { signature: png, userName: '別人' });
    expect(res.body.success).toBe(true);
    expect(db.checklists[0]).toMatchObject({ signed_by: 7, signed_by_name: '王小明', signature_png: png });

    res = await sign(pool, USERS.other, checklist.id);
    expect([res.statusCode, res.body.error]).toEqual([409, '已由 王小明 簽核；要換人簽請先撤銷。']);
    expect(db.checklists[0].signed_by_name).toBe('王小明');

    const logs = auditRows(calls);
    expect(logs).toHaveLength(1);
    expect([logs[0][0], logs[0][3], logs[0][4], logs[0][6]]).toEqual([7, 'CREATE', 'ISO_FORM', 'S-413-02 2026-11']);
    expect(logs[0][8]).toBe(`簽核威脅情資自我檢核表 [115年11月]：檢核人 王小明（${FILE}，共 3 列）`);
    expect(JSON.parse(logs[0][9])).toMatchObject({ signer: '王小明', fileName: FILE, source: '手寫／上傳' });
  });

  it('簽核：簽名格式不對、要用簽名檔卻沒設定 → 400；用簽名檔時伺服器自己讀', async () => {
    const { pool, checklist, db } = await seeded();
    expect((await sign(pool, USERS.staff, checklist.id, { signature: 'data:image/jpeg;base64,AAAA' })).body.error).toBe('簽名圖檔格式不對或太大。');
    expect((await sign(pool, USERS.staff, checklist.id, { useSaved: true })).body.error).toContain('還沒有簽名檔');
    expect(db.checklists[0].signed_by_name).toBeNull();

    const saved = pngDataUrl(600, 200, [10, 20, 30]);
    const ctx = await seeded({ savedSignature: saved });
    expect((await sign(ctx.pool, USERS.staff, ctx.checklist.id, { useSaved: true })).body.success).toBe(true);
    expect(ctx.db.checklists[0].signature_png).toBe(saved);
    expect(ctx.calls.find((c) => /FROM user_signatures/.test(c.sql)).params).toEqual([7]);
    expect(JSON.parse(auditRows(ctx.calls)[0][9]).source).toBe('簽名檔');
  });

  it('撤銷：簽的人本人或管理員；別人 403；撤銷後可以換人簽；寫事件紀錄', async () => {
    const { pool, calls, db, checklist } = await seeded();
    await sign(pool, USERS.staff, checklist.id);
    calls.length = 0;
    const revoke = (user) => call(pool, 'delete', '/:id/sign', makeReq(user, { id: checklist.id }));

    let res = await revoke(USERS.uploader);
    expect([res.statusCode, res.body.error]).toEqual([403, '只有簽核的人本人或管理員可以撤銷。']);
    res = await revoke(USERS.staff);
    expect(res.body.success).toBe(true);
    expect(db.checklists[0].signed_by_name).toBeNull();
    expect((await revoke(USERS.admin)).statusCode).toBe(404);

    await sign(pool, USERS.other, checklist.id);
    res = await revoke(USERS.admin);
    expect(res.body.success).toBe(true);

    expect(auditRows(calls).map((l) => [l[1], l[3], l[8]])).toEqual([
      ['王小明', 'DELETE', '撤銷威脅情資自我檢核表 [115年11月] 的檢核人簽核（原檢核人 王小明）'],
      ['張倉管', 'CREATE', `簽核威脅情資自我檢核表 [115年11月]：檢核人 張倉管（${FILE}，共 3 列）`],
      ['系統管理員', 'DELETE', '撤銷威脅情資自我檢核表 [115年11月] 的檢核人簽核（原檢核人 張倉管）'],
    ]);
  });

  it('刪除：上傳的人本人或管理員；別人 403；事件紀錄記下原檢核人', async () => {
    const { pool, calls, db, checklist } = await seeded();
    await sign(pool, USERS.staff, checklist.id);
    calls.length = 0;
    let res = await call(pool, 'delete', '/:id', makeReq(USERS.staff, { id: checklist.id }));
    expect([res.statusCode, res.body.error]).toEqual([403, '只有上傳的人（楊資安）本人或管理員可以刪除。']);
    res = await call(pool, 'delete', '/:id', makeReq(USERS.uploader, { id: checklist.id }));
    expect(res.body.success).toBe(true);
    expect(db.checklists).toHaveLength(0);
    const logs = auditRows(calls);
    expect(logs).toHaveLength(1);
    expect([logs[0][3], logs[0][8]]).toEqual(['DELETE', `刪除威脅情資自我檢核表 [115年11月]：${FILE}（上傳者 楊資安；原檢核人 王小明 的簽核一併清除）`]);
    expect((await call(pool, 'delete', '/:id', makeReq(USERS.admin, { id: checklist.id }))).statusCode).toBe(404);
  });

  it('最新一份（營運總覽）：月份、上傳者、檢核人；還沒有任何上傳回 null', async () => {
    const none = makePool();
    expect((await call(none.pool, 'get', '/latest', makeReq(USERS.staff))).body).toEqual({ success: true, latest: null });

    const { pool, checklist } = await seeded();
    let res = await call(pool, 'get', '/latest', makeReq(USERS.staff));
    expect(res.body.latest).toMatchObject({ period: '2026-11', uploadedByName: '楊資安', rowCount: 3, signedByName: null });
    expect(res.body.latest).not.toHaveProperty('signaturePng');
    await sign(pool, USERS.other, checklist.id);
    res = await call(pool, 'get', '/latest', makeReq(USERS.staff));
    expect(res.body.latest.signedByName).toBe('張倉管');
  });

  it('下載：簽了就把簽名與簽核日期填進 Word 檔；檔名照上傳的', async () => {
    const { pool, checklist } = await seeded();
    let res = await call(pool, 'get', '/:id/download', makeReq(USERS.other, { id: checklist.id }));
    let xml = await (await JSZip.loadAsync(res.body)).file('word/document.xml').async('string');
    expect(xml).not.toContain('<w:drawing>');

    await sign(pool, USERS.staff, checklist.id);
    res = await call(pool, 'get', '/:id/download', makeReq(USERS.other, { id: checklist.id }));
    expect(res.headers['Content-Type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(res.headers['Content-Disposition']).toContain(`filename*=UTF-8''${encodeURIComponent(FILE)}`);
    xml = await (await JSZip.loadAsync(res.body)).file('word/document.xml').async('string');
    expect((xml.match(/<w:drawing>/g) || [])).toHaveLength(1);
    expect(xml).toContain('日期：115年11月12日');
    expect((await call(pool, 'get', '/:id/download', makeReq(USERS.other, { id: 999 }))).statusCode).toBe(404);
  });

  it('小工具：檔名去掉路徑與不合法字元、一律 .docx；上傳太大擋下；刪除與撤銷權限', () => {
    expect(safeFileName('C:\\Users\\x\\S-413-02<報告>.DOCX')).toBe('S-413-02報告.docx');
    expect(safeFileName('../../etc/passwd.docx')).toBe('passwd.docx');
    expect(decodeUpload({ fileName: 'a.docx', fileBase64: Buffer.alloc(SERVER_MAX + 1).toString('base64') }).error).toBe('檔案太大（上限 3 MB）。');

    expect(canDelete(USERS.admin, { uploaded_by: 3 })).toBe(true);
    expect(canDelete(USERS.uploader, { uploaded_by: 3 })).toBe(true);
    expect(canDelete(USERS.staff, { uploaded_by: 3 })).toBe(false);
    expect(canDelete(USERS.staff, { uploaded_by: null })).toBe(false);
    expect(canRevoke(USERS.staff, { signed_by: 7, signed_by_name: '王小明' })).toBe(true);
    expect(canRevoke(USERS.other, { signed_by: 7, signed_by_name: '王小明' })).toBe(false);
    expect(canRevoke(USERS.admin, { signed_by: null, signed_by_name: null })).toBe(false);
  });
});
