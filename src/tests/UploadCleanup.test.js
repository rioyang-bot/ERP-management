import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  isSafeUploadName, findReferencedFiles, releaseFiles, scanOrphans, trashOrphans, purgeTrash, TRASH_DIR_NAME,
} from '../../server/uploadCleanup.js';
import { createUploadRoutes, formatBytes } from '../../server/uploadRoutes.js';

/**
 * 上傳檔案的清理（server/uploadCleanup.js、server/uploadRoutes.js）
 *
 * - 刪掉／換掉檔案後交回舊檔名：資料庫裡沒有任何紀錄在用才清掉
 * - 「有沒有在用」找遍所有文字與 JSON 欄位；事件紀錄寫著檔名不算
 * - 清掉是移到 uploads/_deleted/日期/，保留 30 天才真正刪除
 * - 清理工具：上傳不到 24 小時的不動、子資料夾不掃描、確認時重新檢查一次
 */
const NOW = new Date('2026-11-03T10:00:00');
const OLD = new Date('2026-10-01T10:00:00');

/** 假資料庫：{ 表: { 欄位: [值...] } }，照 LIKE ANY 的模式回傳符合的值 */
const makePool = (data) => {
  const calls = [];
  const query = vi.fn(async (sql, params) => {
    calls.push({ sql, params });
    if (/information_schema\.columns/.test(sql)) {
      return { rows: Object.entries(data).flatMap(([t, cols]) => Object.keys(cols).map((c) => ({ table_name: t, column_name: c }))) };
    }
    const m = sql.match(/SELECT "(.+?)"::text AS v FROM "(.+?)"/);
    if (!m) return { rows: [], rowCount: 1 };
    const values = data[m[2]][m[1]];
    const needles = params[0].map((p) => p.slice(1, -1).replace(/\\([\\%_])/g, '$1'));
    return { rows: values.filter((v) => needles.some((n) => String(v).includes(n))).map((v) => ({ v })) };
  });
  return { pool: { query }, calls };
};

const DB = () => ({
  asset_photos: { file_name: ['in-use-1790000000000.jpg'] },
  inbound_orders: { attachments: [JSON.stringify([{ fileName: '進貨單-1790000000001.pdf', originalName: '進貨單.pdf' }])] },
  checklist_items: { default_photo_file: ['50%_off-1790000000002.png'] },
  // 事件紀錄裡寫著刪掉的檔名是正常的，不算還在用
  system_audit_logs: { details: [JSON.stringify({ fileName: 'deleted-1790000000003.jpg' })] },
});

let dir;
const write = (name, { mtime = OLD, size = 10 } = {}) => {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.alloc(size));
  fs.utimesSync(p, mtime, mtime);
};
const exists = (...parts) => fs.existsSync(path.join(dir, ...parts));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-uploads-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('檔名檢查', () => {
  it('只接受 uploads 底下的檔名本身', () => {
    expect(isSafeUploadName('照片-1790000000000.jpg')).toBe(true);
    for (const bad of ['../server.js', 'a/b.jpg', 'a\\b.jpg', 'C:x.jpg', '.env', TRASH_DIR_NAME, '', null, 'x'.repeat(256)]) {
      expect(isSafeUploadName(bad)).toBe(false);
    }
  });
});

describe('哪些檔名還有紀錄在用', () => {
  it('找遍所有文字與 JSON 欄位（含附件 JSON、預設照片），事件紀錄不算', async () => {
    const { pool, calls } = makePool(DB());
    const refs = await findReferencedFiles(pool, [
      'in-use-1790000000000.jpg', '進貨單-1790000000001.pdf', '50%_off-1790000000002.png', 'deleted-1790000000003.jpg', 'none.jpg',
    ]);
    expect([...refs].sort()).toEqual(['50%_off-1790000000002.png', 'in-use-1790000000000.jpg', '進貨單-1790000000001.pdf'].sort());
    expect(calls.some((c) => /FROM "system_audit_logs"/.test(c.sql))).toBe(false);
    // % 與 _ 要跳脫，不然 LIKE 會當萬用字元
    expect(calls[1].params[0]).toContain('%50\\%\\_off-1790000000002.png%');
  });

  it('資料庫存的是網址編碼過的檔名也算', async () => {
    const { pool } = makePool({ outbound_requests: { signed_doc_url: [`/uploads/${encodeURIComponent('簽收單-1.pdf')}`] } });
    expect([...await findReferencedFiles(pool, ['簽收單-1.pdf'])]).toEqual(['簽收單-1.pdf']);
  });

  it('沒有檔名就不查資料庫', async () => {
    const { pool } = makePool(DB());
    expect((await findReferencedFiles(pool, [])).size).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('釋放檔案（刪掉／換掉之後）', () => {
  it('沒有紀錄在用的移到回收區，還在用的不動', async () => {
    write('old-photo-1.jpg');
    write('in-use-1790000000000.jpg');
    const { pool } = makePool(DB());
    const res = await releaseFiles(pool, dir, ['old-photo-1.jpg', 'in-use-1790000000000.jpg'], { now: NOW });
    expect(res).toEqual({ released: ['old-photo-1.jpg'], kept: ['in-use-1790000000000.jpg'] });
    expect(exists('old-photo-1.jpg')).toBe(false);
    expect(exists(TRASH_DIR_NAME, '2026-11-03', 'old-photo-1.jpg')).toBe(true);
    expect(exists('in-use-1790000000000.jpg')).toBe(true);
  });

  it('複製主項目共用的預設照片：另一個主項目還在用就保留', async () => {
    write('50%_off-1790000000002.png');
    const { pool } = makePool(DB());
    const res = await releaseFiles(pool, dir, ['50%_off-1790000000002.png'], { now: NOW });
    expect(res.released).toEqual([]);
    expect(exists('50%_off-1790000000002.png')).toBe(true);
  });

  it('帶路徑、不存在、資料夾都不動', async () => {
    write('PRJ-1/a.jpg');
    fs.writeFileSync(path.join(path.dirname(dir), 'outside.txt'), 'x');
    const { pool } = makePool(DB());
    const res = await releaseFiles(pool, dir, ['../outside.txt', 'missing.jpg', 'PRJ-1'], { now: NOW });
    expect(res.released).toEqual([]);
    expect(res.kept.sort()).toEqual(['../outside.txt', 'PRJ-1', 'missing.jpg'].sort());
    expect(fs.existsSync(path.join(path.dirname(dir), 'outside.txt'))).toBe(true);
    fs.rmSync(path.join(path.dirname(dir), 'outside.txt'));
  });

  it('回收區同一天已有同名檔案：加上時間，不蓋掉', async () => {
    write(`${TRASH_DIR_NAME}/2026-11-03/dup.jpg`);
    write('dup.jpg');
    const { pool } = makePool(DB());
    await releaseFiles(pool, dir, ['dup.jpg'], { now: NOW });
    expect(fs.readdirSync(path.join(dir, TRASH_DIR_NAME, '2026-11-03')).sort()).toEqual(['dup.jpg', `dup-${NOW.getTime()}.jpg`].sort());
  });
});

describe('清理工具：掃描', () => {
  it('列出沒有紀錄在用的檔案；24 小時內上傳的不列入；子資料夾與回收區不掃描', async () => {
    write('orphan-a.jpg', { size: 100 });
    write('orphan-b.pdf', { size: 50, mtime: new Date('2026-09-01T10:00:00') });
    write('in-use-1790000000000.jpg');
    write('just-uploaded.jpg', { mtime: new Date('2026-11-03T08:00:00') });
    write('PRJ-1/legacy.vsdx');
    write(`${TRASH_DIR_NAME}/2026-11-01/gone.jpg`, { size: 7 });
    const { pool } = makePool(DB());
    const res = await scanOrphans(pool, dir, { now: NOW });
    expect(res.scannedCount).toBe(4);
    // 舊的排前面
    expect(res.orphans.map((f) => f.name)).toEqual(['orphan-b.pdf', 'orphan-a.jpg']);
    expect(res.orphanSize).toBe(150);
    expect(res.recentCount).toBe(1);
    expect(res.folders).toEqual(['PRJ-1']);
    expect(res.trash).toEqual({ count: 1, size: 7 });
  });

  it('uploads 還沒建立：空的結果', async () => {
    const { pool } = makePool(DB());
    const res = await scanOrphans(pool, path.join(dir, 'nope'), { now: NOW });
    expect(res).toMatchObject({ scannedCount: 0, orphans: [], folders: [], trash: { count: 0, size: 0 } });
  });
});

describe('清理工具：確認清掉', () => {
  it('重新檢查一次：只清仍然沒有在用的，其他略過', async () => {
    write('orphan-a.jpg', { size: 100 });
    write('in-use-1790000000000.jpg');
    write('just-uploaded.jpg', { mtime: new Date('2026-11-03T08:00:00') });
    const { pool } = makePool(DB());
    const res = await trashOrphans(pool, dir, ['orphan-a.jpg', 'in-use-1790000000000.jpg', 'just-uploaded.jpg'], { now: NOW });
    expect(res.trashed.map((f) => f.name)).toEqual(['orphan-a.jpg']);
    expect(res.size).toBe(100);
    expect(res.skipped.sort()).toEqual(['in-use-1790000000000.jpg', 'just-uploaded.jpg'].sort());
    expect(exists('in-use-1790000000000.jpg')).toBe(true);
    expect(exists('just-uploaded.jpg')).toBe(true);
    expect(exists(TRASH_DIR_NAME, '2026-11-03', 'orphan-a.jpg')).toBe(true);
  });
});

describe('回收區保留 30 天', () => {
  it('超過 30 天的日期資料夾刪除，其餘保留', async () => {
    write(`${TRASH_DIR_NAME}/2026-10-03/a.jpg`);
    write(`${TRASH_DIR_NAME}/2026-10-04/b.jpg`);
    write(`${TRASH_DIR_NAME}/2026-11-02/c.jpg`);
    write(`${TRASH_DIR_NAME}/keep-me/d.jpg`);
    expect(await purgeTrash(dir, { now: NOW })).toEqual(['2026-10-03']);
    expect(exists(TRASH_DIR_NAME, '2026-10-03')).toBe(false);
    expect(exists(TRASH_DIR_NAME, '2026-10-04', 'b.jpg')).toBe(true);
    expect(exists(TRASH_DIR_NAME, '2026-11-02', 'c.jpg')).toBe(true);
    // 不是自己建的資料夾不動
    expect(exists(TRASH_DIR_NAME, 'keep-me', 'd.jpg')).toBe(true);
  });

  it('還沒有回收區：什麼都不做', async () => {
    expect(await purgeTrash(dir, { now: NOW })).toEqual([]);
  });
});

describe('/api/uploads 路由', () => {
  const auth = {
    requireAuth: vi.fn((req, res, next) => next()),
    requireRole: vi.fn(() => function requireAdmin(req, res, next) { next(); }),
  };
  const routeOf = (router, method, p) => router.stack.find((l) => l.route?.path === p && l.route.methods[method]).route;
  const makeRes = () => ({
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  });
  const ADMIN = { id: 1, username: 'METECH', full_name: '系統管理員', role: 'ADMIN' };
  const callRoute = async (pool, method, p, body) => {
    const route = routeOf(createUploadRoutes(pool, auth, dir), method, p);
    const res = makeRes();
    await route.stack.at(-1).handle({ user: ADMIN, body, ip: '192.168.100.55', get: () => undefined }, res);
    return { res, route };
  };

  it('清理工具兩支都限管理員；釋放只要登入（伺服器自己確認沒在用）', () => {
    const router = createUploadRoutes(makePool(DB()).pool, auth, dir);
    const names = (r) => r.stack.map((l) => l.name);
    expect(names(routeOf(router, 'get', '/orphans'))).toContain('requireAdmin');
    expect(names(routeOf(router, 'post', '/orphans/delete'))).toContain('requireAdmin');
    expect(names(routeOf(router, 'post', '/release'))).not.toContain('requireAdmin');
    expect(auth.requireRole).toHaveBeenCalledWith('ADMIN');
  });

  it('釋放：沒有指定檔案回 400', async () => {
    const { res } = await callRoute(makePool(DB()).pool, 'post', '/release', { files: [] });
    expect(res.statusCode).toBe(400);
    const r2 = await callRoute(makePool(DB()).pool, 'post', '/release', { files: [1] });
    expect(r2.res.statusCode).toBe(400);
  });

  it('釋放：回傳清掉與保留的檔名', async () => {
    write('old.jpg');
    const { res } = await callRoute(makePool(DB()).pool, 'post', '/release', { files: ['old.jpg'] });
    expect(res.body).toEqual({ success: true, released: ['old.jpg'], kept: [] });
  });

  it('掃描：附上回收區保留天數', async () => {
    write('orphan-a.jpg');
    const { res } = await callRoute(makePool(DB()).pool, 'get', '/orphans');
    expect(res.body).toMatchObject({ success: true, trashKeepDays: 30 });
    expect(res.body.orphans.map((f) => f.name)).toEqual(['orphan-a.jpg']);
  });

  it('確認清掉：寫一筆事件紀錄（系統維護、件數、大小、檔名）', async () => {
    write('orphan-a.jpg', { size: 2048 });
    write('in-use-1790000000000.jpg');
    const { pool, calls } = makePool({ ...DB(), system_audit_logs: { details: [] } });
    const { res } = await callRoute(pool, 'post', '/orphans/delete', { files: ['orphan-a.jpg', 'in-use-1790000000000.jpg'] });
    expect(res.body).toMatchObject({ success: true, size: 2048, skipped: ['in-use-1790000000000.jpg'] });
    const log = calls.find((c) => /INSERT INTO system_audit_logs/.test(c.sql));
    expect(log.params.slice(0, 8)).toEqual([
      1, '系統管理員', 'ADMIN', 'DELETE', 'SYSTEM_SETTINGS', '系統維護', 'UPLOADS', '上傳檔案',
    ]);
    expect(log.params[8]).toBe('清理沒有使用的上傳檔案 1 個（2.0 KB），移到回收區保留 30 天');
    expect(JSON.parse(log.params[9])).toEqual({ count: 1, size: 2048, files: ['orphan-a.jpg'], skipped: ['in-use-1790000000000.jpg'] });
    expect(log.params[10]).toBe('192.168.100.55');
  });

  it('一個都沒清掉就不寫事件紀錄', async () => {
    write('in-use-1790000000000.jpg');
    const { pool, calls } = makePool(DB());
    await callRoute(pool, 'post', '/orphans/delete', { files: ['in-use-1790000000000.jpg'] });
    expect(calls.some((c) => /INSERT INTO system_audit_logs/.test(c.sql))).toBe(false);
  });

  it('大小的寫法', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
