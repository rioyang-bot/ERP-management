#!/usr/bin/env node
/**
 * 批次把某個耗材掛到某個型號的所有設備上（每台 N 個）
 *
 * 例如 SECRETHFT-ARL / 8C-Gen1 的 24 台每台都要掛一個 T7445 2U CASE。
 * 從畫面一台一台掛很費工；而且已出貨的設備畫面上沒辦法補掛，只能另外處理。
 *
 * 依設備目前的狀態：
 *   已出貨（SHIPPED）  耗材跟著設備出去了：從庫存扣除。
 *                      掛載紀錄記一筆 +N（補登掛載）再一筆 −N（隨設備出貨），
 *                      耗材的 LAB 履歷查得到是跟著哪一台出去的，LAB 數量不變。
 *   報廢（SCRAPPED）    不處理，列出來。
 *   其他（在庫、借出、維修…） 一般的掛載：從庫存移到 LAB，記在這台設備上
 *                      （與設備編輯畫面的「掛載耗材」相同）。
 *
 * 已經有這個耗材掛載紀錄的設備會略過，重複執行不會掛兩次。
 * 全部在同一個交易裡：庫存不夠或任何一步失敗就整批不動。
 * 每台設備寫兩筆事件紀錄（耗材、設備各一筆），與畫面上掛載時相同。
 *
 * 用法（在程式目錄執行，讀 .env 連資料庫）：
 *   node scripts/mount-consumable-on-devices.mjs --consumable "T7445 2U CASE" \
 *        --device-model SECRETHFT-ARL --device-spec 8C-Gen1            # 試算，不寫入
 *   ...同上... --apply                                                 # 實際執行
 *
 * 參數：
 *   --consumable <型號>       耗材的「型號/規格」欄（不分大小寫），必須只對到一筆
 *   --device-model <型號>     設備型號
 *   --device-spec <規格>      設備規格（同一型號有多種規格時用來區分）
 *   --qty <數量>              每台掛幾個，預設 1
 *   --apply                   實際寫入；沒有這個參數只試算
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = args.includes('--apply');
const consumableModel = opt('consumable');
const deviceModel = opt('device-model');
const deviceSpec = opt('device-spec');
const qty = Number(opt('qty') ?? 1);

if (!consumableModel || !deviceModel) {
  console.error('用法：node scripts/mount-consumable-on-devices.mjs --consumable <耗材型號> --device-model <設備型號> [--device-spec <規格>] [--qty 1] [--apply]');
  process.exit(1);
}
if (!Number.isInteger(qty) || qty <= 0) {
  console.error(`--qty 要是大於 0 的整數，收到：${opt('qty')}`);
  process.exit(1);
}

const SCRIPT = 'scripts/mount-consumable-on-devices.mjs';
const norm = `UPPER(TRIM(REGEXP_REPLACE(COALESCE($1, ''), '[[:space:]]+', ' ', 'g')))`;

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const audit = (client, module, moduleLabel, targetId, targetName, summary, details) => client.query(
  `INSERT INTO system_audit_logs
     (user_id, user_name, user_role, action_type, module, module_label, target_id, target_name, summary, details)
   VALUES (NULL, '系統維護', 'SYSTEM', 'UPDATE', $1, $2, $3, $4, $5, $6::jsonb)`,
  [module, moduleLabel, String(targetId), targetName, summary, JSON.stringify({ ...details, script: SCRIPT })]
);

const client = await pool.connect();
let exitCode = 0;
try {
  await client.query('BEGIN');
  console.log(`連線資料庫：${process.env.DB_NAME} @ ${process.env.DB_HOST}${APPLY ? '' : '（試算，不會寫入）'}\n`);

  // --- 耗材：必須剛好一筆 ------------------------------------------------------
  const items = (await client.query(
    `SELECT i.id, i.brand, i.type, i.model, COALESCE(i.stock_qty, 0) AS stock_qty, COALESCE(i.lab_qty, 0) AS lab_qty
     FROM item_master i JOIN categories c ON c.id = i.category_id
     WHERE c.name = '耗材' AND UPPER(TRIM(i.model)) = ${norm}`, [consumableModel])).rows;
  if (items.length !== 1) {
    throw new Error(`耗材「${consumableModel}」對到 ${items.length} 筆，必須剛好一筆${items.length ? `：${items.map((i) => `#${i.id} ${i.brand} ${i.model}`).join('、')}` : ''}`);
  }
  const item = items[0];
  const label = `${item.type ? `${item.type} - ` : ''}${item.brand || ''} ${item.model}`.trim();

  // --- 設備 --------------------------------------------------------------------
  const devices = (await client.query(
    `SELECT a.id, a.sn, a.status, i.brand, i.model, i.specification,
            EXISTS (SELECT 1 FROM item_lab_assignments la WHERE la.asset_id = a.id AND la.item_master_id = $3) AS has_record
     FROM assets a
     JOIN item_master i ON i.id = a.item_master_id
     JOIN categories c ON c.id = i.category_id
     WHERE c.name = '設備' AND UPPER(TRIM(i.model)) = ${norm}
       AND ($2::text IS NULL OR UPPER(TRIM(COALESCE(i.specification, ''))) = UPPER(TRIM($2::text)))
     ORDER BY a.status, a.sn`, [deviceModel, deviceSpec ?? null, item.id])).rows;
  if (devices.length === 0) throw new Error(`找不到型號「${deviceModel}」${deviceSpec ? `、規格「${deviceSpec}」` : ''}的設備`);
  const specs = [...new Set(devices.map((d) => d.specification || '（無規格）'))];
  if (specs.length > 1) throw new Error(`這個型號有多種規格：${specs.join('、')}，請用 --device-spec 指定`);

  const skipped = devices.filter((d) => d.has_record);
  const scrapped = devices.filter((d) => !d.has_record && d.status === 'SCRAPPED');
  const shipped = devices.filter((d) => !d.has_record && d.status === 'SHIPPED');
  const mounted = devices.filter((d) => !d.has_record && !['SHIPPED', 'SCRAPPED'].includes(d.status));
  const need = (shipped.length + mounted.length) * qty;

  console.log(`耗材：#${item.id} ${label}　庫存 ${item.stock_qty}、LAB ${item.lab_qty}`);
  console.log(`設備：${devices[0].brand} ${devices[0].model} / ${specs[0]}　共 ${devices.length} 台，每台 ${qty} 個\n`);
  const list = (title, rows) => {
    if (!rows.length) return;
    console.log(`${title}：${rows.length} 台`);
    rows.forEach((d) => console.log(`  ${d.sn.padEnd(16)} ${d.status}`));
  };
  list('掛載（庫存 → LAB，記在設備上）', mounted);
  list('已出貨，跟著出貨（從庫存扣除）', shipped);
  list('已有這個耗材的掛載紀錄，略過', skipped);
  list('已報廢，不處理', scrapped);

  if (need === 0) {
    console.log('\n沒有要處理的設備。');
  } else {
    if (item.stock_qty < need) throw new Error(`庫存不足：需要 ${need}，目前庫存 ${item.stock_qty}`);

    for (const d of mounted) {
      await client.query('UPDATE item_master SET stock_qty = stock_qty - $1, lab_qty = COALESCE(lab_qty, 0) + $1 WHERE id = $2', [qty, item.id]);
      await client.query('INSERT INTO item_lab_assignments (item_master_id, asset_id, quantity, note) VALUES ($1, $2, $3, $4)',
        [item.id, d.id, qty, `掛載到設備 ${d.sn}（批次補登）`]);
      const summary = `設備 [${d.sn}] 掛載耗材 ${label} × ${qty}（Stock ➔ LAB，批次補登）`;
      const details = { itemMasterId: item.id, label, quantity: qty, sn: d.sn, direction: 'MOUNT', deviceStatus: d.status };
      await audit(client, 'CONSUMABLE', '耗材物料', item.id, label, summary, details);
      await audit(client, 'DEVICE', '設備管理', d.sn, d.sn, summary, details);
    }
    for (const d of shipped) {
      await client.query('UPDATE item_master SET stock_qty = stock_qty - $1 WHERE id = $2', [qty, item.id]);
      await client.query('INSERT INTO item_lab_assignments (item_master_id, asset_id, quantity, note) VALUES ($1, $2, $3, $4), ($1, $2, $5, $6)',
        [item.id, d.id, qty, `掛載到設備 ${d.sn}（批次補登）`, -qty, `設備 ${d.sn} 已出貨，隨設備出貨（批次補登）`]);
      const summary = `設備 [${d.sn}] 已出貨，補登隨設備出貨的耗材 ${label} × ${qty}（從庫存扣除）`;
      const details = { itemMasterId: item.id, label, quantity: qty, sn: d.sn, direction: 'SHIPPED_WITH_DEVICE', deviceStatus: d.status };
      await audit(client, 'CONSUMABLE', '耗材物料', item.id, label, summary, details);
      await audit(client, 'DEVICE', '設備管理', d.sn, d.sn, summary, details);
    }

    const after = (await client.query('SELECT stock_qty, lab_qty FROM item_master WHERE id = $1', [item.id])).rows[0];
    console.log(`\n耗材數量：庫存 ${item.stock_qty} → ${after.stock_qty}、LAB ${item.lab_qty} → ${after.lab_qty}`);
    console.log(`事件紀錄：${(shipped.length + mounted.length) * 2} 筆（每台耗材、設備各一筆）`);
  }

  if (APPLY) {
    await client.query('COMMIT');
    console.log('\n已寫入。');
  } else {
    await client.query('ROLLBACK');
    console.log('\n這是試算，沒有寫入。確認無誤後加上 --apply 執行。');
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\n失敗，沒有任何變更：${e.message}`);
  exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
process.exit(exitCode);
