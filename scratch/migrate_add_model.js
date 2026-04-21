import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function migrate() {
  try {
    console.log('Adding model column to items and purchase_records...');
    
    // 1. Update items table
    await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS model VARCHAR(100);`);
    console.log('Updated items table');

    // 2. Update purchase_records table
    await pool.query(`ALTER TABLE purchase_records ADD COLUMN IF NOT EXISTS model VARCHAR(100);`);
    console.log('Updated purchase_records table');

    // 3. Update v_inventory_summary view
    await pool.query(`DROP VIEW IF EXISTS v_inventory_summary;`);
    await pool.query(`
      CREATE VIEW v_inventory_summary AS
      SELECT 
          i.id AS item_id,
          i.sn AS master_sn,
          i.specification AS item_name,
          i.type,
          i.brand,
          i.model,
          i.specification,
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
    console.log('Updated v_inventory_summary view');

    console.log('Database migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
