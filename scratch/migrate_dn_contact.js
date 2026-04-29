import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

const migrationSQL = `
-- 為 outbound_requests 增加聯絡資訊欄位
ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS contact_info VARCHAR(255);
`;

async function run() {
  try {
    console.log('Adding contact_info to outbound_requests...');
    await pool.query(migrationSQL);
    console.log('SUCCESS: Database schema updated.');
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await pool.end();
  }
}

run();
