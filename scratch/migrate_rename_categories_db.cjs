const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'admin123',
  port: 5432,
});

async function migrate() {
  try {
    console.log('Renaming categories in DB...');
    const res1 = await pool.query("UPDATE categories SET name = '設備' WHERE name = '資訊設備'");
    console.log('Renamed 資訊設備:', res1.rowCount);

    const res2 = await pool.query("UPDATE categories SET name = '耗材' WHERE name = '辦公耗材'");
    console.log('Renamed 辦公耗材:', res2.rowCount);

    console.log('Successfully completed DB renaming!');
  } catch (err) {
    console.error('Renaming failed:', err);
  } finally {
    pool.end();
  }
}

migrate();
