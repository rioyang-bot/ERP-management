import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function checkItemMaster() {
  try {
    console.log('Checking columns for item_master...');
    const res = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'item_master'`);
    console.log('item_master columns:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkItemMaster();
