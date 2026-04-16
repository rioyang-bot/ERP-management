import pg from 'pg';

const pool = new pg.Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function migrate() {
  try {
    console.log('開始執行第二階段資料庫遷移 (model -> brand)...');

    // 1. 重新命名欄位 (將原本的 model 改名為 brand)
    await pool.query('ALTER TABLE items RENAME COLUMN model TO brand;');
    console.log('1. items.model 已重新命名為 items.brand');

    // 2. 重新建立 View (反映 type 與 brand 的新結構)
    await pool.query('DROP VIEW IF EXISTS v_inventory_summary;');
    await pool.query(`
      CREATE OR REPLACE VIEW v_inventory_summary AS
      SELECT 
          i.id AS item_id,
          i.sn AS master_sn,
          i.name AS item_name,
          i.type,
          i.brand,
          i.specification,
          i.custodian,
          i.unit,
          i.safety_stock,
          i.purchase_price,
          i.currency,
          i.image_path,
          -- 實體庫存 (Physical Qty) = 總進貨 - 總出貨
          COALESCE(inbound.total_in, 0) - COALESCE(outbound.total_shipped, 0) AS physical_qty,
          -- 鎖定數量 (Locked Qty) = 申請中但尚未出貨
          COALESCE(outbound.total_locked, 0) AS locked_qty,
          -- 可用庫存 (Available Qty) = 實體庫存 - 鎖定數量
          (COALESCE(inbound.total_in, 0) - COALESCE(outbound.total_shipped, 0)) - COALESCE(outbound.total_locked, 0) AS available_qty
      FROM items i
      LEFT JOIN (
          SELECT item_id, SUM(quantity) as total_in 
          FROM inbound_items 
          JOIN inbound_orders io ON inbound_items.inbound_order_id = io.id
          WHERE io.status = 'COMPLETED'
          GROUP BY item_id
      ) inbound ON i.id = inbound.item_id
      LEFT JOIN (
          SELECT 
              oi.item_id,
              SUM(CASE WHEN o.status = 'SHIPPED' THEN oi.quantity ELSE 0 END) as total_shipped,
              SUM(CASE WHEN o.status = 'PENDING' THEN oi.quantity ELSE 0 END) as total_locked
          FROM outbound_items oi
          JOIN outbound_requests o ON oi.request_id = o.id
          GROUP BY oi.item_id
      ) outbound ON i.id = outbound.item_id;
    `);
    console.log('2. v_inventory_summary 視圖已更新 (含 type, brand)');

    console.log('資料庫遷移完成！');
  } catch (err) {
    console.error('遷移失敗：', err);
  } finally {
    await pool.end();
  }
}

migrate();
