import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'admin123',
  database: 'ERP_db'
});

async function run() {
  try {
    const client = await pool.connect();
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS menu_access JSONB DEFAULT '{}'::jsonb;`);
    
    // As per the migrate_menu_access, we can grant all for admin or just leave it blank, but the frontend likely uses this to show menus.
    // Let's grant some defaults if needed. Or just leave it as {} for now.
    await client.query(`
      UPDATE users 
      SET menu_access = '{"consumableList": true, "inventoryList": true, "inboundList": true, "outboundList": true, "settings": true}'::jsonb 
      WHERE username = 'admin';
    `);
    
    console.log('Successfully added menu_access column and granted features to admin.');
    client.release();
  } catch (err) {
    console.error('Failed to add column:', err);
  } finally {
    pool.end();
  }
}
run();
