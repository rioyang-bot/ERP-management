// ============================================================================
// 刪除進貨單並還原它造成的異動
// ----------------------------------------------------------------------------
// 用途：進貨單建錯了要整張移除。單純刪掉單據是不夠的 —— 入庫當下還做了
//       建立資產、增加庫存、回寫採購單已入庫數量，這些都要一併還原，
//       否則帳面會與實物對不起來。
//
// 用法（在專案資料夾執行）：
//   node scripts/delete-inbound-order.mjs IN-20260914-01            預覽，不會刪
//   node scripts/delete-inbound-order.mjs IN-20260914-01 --apply    確認後真的刪除
//
// 會還原的項目（與建立進貨單的動作一一對應）：
//   1. 該單建立的資產（依明細的序號比對）
//   2. 入庫時加上的庫存數量
//   3. 採購單的已入庫數量與狀態（若該明細來自採購單）
//   4. 進貨明細與進貨單本身
//
// 安全設計：
//   1. 預設只預覽，要加 --apply 才會真的刪除。
//   2. 資產若已經被動用過（出貨、借用、維修、實驗室調撥，或有硬體掛載於其上），
//      一律不刪並中止整個作業 —— 那代表這批貨已經流出去了，
//      不該用「刪除進貨單」來處理，應該走退貨或報廢流程。
//   3. 整批在單一交易中執行，任一步失敗全部回滾。
//
// 執行前請先備份：npm run backup
// ============================================================================

import 'dotenv/config';
import pg from 'pg';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const orderNo = args.find((a) => !a.startsWith('--'));

if (!orderNo) {
  console.error('請指定進貨單號。用法：node scripts/delete-inbound-order.mjs IN-20260914-01 [--apply]');
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
    line('='.repeat(66));
    line('  刪除進貨單並還原異動');
    line('='.repeat(66));
    line(`資料庫：${process.env.DB_HOST || 'localhost'} / ${process.env.DB_NAME || 'ERP_db'}`);
    line(`單號　：${orderNo}`);
    line(`模式　：${apply ? '⚠ 實際刪除 (--apply)' : '預覽（不會更動任何資料）'}`);
    line();

    const ord = await client.query(
      'SELECT id, order_no, partner_id, invoice_no, status, created_at FROM inbound_orders WHERE order_no = $1',
      [orderNo]);
    if (ord.rowCount === 0) {
      line(`查無進貨單 ${orderNo}，結束。`);
      return;
    }
    const order = ord.rows[0];
    line(`找到進貨單 #${order.id}，建立於 ${new Date(order.created_at).toLocaleString()}`);

    const items = await client.query(`
      SELECT ii.id, ii.item_id, ii.sn, ii.quantity, ii.purchase_record_id,
             i.brand, i.model, i.specification, c.name AS category
      FROM inbound_items ii
      LEFT JOIN item_master i ON ii.item_id = i.id
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE ii.inbound_order_id = $1
      ORDER BY ii.id`, [order.id]);

    line(`明細 ${items.rowCount} 筆：`);
    console.table(items.rows.map((r) => ({
      品項: `${r.brand || ''} ${r.model || ''}`.trim(), 類別: r.category,
      序號: r.sn || '（無）', 數量: r.quantity,
      來源採購單: r.purchase_record_id || '非採購入庫',
    })));

    // --- 對應的資產 -------------------------------------------------------
    const sns = items.rows.map((r) => (r.sn || '').trim()).filter(Boolean);
    const assets = sns.length ? await client.query(`
      SELECT a.id, TRIM(a.sn) AS sn, a.status, c.name AS category
      FROM assets a JOIN item_master i ON a.item_master_id = i.id
      JOIN categories c ON i.category_id = c.id
      WHERE TRIM(a.sn) = ANY($1) ORDER BY a.sn`, [sns]) : { rows: [], rowCount: 0 };

    line(`\n該單建立的資產 ${assets.rowCount} 筆`);
    if (assets.rowCount) {
      console.table(assets.rows.map((r) => ({ 序號: r.sn, 類別: r.category, 狀態: r.status })));
    }

    // --- 是否已經被動用 ---------------------------------------------------
    if (assets.rowCount) {
      const ids = assets.rows.map((r) => r.id);
      const used = await client.query(`
        SELECT TRIM(a.sn) AS sn,
          (SELECT count(*) FROM outbound_items oi WHERE TRIM(oi.sn) = TRIM(a.sn))::int AS outbound,
          (SELECT count(*) FROM repair_items ri WHERE TRIM(ri.sn) = TRIM(a.sn))::int AS repair,
          (SELECT count(*) FROM item_lab_assignments la WHERE la.asset_id = a.id)::int AS lab,
          (SELECT count(*) FROM assets x
            WHERE TRIM(LOWER(x.custom_attributes->>'server_sn')) = TRIM(LOWER(a.sn)))::int AS mounted
        FROM assets a WHERE a.id = ANY($1)`, [ids]);
      const blocked = used.rows.filter((r) => r.outbound || r.repair || r.lab || r.mounted);
      if (blocked.length) {
        line('\n⚠ 以下資產已經被動用過，不能用「刪除進貨單」處理：');
        console.table(blocked.map((b) => ({
          序號: b.sn, 出貨借用: b.outbound, 維修: b.repair, 實驗室調撥: b.lab, 有硬體掛載於此: b.mounted,
        })));
        line('  這代表這批貨已經流出去了，請改走退貨或報廢流程。作業中止。');
        return;
      }
    }

    // --- 預覽將要還原的內容 -----------------------------------------------
    line('\n將要還原的異動：');
    const stockBack = items.rows.map((r) => ({
      品項: `${r.brand || ''} ${r.model || ''}`.trim(), 扣回庫存: r.quantity,
    }));
    console.table(stockBack);
    const poRows = items.rows.filter((r) => r.purchase_record_id);
    if (poRows.length) {
      line(`採購單已入庫數量將退回 ${poRows.length} 筆`);
    } else {
      line('沒有來自採購單的明細，不需要退回採購數量。');
    }

    if (!apply) {
      line();
      line('以上為預覽。確認無誤後，加上 --apply 才會真的刪除：');
      line(`  node scripts/delete-inbound-order.mjs ${orderNo} --apply`);
      line();
      line('⚠ 刪除前請先備份：npm run backup');
      return;
    }

    // --- 實際刪除 ---------------------------------------------------------
    await client.query('BEGIN');

    // 1. 扣回入庫時加上的庫存
    for (const r of items.rows) {
      if (!r.item_id) continue;
      await client.query(
        'UPDATE item_master SET stock_qty = GREATEST(COALESCE(stock_qty, 0) - $1, 0) WHERE id = $2',
        [r.quantity, r.item_id]);
    }

    // 2. 退回採購單的已入庫數量與狀態
    for (const r of poRows) {
      await client.query(`
        UPDATE purchase_records SET
          received_quantity = GREATEST(COALESCE(received_quantity, 0) - $1, 0),
          status = CASE
            WHEN GREATEST(COALESCE(received_quantity, 0) - $1, 0) <= 0 THEN 'ORDERED'
            WHEN GREATEST(COALESCE(received_quantity, 0) - $1, 0) >= quantity THEN 'COMPLETED'
            ELSE 'PARTIAL' END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`, [r.quantity, r.purchase_record_id]);
    }

    // 3. 刪除該單建立的資產
    let deletedAssets = 0;
    if (assets.rowCount) {
      const del = await client.query('DELETE FROM assets WHERE id = ANY($1) RETURNING id',
        [assets.rows.map((r) => r.id)]);
      deletedAssets = del.rowCount;
      if (deletedAssets !== assets.rowCount) {
        throw new Error(`預期刪除 ${assets.rowCount} 筆資產，實際 ${deletedAssets} 筆，已回滾。`);
      }
    }

    // 4. 刪除進貨單（明細由外鍵連動刪除）
    const delOrder = await client.query('DELETE FROM inbound_orders WHERE id = $1 RETURNING id', [order.id]);
    if (delOrder.rowCount !== 1) throw new Error('刪除進貨單失敗，已回滾。');

    await client.query('COMMIT');

    line();
    line('='.repeat(66));
    line('  完成');
    line('='.repeat(66));
    line(`進貨單 ${orderNo} 已刪除`);
    line(`刪除資產 ${deletedAssets} 筆`);
    line(`扣回庫存 ${items.rowCount} 個品項`);
    line(`退回採購數量 ${poRows.length} 筆`);
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
