// ============================================================================
// 上傳檔案的清理
// ----------------------------------------------------------------------------
// 刪掉照片、換掉簽收單、移除附件時，資料庫的紀錄沒了，uploads 裡的檔案卻還在，
// 用久了就一直佔著磁碟。這裡負責兩件事：
//   1. 釋放：畫面上刪掉／換掉檔案後，把舊檔名交給伺服器（POST /api/uploads/release）。
//   2. 清理工具：系統管理裡掃描 uploads，列出已經沒有任何紀錄在用的檔案，確認後清掉。
//
// 「有沒有在用」不靠一份寫死的欄位清單：檔名散在照片、預設照片、簽收單、
// 進貨單與採購單附件（JSON）⋯，以後再多一種也容易漏。所以每次都把資料庫裡
// 所有文字與 JSON 欄位找一遍，只要哪裡還寫著這個檔名就不動它。
// 事件紀錄、連線階段、migration 紀錄不算（紀錄裡寫著刪掉的檔名是正常的）。
// 判斷有疑慮時一律保留：檔名被別的字串包含，也當作還在用。
//
// 清掉不是直接刪除：先移到 uploads/_deleted/日期/，保留 30 天再真正刪除，
// 萬一誤判還找得回來。上傳不到 24 小時的檔案清理工具不動：
// 可能是剛上傳、單據還沒按儲存（例如新增進貨單時先傳附件）。
// 子資料夾裡的舊檔（早期依專案分資料夾存放）不掃描。
// ============================================================================

import fs from 'fs/promises';
import path from 'path';

export const TRASH_DIR_NAME = '_deleted';
export const TRASH_KEEP_DAYS = 30;
export const ORPHAN_GRACE_HOURS = 24;
/** 一次釋放／清理的檔案數上限 */
export const MAX_FILES_PER_REQUEST = 500;

// 這幾張表寫著檔名不代表檔案還在用
const SKIP_TABLES = new Set(['system_audit_logs', 'user_sessions', 'schema_migrations']);

const COLUMNS_SQL = `
  SELECT c.table_name, c.column_name
  FROM information_schema.columns c
  JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    AND c.data_type IN ('text', 'character varying', 'character', 'jsonb', 'json')
  ORDER BY c.table_name, c.column_name`;

const quoteIdent = (s) => `"${String(s).replace(/"/g, '""')}"`;
const likeEscape = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** 只接受 uploads 底下的檔名本身：不能帶路徑、不能是回收區或隱藏檔 */
export const isSafeUploadName = (name) => typeof name === 'string'
  && name.length > 0 && name.length <= 255
  && path.basename(name) === name
  && !/[\\/:\0]/.test(name)
  && !name.startsWith('.')
  && name !== TRASH_DIR_NAME;

/**
 * 這些檔名哪些還有紀錄在用
 * @param {import('pg').Pool} pool
 * @param {string[]} names
 * @returns {Promise<Set<string>>}
 */
export async function findReferencedFiles(pool, names) {
  const referenced = new Set();
  const unique = [...new Set(names)];
  if (unique.length === 0) return referenced;
  // 資料庫裡可能存原檔名，也可能存網址編碼過的
  const needles = unique.map((name) => ({ name, forms: [...new Set([name, encodeURIComponent(name)])] }));
  const patterns = [...new Set(needles.flatMap((n) => n.forms))].map((f) => `%${likeEscape(f)}%`);

  const { rows: columns } = await pool.query(COLUMNS_SQL);
  for (const { table_name: table, column_name: column } of columns) {
    if (SKIP_TABLES.has(table)) continue;
    const col = `${quoteIdent(column)}::text`;
    const { rows } = await pool.query(
      `SELECT ${col} AS v FROM ${quoteIdent(table)} WHERE ${col} LIKE ANY($1::text[])`,
      [patterns]
    );
    for (const { v } of rows) {
      for (const n of needles) {
        if (!referenced.has(n.name) && n.forms.some((f) => String(v).includes(f))) referenced.add(n.name);
      }
    }
    if (referenced.size === unique.length) break;
  }
  return referenced;
}

/** uploads 第一層的檔案（不含子資料夾與回收區） */
export async function listUploadFiles(uploadsDir) {
  let entries;
  try {
    entries = await fs.readdir(uploadsDir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return { files: [], folders: [] };
    throw e;
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isSafeUploadName(entry.name)) continue;
    const stat = await fs.stat(path.join(uploadsDir, entry.name));
    files.push({ name: entry.name, size: stat.size, modifiedAt: stat.mtime });
  }
  const folders = entries.filter((e) => e.isDirectory() && e.name !== TRASH_DIR_NAME).map((e) => e.name);
  return { files, folders };
}

/** 回收區目前有多少檔案、多大 */
export async function trashUsage(uploadsDir) {
  const root = path.join(uploadsDir, TRASH_DIR_NAME);
  let count = 0;
  let size = 0;
  let days;
  try {
    days = await fs.readdir(root, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return { count, size };
    throw e;
  }
  for (const day of days.filter((d) => d.isDirectory())) {
    for (const f of await fs.readdir(path.join(root, day.name), { withFileTypes: true })) {
      if (!f.isFile()) continue;
      count += 1;
      size += (await fs.stat(path.join(root, day.name, f.name))).size;
    }
  }
  return { count, size };
}

const dayKey = (now) => {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** 移到回收區 uploads/_deleted/日期/；同名的加上時間，不蓋掉 */
export async function moveToTrash(uploadsDir, name, now = new Date()) {
  const dir = path.join(uploadsDir, TRASH_DIR_NAME, dayKey(now));
  await fs.mkdir(dir, { recursive: true });
  let target = path.join(dir, name);
  try {
    await fs.access(target);
    const ext = path.extname(name);
    target = path.join(dir, `${path.basename(name, ext)}-${new Date(now).getTime()}${ext}`);
  } catch { /* 沒有同名的 */ }
  await fs.rename(path.join(uploadsDir, name), target);
}

/** 是 uploads 第一層的一般檔案 */
const isUploadFile = async (uploadsDir, name) => {
  try {
    return (await fs.lstat(path.join(uploadsDir, name))).isFile();
  } catch {
    return false;
  }
};

/**
 * 釋放不再使用的檔案：沒有任何紀錄在用的才移到回收區，其餘不動
 * @returns {Promise<{ released: string[], kept: string[] }>}
 */
export async function releaseFiles(pool, uploadsDir, names, { now = new Date() } = {}) {
  const candidates = [];
  const kept = [];
  for (const name of [...new Set(names)]) {
    if (isSafeUploadName(name) && await isUploadFile(uploadsDir, name)) candidates.push(name);
    else kept.push(name);
  }
  const referenced = await findReferencedFiles(pool, candidates);
  const released = [];
  for (const name of candidates) {
    if (referenced.has(name)) { kept.push(name); continue; }
    // 同一個檔案可能剛被別的請求移走了，移不動就當作保留，不讓整批失敗
    try {
      await moveToTrash(uploadsDir, name, now);
      released.push(name);
    } catch {
      kept.push(name);
    }
  }
  return { released, kept };
}

/**
 * 掃描沒有紀錄在用的檔案（上傳不到 24 小時的不算）
 */
export async function scanOrphans(pool, uploadsDir, { now = new Date(), graceHours = ORPHAN_GRACE_HOURS } = {}) {
  const { files, folders } = await listUploadFiles(uploadsDir);
  const cutoff = new Date(now).getTime() - graceHours * 3600 * 1000;
  const old = files.filter((f) => f.modifiedAt.getTime() <= cutoff);
  const referenced = await findReferencedFiles(pool, old.map((f) => f.name));
  const orphans = old.filter((f) => !referenced.has(f.name))
    .sort((a, b) => a.modifiedAt - b.modifiedAt)
    .map((f) => ({ name: f.name, size: f.size, modifiedAt: f.modifiedAt.toISOString() }));
  return {
    scannedCount: files.length,
    orphans,
    orphanSize: orphans.reduce((s, f) => s + f.size, 0),
    recentCount: files.length - old.length,
    folders,
    trash: await trashUsage(uploadsDir),
  };
}

/**
 * 清理工具確認後清掉：重新掃描一次，仍然沒有紀錄在用的才移到回收區
 * （掃描到按下確認之間，可能有人又用到了這個檔案）
 */
export async function trashOrphans(pool, uploadsDir, names, { now = new Date(), graceHours = ORPHAN_GRACE_HOURS } = {}) {
  const { orphans } = await scanOrphans(pool, uploadsDir, { now, graceHours });
  const byName = new Map(orphans.map((f) => [f.name, f]));
  const trashed = [];
  const skipped = [];
  for (const name of [...new Set(names)]) {
    const f = byName.get(name);
    if (!f) { skipped.push(name); continue; }
    try {
      await moveToTrash(uploadsDir, name, now);
      trashed.push(f);
    } catch {
      skipped.push(name);
    }
  }
  return { trashed, skipped, size: trashed.reduce((s, f) => s + f.size, 0) };
}

/** 回收區超過保留天數的整天資料夾真正刪除 */
export async function purgeTrash(uploadsDir, { now = new Date(), keepDays = TRASH_KEEP_DAYS } = {}) {
  const root = path.join(uploadsDir, TRASH_DIR_NAME);
  let days;
  try {
    days = await fs.readdir(root, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const oldest = dayKey(new Date(new Date(now).getTime() - keepDays * 24 * 3600 * 1000));
  const purged = [];
  for (const d of days) {
    // 只認得自己建的日期資料夾；字串比較即日期先後
    if (!d.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(d.name) || d.name >= oldest) continue;
    await fs.rm(path.join(root, d.name), { recursive: true, force: true });
    purged.push(d.name);
  }
  return purged;
}
