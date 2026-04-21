const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function run() {
  const res = await pool.query(`SELECT count(*) FROM items`);
  console.log('Items count:', res.rows[0].count);
  const res2 = await pool.query(`SELECT count(*) FROM purchase_records`);
  console.log('Purchase records count:', res2.rows[0].count);
  pool.end();
}
run();
