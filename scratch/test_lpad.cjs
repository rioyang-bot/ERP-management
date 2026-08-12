const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'admin123',
  port: 5432,
});

async function test() {
  try {
    const res = await pool.query("SELECT lpad('100', 2, '0') as pad_test");
    console.log(res.rows[0]);
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    pool.end();
  }
}

test();
