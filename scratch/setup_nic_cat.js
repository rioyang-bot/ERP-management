import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function setupNicCategory() {
  try {
    console.log('正在檢查並新增網卡類別...');
    await pool.query(`
      INSERT INTO categories (name, description) 
      VALUES ('網卡', '伺服器網路介面卡相關設備') 
      ON CONFLICT (name) DO NOTHING
    `);
    console.log('網卡類別已就緒。');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

setupNicCategory();
