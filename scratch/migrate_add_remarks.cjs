const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'admin123',
  port: 5432,
});

async function migrate() {
  try {
    console.log('Adding column remarks to purchase_records table...');
    await pool.query('ALTER TABLE purchase_records ADD COLUMN IF NOT EXISTS remarks TEXT');
    console.log('Add column succeeded!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    pool.end();
  }
}

migrate();
