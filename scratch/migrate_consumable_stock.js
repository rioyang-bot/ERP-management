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
    console.log('Migrating: Adding stock_qty and lab_qty to item_master...');
    
    // 1. Add columns to item_master
    await pool.query(`ALTER TABLE item_master ADD COLUMN IF NOT EXISTS stock_qty INTEGER DEFAULT 0;`);
    await pool.query(`ALTER TABLE item_master ADD COLUMN IF NOT EXISTS lab_qty INTEGER DEFAULT 0;`);
    console.log('Added stock_qty and lab_qty columns');

    // 2. Create item_lab_assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS item_lab_assignments (
          id SERIAL PRIMARY KEY,
          item_master_id INTEGER REFERENCES item_master(id) ON DELETE CASCADE,
          asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          note TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created item_lab_assignments table');

    // 3. Initialize stock_qty for existing items
    await pool.query(`
      UPDATE item_master 
      SET stock_qty = sub.physical_qty
      FROM (
          SELECT 
              i.id,
              COALESCE(inbound.total_in, 0) - COALESCE(outbound.total_shipped, 0) AS physical_qty
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
                  SUM(CASE WHEN o.status = 'SHIPPED' THEN oi.quantity ELSE 0 END) as total_shipped
              FROM outbound_items oi
              JOIN outbound_requests o ON oi.request_id = o.id
              GROUP BY oi.item_id
          ) outbound ON i.id = outbound.item_id
      ) sub
      WHERE item_master.id = sub.id AND item_master.stock_qty = 0 AND item_master.lab_qty = 0;
    `);
    console.log('Initialized stock_qty for existing items');

    console.log('Database migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
