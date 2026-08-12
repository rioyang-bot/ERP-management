const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'admin123',
  port: 5432,
});

async function check() {
  try {
    const res = await pool.query("SELECT * FROM purchase_records");
    console.log(`Current DB records:`, res.rowCount);
    console.log(res.rows);
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    pool.end();
  }
}

check();
