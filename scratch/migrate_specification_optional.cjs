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
    console.log('Dropping NOT NULL constraint on purchase_records specification column...');
    await pool.query('ALTER TABLE purchase_records ALTER COLUMN specification DROP NOT NULL');
    console.log('Drop NOT NULL constraint succeeded!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    pool.end();
  }
}

migrate();
