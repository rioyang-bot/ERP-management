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
    const records = await pool.query("SELECT * FROM purchase_records WHERE order_no = 'PO-TEST-001'");
    console.log(records.rows);
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    pool.end();
  }
}

check();
