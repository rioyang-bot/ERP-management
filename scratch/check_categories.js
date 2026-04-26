import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function checkCategories() {
  try {
    const res = await pool.query('SELECT * FROM categories');
    console.log('Categories:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkCategories();
