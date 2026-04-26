import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function checkSchema() {
  try {
    console.log('Checking columns for item_types...');
    const typesRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'item_types'`);
    console.log('item_types columns:', typesRes.rows.map(r => r.column_name));

    console.log('Checking columns for item_brands...');
    const brandsRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'item_brands'`);
    console.log('item_brands columns:', brandsRes.rows.map(r => r.column_name));
    
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkSchema();
