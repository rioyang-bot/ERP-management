import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db', 
  password: 'admin123',
  port: 5432,
});

async function renameAdmin() {
  try {
    const client = await pool.connect();
    console.log("資料庫連接成功！");
    
    // 將所有 username = 'admin' 更新為 'METECH'
    const res = await client.query("UPDATE users SET username = 'METECH' WHERE username = 'admin'");
    console.log(`成功更新了 ${res.rowCount} 筆系統管理員帳號。`);
    
    client.release();
  } catch (err) {
    console.error("更新失敗:", err.message);
  } finally {
    pool.end();
  }
}

renameAdmin();
