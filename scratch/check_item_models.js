import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function checkItemModels() {
  try {
    const res = await pool.query("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'item_models'");
    console.log('Columns:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkItemModels();
