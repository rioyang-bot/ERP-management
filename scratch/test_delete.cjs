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
    const res = await pool.query("DELETE FROM purchase_records WHERE order_no = 'PO-20260811-01'");
    console.log(`Deleted rows:`, res.rowCount);
  } catch (err) {
    console.error('Failed delete:', err);
  } finally {
    pool.end();
  }
}

check();
