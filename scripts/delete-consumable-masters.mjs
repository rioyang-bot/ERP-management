#!/usr/bin/env node
/**
 * 刪除誤建的耗材品項主檔
 *
 * 耗材列表上的「新增」會直接建出品項主檔並帶入初始庫存。若這批貨其實
 * 應該走進貨單入庫，那筆主檔就得整個移除再重建 —— 留著會讓同一個品項
 * 有兩筆主檔，庫存也是憑空出現的。
 *
 * 畫面上的「刪除耗材」在這種情況會被擋下來：它要求庫存為 0，而誤建的主檔
 * 偏偏就是帶著初始庫存。這支腳本放寬的只有這一點 ——
 * 只要沒有任何進貨、出貨、借測、資產或月結存紀錄，那個庫存數字就純粹是
 * 建檔時打進去的，不是帳務。有任何一筆關聯就拒絕刪除。
 *
 * 為什麼一定要檢查：item_master 是五張表的 ON DELETE CASCADE 母表
 * （assets / inbound_items / outbound_items / item_lab_assignments /
 * inventory_monthly_balances），直接刪會把歷史帳務一起帶走，而且不會有
 * 任何警告。畫面上那支檢查漏了 inventory_monthly_balances，這裡補上。
 *
 * 事件紀錄一併清除：誤建這件事要當作沒發生過，留著只會在事件紀錄裡
 * 多出一筆對不到任何品項的「建立耗材物料」。
 * 比對方式是 target_id ——建檔時記的是「廠牌-型號」而不是數字 ID
 * （見 ConsumableRegistrationModal 的 logCreate）。同樣的廠牌型號若以前
 * 也建過又刪過，舊紀錄會共用同一個 target_id，因此試跑會把每一筆
 * 逐條列出來，請先看過再加 --apply。
 *
 * 用法（在伺服器的專案目錄下執行）：
 *   node scripts/delete-consumable-masters.mjs 123 124 125          # 試跑，只印報告
 *   node scripts/delete-consumable-masters.mjs "ARISTA 10G-LR"      # 也可以用「廠牌 型號」
 *   node scripts/delete-consumable-masters.mjs 123 124 --apply      # 真的刪
 *
 * 透過 npm 執行時參數前要多一組 --，否則會被 npm 吃掉：
 *   npm run delete-consumables -- 123 124 --apply
 *
 * 連線設定取自專案目錄的 .env，與 npm run migrate 相同。
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const targets = args.filter((a) => !a.startsWith('--'));

if (targets.length === 0) {
  console.error('用法：node scripts/delete-consumable-masters.mjs <品項ID 或 "廠牌 型號"> ... [--apply]');
  console.error('範例：node scripts/delete-consumable-masters.mjs 123 124 --apply');
  console.error('      node scripts/delete-consumable-masters.mjs "ARISTA 10G-LR" "CISCO GLC-T"');
  process.exit(1);
}

const pool = new pg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});

/** 關聯紀錄：任何一項不為 0 就不能刪 —— 全是 CASCADE，刪了不會有警告 */
const DEPENDENCIES = [
  ['進貨明細', 'SELECT COUNT(*) n FROM inbound_items WHERE item_id = $1'],
  ['出貨明細', 'SELECT COUNT(*) n FROM outbound_items WHERE item_id = $1'],
  ['借測配發', 'SELECT COUNT(*) n FROM item_lab_assignments WHERE item_master_id = $1'],
  ['資產', 'SELECT COUNT(*) n FROM assets WHERE item_master_id = $1'],
  ['月結存', 'SELECT COUNT(*) n FROM inventory_monthly_balances WHERE item_master_id = $1'],
];

/** 參數可以是主檔 ID，也可以是「廠牌 型號」 */
async function resolve(token) {
  if (/^\d+$/.test(token)) {
    const { rows } = await pool.query(
      `SELECT i.id, i.brand, i.model, i.specification, i.stock_qty, i.lab_qty, i.created_at, c.name AS category
         FROM item_master i LEFT JOIN categories c ON i.category_id = c.id
        WHERE i.id = $1`, [Number(token)]);
    return rows;
  }
  const parts = token.trim().split(/\s+/);
  const brand = parts.shift() || '';
  const model = parts.join(' ');
  const { rows } = await pool.query(
    `SELECT i.id, i.brand, i.model, i.specification, i.stock_qty, i.lab_qty, i.created_at, c.name AS category
       FROM item_master i LEFT JOIN categories c ON i.category_id = c.id
      WHERE UPPER(TRIM(i.brand)) = UPPER($1) AND UPPER(TRIM(i.model)) = UPPER($2)`,
    [brand, model]);
  return rows;
}

/** timestamp 欄位回來的是 Date 物件，直接切字串會把 'Tue' 的 T 當成 ISO 的 T 吃掉 */
const when = (v) => {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} `
    + `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
};

const label = (m) => `#${m.id} ${m.brand} ${m.model}${m.specification ? ` / ${m.specification}` : ''}`;

/** 建檔時 target_id 記的是「廠牌-型號」，不是數字 ID */
const auditKey = (m) => `${(m.brand || '').trim()}-${(m.model || '').trim()}`;

async function findAuditLogs(master) {
  const { rows } = await pool.query(
    `SELECT id, timestamp, action_type, user_name, summary
       FROM system_audit_logs
      WHERE module = 'CONSUMABLE' AND UPPER(TRIM(target_id)) = UPPER($1)
      ORDER BY timestamp`, [auditKey(master)]);
  return rows;
}

const plan = [];
const problems = [];

for (const token of targets) {
  const found = await resolve(token);
  if (found.length === 0) { problems.push(`找不到「${token}」`); continue; }
  if (found.length > 1) {
    problems.push(`「${token}」對到 ${found.length} 筆（${found.map((m) => `#${m.id}`).join(', ')}），請改用品項 ID`);
    continue;
  }
  const master = found[0];

  if (master.category && master.category !== '耗材') {
    problems.push(`${label(master)} 的類別是「${master.category}」，這支腳本只處理耗材`);
    continue;
  }

  const deps = [];
  for (const [name, sql] of DEPENDENCIES) {
    const { rows: [{ n }] } = await pool.query(sql, [master.id]);
    if (Number(n) > 0) deps.push(`${name} ${n} 筆`);
  }
  plan.push({ master, deps, logs: await findAuditLogs(master) });
}

console.log(`\n=== 誤建耗材主檔的刪除檢查（${APPLY ? '正式執行' : '試跑'}）===\n`);

for (const { master, deps, logs } of plan) {
  console.log(`${label(master)}`);
  console.log(`   建立於 ${when(master.created_at)}　庫存 ${master.stock_qty ?? 0}　借測 ${master.lab_qty ?? 0}`);
  console.log(deps.length === 0
    ? '   ✅ 沒有任何關聯紀錄，庫存數字就是建檔時打進去的 → 可以刪除'
    : `   ❌ 有關聯紀錄，拒絕刪除：${deps.join('、')}`);
  if (deps.length === 0) {
    console.log(`   一併清除的事件紀錄（比對 target_id = ${auditKey(master)}）：${logs.length} 筆`);
    for (const l of logs) {
      const t = when(l.timestamp);
      console.log(`     · ${t} [${l.action_type}] ${l.user_name || '-'}　${l.summary}`);
    }
    if (logs.length === 0) console.log('     （沒有對應的事件紀錄）');
  }
  console.log('');
}

for (const p of problems) console.log(`⚠️  ${p}`);

const deletable = plan.filter((p) => p.deps.length === 0);
const blocked = plan.filter((p) => p.deps.length > 0);

console.log(`可刪除 ${deletable.length} 筆，因有關聯而跳過 ${blocked.length} 筆，無法解析 ${problems.length} 筆`);

if (!APPLY) {
  console.log('\n這是試跑，沒有動到任何資料。確認無誤後加上 --apply 再執行一次。');
  await pool.end();
  process.exit(0);
}

if (deletable.length === 0) {
  console.log('\n沒有可刪除的項目，結束。');
  await pool.end();
  process.exit(0);
}

// 整批放在同一個交易裡：要嘛全刪成功，要嘛完全不動
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const { master: m, logs } of deletable) {
    // 刪除前再驗一次，避免試跑到正式執行之間有人動了資料
    const { rows } = await client.query(
      `DELETE FROM item_master i
        WHERE i.id = $1
          AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.item_master_id = i.id)
          AND NOT EXISTS (SELECT 1 FROM inbound_items ii WHERE ii.item_id = i.id)
          AND NOT EXISTS (SELECT 1 FROM outbound_items oi WHERE oi.item_id = i.id)
          AND NOT EXISTS (SELECT 1 FROM item_lab_assignments la WHERE la.item_master_id = i.id)
          AND NOT EXISTS (SELECT 1 FROM inventory_monthly_balances b WHERE b.item_master_id = i.id)
        RETURNING id`, [m.id]);
    if (rows.length === 0) throw new Error(`${label(m)} 在執行當下已有關聯紀錄，整批取消`);

    // 事件紀錄一併清除。用試跑時列出的那幾筆 id，不重新用條件比對 ——
    // 兩次之間若有人又建了同名品項，條件比對會誤刪新的那一筆。
    let removedLogs = 0;
    if (logs.length > 0) {
      const { rowCount } = await client.query(
        'DELETE FROM system_audit_logs WHERE id = ANY($1::int[])', [logs.map((l) => l.id)]);
      removedLogs = rowCount;
    }
    console.log(`已刪除 ${label(m)}　事件紀錄 ${removedLogs} 筆`);
  }
  await client.query('COMMIT');
  const totalLogs = deletable.reduce((n, d) => n + d.logs.length, 0);
  console.log(`\n完成：共刪除 ${deletable.length} 筆品項、${totalLogs} 筆事件紀錄。請改從進貨單重新建檔。`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error(`\n已全部回復，未刪除任何資料：${err.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
