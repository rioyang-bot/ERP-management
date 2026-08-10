import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db', 
  password: 'Admin123',
  port: 5432,
});

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log("資料庫連接成功！ (Database connection successful!)");
    const res = await client.query('SELECT NOW() as time, version() as version');
    console.log("當前資料庫時間 (DB Time):", res.rows[0].time);
    console.log("資料庫版本 (DB Version):", res.rows[0].version);
    client.release();
  } catch (err) {
    console.error("資料庫連接失敗 (Database connection failed):", err.message);
  } finally {
    pool.end();
  }
}

testConnection();
