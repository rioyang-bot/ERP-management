import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'admin123',
  port: 5432,
});

async function migrate() {
  try {
    // 1. Add ownership column to assets
    await pool.query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS ownership VARCHAR(20) DEFAULT 'FOR_SALE'`);
    
    // 2. Add request_type to outbound_requests
    await pool.query(`ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) DEFAULT 'SALE'`);
    
    // 3. Add expected_return_date to outbound_requests
    await pool.query(`ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS expected_return_date DATE`);
    
    console.log('Migration successful');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    pool.end();
  }
}

migrate();
