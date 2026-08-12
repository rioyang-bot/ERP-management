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
    console.log('Running migration...');
    // 1. Remove UNIQUE constraint on purchase_records.order_no so multiple items per order work
    await pool.query(`
      ALTER TABLE purchase_records DROP CONSTRAINT IF EXISTS purchase_records_order_no_key;
    `);
    console.log('Removed UNIQUE constraint from order_no if existed.');

    // 2. Add project_name column to purchase_records table
    await pool.query(`
      ALTER TABLE purchase_records ADD COLUMN IF NOT EXISTS project_name VARCHAR(100);
    `);
    console.log('Added project_name column to purchase_records table if not existed.');

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    pool.end();
  }
}

migrate();
