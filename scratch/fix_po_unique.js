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
    console.log('Removing UNIQUE constraint on purchase_records.order_no...');
    await pool.query(`
      ALTER TABLE purchase_records DROP CONSTRAINT IF EXISTS purchase_records_order_no_key;
    `);
    console.log('Successfully updated purchase_records table.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
