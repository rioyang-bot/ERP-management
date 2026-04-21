const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Drop tracking view first!
    await client.query('DROP VIEW IF EXISTS v_inventory_summary');

    // Rename items to item_master
    await client.query('ALTER TABLE items RENAME TO item_master');
    
    // Create assets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS assets (
          id SERIAL PRIMARY KEY,
          item_master_id INTEGER REFERENCES item_master(id) ON DELETE CASCADE,
          sn VARCHAR(100) UNIQUE,
          hostname VARCHAR(100),
          client VARCHAR(100),
          location VARCHAR(100),
          status VARCHAR(20) DEFAULT 'ACTIVE',
          installed_date DATE,
          system_date DATE,
          warranty_expire DATE,
          customer_warranty_expire DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Migrate ASSET records
    await client.query(`
      INSERT INTO assets (item_master_id, sn, hostname, client, location, status, installed_date, system_date, warranty_expire, customer_warranty_expire)
      SELECT id, sn, hostname, client, location, status, installed_date, system_date, warranty_expire, customer_warranty_expire
      FROM item_master
      WHERE category_id = (SELECT id FROM categories WHERE name = '資訊設備');
    `);
    
    // Drop the asset specific columns from item_master
    await client.query(`
      ALTER TABLE item_master 
      DROP COLUMN IF EXISTS sn, 
      DROP COLUMN IF EXISTS hostname, 
      DROP COLUMN IF EXISTS client, 
      DROP COLUMN IF EXISTS location, 
      DROP COLUMN IF EXISTS status, 
      DROP COLUMN IF EXISTS installed_date, 
      DROP COLUMN IF EXISTS system_date, 
      DROP COLUMN IF EXISTS warranty_expire, 
      DROP COLUMN IF EXISTS customer_warranty_expire;
    `);

    // Recreate tracking view using item_master
    await client.query(`
      CREATE VIEW v_inventory_summary AS
      SELECT 
          i.id AS item_id,
          null AS master_sn,
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
      FROM item_master i
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

    await client.query('COMMIT');
    console.log('Migration successful');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', e);
  } finally {
    client.release();
    pool.end();
  }
}

run();
