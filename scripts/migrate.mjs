#!/usr/bin/env node
// ============================================================================
// 資料庫變更腳本執行器
// ----------------------------------------------------------------------------
// 取代原本寫死在 deploy.ps1 的做法。原做法的問題：
//   1. 每次部署都重跑所有腳本，一次性的資料修正會被反覆執行
//   2. 使用 `cat X.sql | psql`，失敗只印訊息就繼續，且最終的離開代碼
//      取自最後一道指令（systemctl reload nginx），失敗完全看不出來
//   3. 沒有任何地方記錄哪些已套用，導致 migration 漏套而不自知
//
// 本執行器：
//   - 只執行 database/migrations.manifest.json 中列出的檔案（絕不掃描目錄，
//     因為 database/ 內含 delete_all_*.sql 這類破壞性腳本）
//   - 每支腳本包在交易中執行，失敗即回滾並以非零代碼結束
//   - 成功套用的紀錄寫入 schema_migrations，之後不再重複執行
//   - 以檔案雜湊偵測已套用腳本遭到竄改
//
// 用法：
//   npm run migrate           套用所有尚未執行的腳本
//   npm run migrate:status    只列出狀態，不做任何變更
//   npm run migrate:baseline  將目前清單全部標記為已套用（不實際執行）
//                             僅用於「已知資料庫已是最新」的既有環境
//   npm run migrate -- --mark <檔名>
//                             將單一腳本標記為已套用（不實際執行），
//                             用於已在資料庫外手動套用過的情形
// ============================================================================

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, '..', 'database');
const MANIFEST = path.join(DB_DIR, 'migrations.manifest.json');

const args = process.argv.slice(2);
const markIdx = args.indexOf('--mark');
const MARK_FILE = markIdx >= 0 ? args[markIdx + 1] : null;
const MODE = args.includes('--status') ? 'status'
  : args.includes('--baseline') ? 'baseline'
    : MARK_FILE ? 'mark'
      : 'apply';

const required = ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`錯誤：缺少環境變數 ${missing.join(', ')}。請確認 .env 已正確設定。`);
  process.exit(1);
}

const pool = new pg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * 移除腳本中「頂層」的 BEGIN; 與 COMMIT;，交易一律改由本執行器控制。
 *
 * 清單中的腳本寫法不一：有些自帶 BEGIN/COMMIT，有些沒有。若直接把自帶交易的
 * 腳本放進外層交易執行，PostgreSQL 會忽略巢狀的 BEGIN，而腳本內的 COMMIT 會
 * 提早結束外層交易 —— 後續寫入 schema_migrations 的紀錄就失去保護，可能出現
 * 「腳本已套用但沒有紀錄」而下次重複執行的情況。
 *
 * $$ ... $$ 區塊（PL/pgSQL 的 DO 或函式主體）內的 BEGIN/END 屬於語法的一部分，
 * 必須原樣保留，因此先把這些區塊切開再處理。
 */
const stripTopLevelTransaction = (sql) => {
  // 以 dollar-quoted 區塊切分；捕捉群組使區塊本身留在結果陣列的奇數索引
  const parts = sql.split(/(\$[A-Za-z_]*\$[\s\S]*?\$[A-Za-z_]*\$)/g);
  return parts
    .map((part, i) => (i % 2 === 1
      ? part // dollar-quoted 區塊，原樣保留
      : part.replace(/^[ \t]*(BEGIN|COMMIT)[ \t]*;[ \t]*$/gim, '')))
    .join('');
};

const loadManifest = () => {
  if (!fs.existsSync(MANIFEST)) {
    throw new Error(`找不到執行清單：${MANIFEST}`);
  }
  const parsed = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (!Array.isArray(parsed.migrations)) {
    throw new Error('執行清單格式錯誤：缺少 migrations 陣列。');
  }
  return parsed.migrations.map((m) => {
    const full = path.join(DB_DIR, m.file);
    if (!fs.existsSync(full)) {
      throw new Error(`清單列出的檔案不存在：${m.file}`);
    }
    // 防止清單透過 ../ 指向 database/ 以外的檔案
    if (path.relative(DB_DIR, full).startsWith('..')) {
      throw new Error(`不允許的檔案路徑：${m.file}`);
    }
    const sql = fs.readFileSync(full, 'utf8');
    return { ...m, fullPath: full, sql, checksum: sha256(sql) };
  });
};

const ensureTrackingTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    VARCHAR(255) PRIMARY KEY,
      checksum    CHAR(64) NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      duration_ms INTEGER,
      baselined   BOOLEAN NOT NULL DEFAULT FALSE
    )`);
};

const fetchApplied = async () => {
  const r = await pool.query(`SELECT filename, checksum, applied_at, baselined FROM schema_migrations`);
  return new Map(r.rows.map((x) => [x.filename, x]));
};

const run = async () => {
  const migrations = loadManifest();
  await ensureTrackingTable();
  const applied = await fetchApplied();

  const pending = migrations.filter((m) => !applied.has(m.file));
  const changed = migrations.filter((m) => {
    const a = applied.get(m.file);
    return a && a.checksum !== m.checksum;
  });

  // --- 狀態 ---------------------------------------------------------------
  console.log(`資料庫：${process.env.DB_NAME} @ ${process.env.DB_HOST}`);
  console.log(`清單共 ${migrations.length} 支，已套用 ${applied.size} 支，待套用 ${pending.length} 支\n`);

  for (const m of migrations) {
    const a = applied.get(m.file);
    const state = !a ? '待套用'
      : a.checksum !== m.checksum ? '已套用(內容已變更)'
        : a.baselined ? '已標記' : '已套用';
    console.log(`  [${state.padEnd(18)}] ${m.file}${m.type === 'data' ? '  (資料修正)' : ''}`);
  }

  if (changed.length > 0) {
    console.log('\n警告：以下腳本在套用後內容被修改過，資料庫狀態可能與程式碼預期不符：');
    changed.forEach((m) => console.log(`  - ${m.file}`));
    console.log('  請改為新增一支 migration，而非修改已套用的腳本。');
  }

  if (MODE === 'status') return { applied: 0, changed: changed.length };

  // --- 單支標記：用於已在資料庫外手動套用過的腳本 ----------------------------
  if (MODE === 'mark') {
    const target = migrations.find((m) => m.file === MARK_FILE);
    if (!target) throw new Error(`清單中找不到 ${MARK_FILE}`);
    await pool.query(
      `INSERT INTO schema_migrations (filename, checksum, baselined) VALUES ($1, $2, TRUE)
       ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum`,
      [target.file, target.checksum]
    );
    console.log(`\n已標記為已套用：${target.file}`);
    return { applied: 0, changed: changed.length };
  }

  // --- 標記模式：不執行，只記錄 --------------------------------------------
  if (MODE === 'baseline') {
    if (pending.length === 0) {
      console.log('\n沒有需要標記的項目。');
      return { applied: 0, changed: changed.length };
    }
    for (const m of pending) {
      await pool.query(
        `INSERT INTO schema_migrations (filename, checksum, baselined) VALUES ($1, $2, TRUE)
         ON CONFLICT (filename) DO NOTHING`,
        [m.file, m.checksum]
      );
    }
    console.log(`\n已將 ${pending.length} 支標記為已套用（未實際執行）。`);
    return { applied: 0, changed: changed.length };
  }

  // --- 套用模式 -----------------------------------------------------------
  if (pending.length === 0) {
    console.log('\n資料庫已是最新，無需套用。');
    return { applied: 0, changed: changed.length };
  }

  console.log(`\n開始套用 ${pending.length} 支腳本...\n`);
  let count = 0;
  for (const m of pending) {
    const client = await pool.connect();
    const started = Date.now();
    try {
      // 交易一律由此處控制：腳本內的頂層 BEGIN/COMMIT 已被移除，
      // 確保「腳本內容」與「已套用紀錄」在同一個交易中一起成立或一起回滾。
      await client.query('BEGIN');
      await client.query(stripTopLevelTransaction(m.sql));
      await client.query(
        `INSERT INTO schema_migrations (filename, checksum, duration_ms) VALUES ($1, $2, $3)`,
        [m.file, m.checksum, Date.now() - started]
      );
      await client.query('COMMIT');
      console.log(`  成功  ${m.file}  (${Date.now() - started} ms)`);
      count++;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`\n  失敗  ${m.file}`);
      console.error(`        ${err.message}`);
      console.error('\n已回滾該腳本的所有變更，後續腳本不會執行。');
      client.release();
      throw err;
    } finally {
      client.release();
    }
  }
  console.log(`\n完成：成功套用 ${count} 支。`);
  return { applied: count, changed: changed.length };
};

try {
  await run();
  process.exitCode = 0;
} catch (err) {
  console.error(`\n執行中止：${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
