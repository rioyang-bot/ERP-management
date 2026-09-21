#!/usr/bin/env node
/**
 * 對齊維修單上的設備狀態
 *
 * 維修單建立時會把設備標記為維修中（REPAIRING），一路維持到完工出貨。
 * 這個規則上線之前建立的單據，設備狀態還停在建單當下寫入的「在庫」——
 * 列表上看起來可以動用，實際上正在維修。這支腳本把那些單據補齊。
 *
 * 處理範圍：維修單尚未結案（status <> 'COMPLETED'），而設備狀態既不是
 * 維修中、也不是已報廢的。已完工出貨或已報廢的一律不動，那是流程結束
 * 後的正常狀態。
 *
 * 另外會列出「單據已結案、設備卻還停在維修中」的情形。這種不自動處理：
 * 正常完工會把設備設為出庫，出現這種組合代表流程中途出過狀況，
 * 該設成什麼要人看過才知道。
 *
 * 用法（在伺服器的專案目錄下執行）：
 *   node scripts/align-repair-status.mjs            # 試算，不寫入
 *   node scripts/align-repair-status.mjs --apply    # 實際執行
 *
 * 連線設定取自同目錄的 .env，與 npm run migrate 相同。
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const APPLY = process.argv.includes('--apply');

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

/** 未結案維修單上、狀態不對的設備 */
const FIND_MISALIGNED = `
  SELECT DISTINCT a.id, a.sn, a.status, ro.repair_no, ro.status AS repair_status
  FROM repair_items ri
  JOIN repair_orders ro ON ri.repair_id = ro.id
  JOIN assets a ON UPPER(TRIM(a.sn)) = UPPER(TRIM(ri.sn))
  WHERE ro.status <> 'COMPLETED'
    AND a.status NOT IN ('REPAIRING', 'SCRAPPED')
  ORDER BY a.sn
`;

/** 單據已結案、設備卻還停在維修中：只回報，不自動處理 */
const FIND_STALE = `
  SELECT DISTINCT a.sn, a.status, ro.repair_no, ro.completion_date
  FROM repair_items ri
  JOIN repair_orders ro ON ri.repair_id = ro.id
  JOIN assets a ON UPPER(TRIM(a.sn)) = UPPER(TRIM(ri.sn))
  WHERE ro.status = 'COMPLETED'
    AND a.status = 'REPAIRING'
  ORDER BY a.sn
`;

const client = await pool.connect();
let failed = false;

try {
  await client.query('BEGIN');

  const targets = (await client.query(FIND_MISALIGNED)).rows;

  console.log(`連線資料庫：${process.env.DB_NAME} @ ${process.env.DB_HOST}\n`);
  console.log(`未結案維修單上、狀態需要對齊的設備：${targets.length} 台`);
  targets.forEach((r) => {
    console.log(`  ${r.sn.padEnd(20)} ${r.status} → REPAIRING    （${r.repair_no}，單據狀態 ${r.repair_status}）`);
  });

  for (const r of targets) {
    await client.query(
      `UPDATE assets SET status = 'REPAIRING', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [r.id]
    );
    // 留下稽核紀錄：這不是從畫面操作的，沒有紀錄事後查不出是誰、為什麼改的
    await client.query(
      `INSERT INTO system_audit_logs
         (user_id, user_name, user_role, action_type, module, module_label, target_id, target_name, summary, details)
       VALUES (NULL, '系統維護', 'SYSTEM', 'STATUS_CHANGE', 'DEVICE', '設備', $1, $2, $3, $4::jsonb)`,
      [
        String(r.id),
        r.sn,
        `對齊維修單狀態：${r.sn} 由 ${r.status} 改為 REPAIRING（維修單 ${r.repair_no} 尚未完工）`,
        JSON.stringify({
          from: r.status,
          to: 'REPAIRING',
          repair_no: r.repair_no,
          repair_status: r.repair_status,
          reason: '維修單建立即標記維修的規則上線前既有的單據',
          script: 'scripts/align-repair-status.mjs',
        }),
      ]
    );
  }

  // 對齊後的結果
  const remaining = (await client.query(FIND_MISALIGNED)).rows;
  console.log(`\n對齊後仍不一致：${remaining.length} 台` + (remaining.length ? '（請檢查）' : ''));
  remaining.forEach((r) => console.log(`  ${r.sn}  ${r.status}  （${r.repair_no}）`));

  const stale = (await client.query(FIND_STALE)).rows;
  if (stale.length > 0) {
    console.log(`\n⚠ 另有 ${stale.length} 台：單據已結案，設備卻還停在維修中。`);
    console.log('  正常完工會把設備設為出庫，出現這種組合代表流程中途出過狀況，');
    console.log('  該設成什麼要人判斷，這支腳本不會自動更動：');
    stale.forEach((r) => console.log(`    ${r.sn}  （${r.repair_no}，完工日 ${r.completion_date || '未填'}）`));
  }

  if (APPLY) {
    await client.query('COMMIT');
    console.log(`\n已寫入資料庫，共更新 ${targets.length} 台。`);
  } else {
    await client.query('ROLLBACK');
    console.log('\n這是試算，尚未寫入。確認無誤後加上 --apply 再執行一次。');
  }
} catch (e) {
  failed = true;
  await client.query('ROLLBACK').catch(() => { /* 回滾失敗時保留原始錯誤 */ });
  console.error(`\n✗ 已全部退回，資料庫未變更：${e.message}`);
} finally {
  client.release();
  await pool.end();
}

process.exit(failed ? 1 : 0);
