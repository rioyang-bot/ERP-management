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
    console.log('Adding ON DELETE CASCADE to items references...');
    
    // inbound_items
    await pool.query(`
      ALTER TABLE inbound_items 
      DROP CONSTRAINT IF EXISTS inbound_items_item_id_fkey;
    `);
    await pool.query(`
      ALTER TABLE inbound_items 
      ADD CONSTRAINT inbound_items_item_id_fkey 
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE;
    `);
    console.log('Fixed inbound_items');

    // outbound_items
    await pool.query(`
      ALTER TABLE outbound_items 
      DROP CONSTRAINT IF EXISTS outbound_items_item_id_fkey;
    `);
    await pool.query(`
      ALTER TABLE outbound_items 
      ADD CONSTRAINT outbound_items_item_id_fkey 
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE;
    `);
    console.log('Fixed outbound_items');

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
