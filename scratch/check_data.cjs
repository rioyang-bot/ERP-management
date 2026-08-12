const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'admin123',
  port: 5432,
});

async function run() {
  try {
    const categories = await pool.query('SELECT * FROM categories');
    console.log('Categories:');
    categories.rows.forEach(r => console.log(` - ${r.id}: ${r.name}`));
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
