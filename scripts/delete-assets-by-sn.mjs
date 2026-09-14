// ============================================================================
// 依序號刪除資產（設備／硬體）
// ----------------------------------------------------------------------------
// 用途：匯入錯了要把那一批資料刪掉。手動下 SQL 容易打錯或漏掉關聯檢查，
//       因此做成有預覽、有防呆的腳本。
//
// 用法（在專案資料夾執行）：
//   node scripts/delete-assets-by-sn.mjs sns.txt            預覽，不會刪
//   node scripts/delete-assets-by-sn.mjs sns.txt --apply    確認後真的刪除
//
//   sns.txt 一行一個序號，空行與 # 開頭的註解行會被忽略。
//   也可以直接把序號接在後面：
//   node scripts/delete-assets-by-sn.mjs --sn AAA111 --sn BBB222
//
// 安全設計：
//   1. 預設只預覽，要加 --apply 才會真的刪除。
//   2. 刪除前列出每一筆的廠牌／型號／狀態／客戶，讓你核對是不是要刪的那批。
//   3. 被單據參照的資產（出貨、借用、進貨、維修、實驗室調撥）一律不刪，
//      因為刪掉會讓歷史單據指向不存在的資產。這類會列出來請你自行處理。
//   4. 有硬體掛載在該序號上的，也不刪 —— 那些硬體會變成掛在不存在的設備上。
//   5. 整批放在單一交易中執行，任一步失敗全部回滾。
//   6. 刪除後若某張品項主檔已無任何資產且無單據參照，一併清掉，
//      避免留下沒有卡片的空主檔。
//
// 執行前請先備份：npm run backup
// ============================================================================

import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

// --- 取得要刪除的序號 -------------------------------------------------------
const inlineSns = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sn' && args[i + 1]) inlineSns.push(args[i + 1]);
}
const fileArg = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--sn');

let sns = [...inlineSns];
if (fileArg) {
  if (!fs.existsSync(fileArg)) {
    console.error(`找不到檔案：${fileArg}`);
    process.exit(1);
  }
  sns.push(...fs.readFileSync(fileArg, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')));
}
sns = [...new Set(sns.map((s) => s.trim()).filter(Boolean))];

if (sns.length === 0) {
  console.error('沒有指定任何序號。用法：node scripts/delete-assets-by-sn.mjs sns.txt [--apply]');
  process.exit(1);
}

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'ERP_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

const line = (s = '') => console.log(s);

const main = async () => {
  const client = await pool.connect();
  try {
    line('='.repeat(62));
    line('  依序號刪除資產');
    line('='.repeat(62));
    line(`資料庫：${process.env.DB_HOST || 'localhost'} / ${process.env.DB_NAME || 'ERP_db'}`);
    line(`模式　：${apply ? '⚠ 實際刪除 (--apply)' : '預覽（不會更動任何資料）'}`);
    line(`序號數：${sns.length}`);
    line();

    // --- 找出對應的資產 -----------------------------------------------------
    const found = await client.query(`
      SELECT a.id, TRIM(a.sn) AS sn, a.status, a.client, a.item_master_id,
             c.name AS category, i.brand, i.type, i.model, i.specification
      FROM assets a
      JOIN item_master i ON a.item_master_id = i.id
      JOIN categories c ON i.category_id = c.id
      WHERE TRIM(a.sn) = ANY($1)
      ORDER BY a.id`, [sns]);

    const foundSns = found.rows.map((r) => r.sn);
    const missing = sns.filter((s) => !foundSns.includes(s));

    line(`找到 ${found.rowCount} 筆資產`);
    if (found.rowCount > 0) {
      console.table(found.rows.map((r) => ({
        序號: r.sn, 類別: r.category, 廠牌: r.brand, 型號: r.model,
        狀態: r.status, 客戶: r.client || '',
      })));
    }
    if (missing.length) {
      line();
      line(`查無資料的序號 ${missing.length} 筆：`);
      missing.forEach((s) => line(`  ${s}`));
    }
    if (found.rowCount === 0) {
      line('\n沒有可刪除的資產，結束。');
      return;
    }

    // --- 檢查關聯 -----------------------------------------------------------
    const ids = found.rows.map((r) => r.id);
    const blockers = await client.query(`
      SELECT TRIM(a.sn) AS sn,
        (SELECT count(*) FROM outbound_items oi WHERE TRIM(oi.sn) = TRIM(a.sn))::int AS outbound,
        (SELECT count(*) FROM repair_items ri WHERE TRIM(ri.sn) = TRIM(a.sn))::int AS repair,
        (SELECT count(*) FROM item_lab_assignments la WHERE la.asset_id = a.id)::int AS lab,
        (SELECT count(*) FROM assets x
          WHERE TRIM(LOWER(x.custom_attributes->>'server_sn')) = TRIM(LOWER(a.sn)))::int AS mounted
      FROM assets a WHERE a.id = ANY($1) ORDER BY a.sn`, [ids]);

    const blocked = blockers.rows.filter((r) => r.outbound || r.repair || r.lab || r.mounted);
    const safe = found.rows.filter((r) => !blocked.some((b) => b.sn === r.sn));

    line();
    if (blocked.length) {
      line(`⚠ 以下 ${blocked.length} 筆被其他資料參照，不會刪除：`);
      console.table(blocked.map((b) => ({
        序號: b.sn, 出貨借用明細: b.outbound, 維修明細: b.repair,
        實驗室調撥: b.lab, 有硬體掛載於此: b.mounted,
      })));
      line('  （要刪這些，請先處理掉對應的單據或掛載關係）');
      line();
    }

    line(`可安全刪除：${safe.length} 筆`);
    if (safe.length === 0) {
      line('沒有可安全刪除的資產，結束。');
      return;
    }

    if (!apply) {
      line();
      line('以上為預覽。確認無誤後，加上 --apply 才會真的刪除：');
      line(`  node scripts/delete-assets-by-sn.mjs ${fileArg || ''} --apply`);
      line();
      line('⚠ 刪除前請先備份：npm run backup');
      return;
    }

    // --- 實際刪除 -----------------------------------------------------------
    const safeIds = safe.map((r) => r.id);
    const masterIds = [...new Set(safe.map((r) => r.item_master_id))];

    await client.query('BEGIN');

    const del = await client.query('DELETE FROM assets WHERE id = ANY($1) RETURNING id', [safeIds]);
    if (del.rowCount !== safeIds.length) {
      throw new Error(`預期刪除 ${safeIds.length} 筆，實際 ${del.rowCount} 筆，已回滾。`);
    }

    // 已無任何資產、也沒有單據參照的品項主檔一併清掉，避免留下沒有卡片的空主檔
    const delMaster = await client.query(`
      DELETE FROM item_master i
      WHERE i.id = ANY($1)
        AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.item_master_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM inbound_items ii WHERE ii.item_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM outbound_items oi WHERE oi.item_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM item_lab_assignments la WHERE la.item_master_id = i.id)
      RETURNING id, brand, type, model`, [masterIds]);

    await client.query('COMMIT');

    line();
    line('='.repeat(62));
    line(`  已刪除 ${del.rowCount} 筆資產`);
    line('='.repeat(62));
    if (delMaster.rowCount) {
      line(`一併清除 ${delMaster.rowCount} 張已無卡片的品項主檔：`);
      delMaster.rows.forEach((m) => line(`  ${m.brand} / ${m.type} / ${m.model}`));
    } else {
      line('品項主檔仍有其他資產或單據參照，未清除。');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n執行失敗，所有變更已回滾：', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

main();
