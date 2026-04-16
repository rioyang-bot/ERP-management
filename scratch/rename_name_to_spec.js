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
    console.log('開始執行資料庫完整變更 (View + Column Rename)...');

    // 1. 刪除依賴視圖
    await pool.query("DROP VIEW IF EXISTS v_inventory_summary;");
    console.log('1. 已暫時刪除視圖 v_inventory_summary');

    // 2. 處理 specification 欄位衝突
    await pool.query("ALTER TABLE items DROP COLUMN IF EXISTS specification;");
    console.log('2. 已移除舊有的 specification 欄位');

    // 3. 將 name 欄位更名為 specification
    await pool.query("ALTER TABLE items RENAME COLUMN name TO specification;");
    console.log('3. 已將 name 欄位更名為 specification');

    // 4. 重建視圖 (將 item_name 對應到新的 specification 欄位)
    await pool.query(`
      CREATE OR REPLACE VIEW v_inventory_summary AS
      SELECT 
          i.id AS item_id,
          i.sn AS master_sn,
          i.specification AS item_name, -- 舊的 item_name 現在對應到新的規格欄位
          i.type,
          i.brand,
          i.specification,               -- 這裡直接輸出規格欄位
          i.custodian,
          i.unit,
          i.safety_stock,
          i.purchase_price,
          i.currency,
          i.image_path,
          COALESCE(inbound.total_in, 0) - COALESCE(outbound.total_shipped, 0) AS physical_qty,
          COALESCE(outbound.total_locked, 0) AS locked_qty,
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
    console.log('4. 已重建視圖 v_inventory_summary');

    console.log('資料庫欄位與視圖變更完成！');
  } catch (err) {
    console.error('變更失敗：', err);
  } finally {
    await pool.end();
  }
}

migrate();
