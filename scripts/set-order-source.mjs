#!/usr/bin/env node
/**
 * 統一填寫某一張進貨單的訂單來源 (OrderSource)
 *
 * 進貨入庫單先前沒有訂單來源這一欄，走那條路建檔的硬體都沒有這個值。
 * 一筆一筆從硬體列表編輯八十次不切實際，這支腳本依進貨單號一次補齊。
 *
 * 對應方式：以進貨明細的序號去比對資產序號（忽略大小寫與前後空白），
 * 與系統其他地方處理序號的方式一致。
 *
 * 預設只補「還沒有訂單來源」的資產；已經填過的不動，要覆蓋請加 --overwrite。
 *
 * 用法（在伺服器的專案目錄下執行）：
 *   node scripts/set-order-source.mjs IN-20260921-01 "PO-2026-001"
 *   node scripts/set-order-source.mjs IN-20260921-01 "PO-2026-001" --apply
 *   node scripts/set-order-source.mjs IN-20260921-01 "PO-2026-001" --apply --overwrite
 *
 * 透過 npm 執行時參數前要多一組 --，否則會被 npm 吃掉：
 *   npm run set-order-source -- IN-20260921-01 "PO-2026-001" --apply
 *
 * 連線設定取自同目錄的 .env，與 npm run migrate 相同。
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const [orderNo, orderSource] = args.filter((a) => !a.startsWith('--'));
const APPLY = flags.includes('--apply');
const OVERWRITE = flags.includes('--overwrite');

if (!orderNo || !orderSource) {
  console.error('用法：node scripts/set-order-source.mjs <進貨單號> <訂單來源> [--apply] [--overwrite]');
  console.error('範例：node scripts/set-order-source.mjs IN-20260921-01 "PO-2026-001" --apply');
  process.exit(1);
}

const source = orderSource.trim();
if (!source) {
  console.error('訂單來源不可為空白。要清除既有的值請直接在硬體列表編輯。');
  process.exit(1);
}

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

/** 這張進貨單的明細，以及各自對到的資產與目前的訂單來源 */
const FIND = `
  SELECT
    ii.sn,
    a.id AS asset_id,
    a.custom_attributes->>'order_source' AS current_source,
    c.name AS category
  FROM inbound_items ii
  JOIN inbound_orders io ON ii.inbound_order_id = io.id
  LEFT JOIN item_master im ON ii.item_id = im.id
  LEFT JOIN categories c ON im.category_id = c.id
  LEFT JOIN assets a
    ON ii.sn IS NOT NULL AND TRIM(ii.sn) <> ''
   AND UPPER(TRIM(a.sn)) = UPPER(TRIM(ii.sn))
  WHERE io.order_no = $1
  ORDER BY ii.id
`;

const client = await pool.connect();
let failed = false;

try {
  await client.query('BEGIN');

  const rows = (await client.query(FIND, [orderNo])).rows;
  if (rows.length === 0) {
    throw new Error(`找不到進貨單 [${orderNo}]，或這張單沒有任何明細`);
  }

  const noAsset = rows.filter((r) => !r.asset_id);
  const hasSource = rows.filter((r) => r.asset_id && r.current_source);
  const targets = rows.filter((r) => r.asset_id && (OVERWRITE || !r.current_source));

  console.log(`連線資料庫：${process.env.DB_NAME} @ ${process.env.DB_HOST}`);
  console.log(`進貨單 [${orderNo}]：明細 ${rows.length} 筆\n`);
  console.log(`  對不到資產            ${noAsset.length} 筆${noAsset.length ? '（序號可能已被更動或尚未建檔）' : ''}`);
  console.log(`  已有訂單來源          ${hasSource.length} 筆${hasSource.length && !OVERWRITE ? '（跳過，要覆蓋請加 --overwrite）' : ''}`);
  console.log(`  這次要填入            ${targets.length} 筆 → 「${source}」\n`);

  if (noAsset.length > 0) {
    console.log('  對不到資產的序號：');
    noAsset.slice(0, 10).forEach((r) => console.log(`    ${r.sn || '(無序號)'}`));
    if (noAsset.length > 10) console.log(`    …另外還有 ${noAsset.length - 10} 筆`);
    console.log('');
  }

  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))];
  if (categories.some((c) => c !== '硬體')) {
    console.log(`  ⚠ 這張單包含非硬體的品項（${categories.join('、')}）。`);
    console.log('    訂單來源目前只有硬體列表會顯示，其他類別填了看不到。\n');
  }

  for (const r of targets) {
    await client.query(
      `UPDATE assets
       SET custom_attributes = COALESCE(custom_attributes, '{}'::jsonb) || jsonb_build_object('order_source', $1::text),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [source, r.asset_id]
    );
    // 留下稽核紀錄：這不是從畫面操作的，沒有紀錄事後查不出是誰、為什麼改的
    await client.query(
      `INSERT INTO system_audit_logs
         (user_id, user_name, user_role, action_type, module, module_label, target_id, target_name, summary, details)
       VALUES (NULL, '系統維護', 'SYSTEM', 'UPDATE', 'HARDWARE', '硬體', $1, $2, $3, $4::jsonb)`,
      [
        String(r.asset_id),
        r.sn,
        `統一填寫訂單來源：${r.sn} 設為「${source}」（進貨單 ${orderNo}）`,
        JSON.stringify({
          from: r.current_source || null,
          to: source,
          inbound_order: orderNo,
          script: 'scripts/set-order-source.mjs',
        }),
      ]
    );
  }

  if (APPLY) {
    await client.query('COMMIT');
    console.log(`已寫入資料庫，共更新 ${targets.length} 筆。`);
  } else {
    await client.query('ROLLBACK');
    console.log('這是試算，尚未寫入。確認無誤後加上 --apply 再執行一次。');
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
