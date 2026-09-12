import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

// 資料庫連線設定一律由環境變數提供（專案根目錄的 .env）。
// 請勿把密碼寫死在程式碼中 —— 本檔案會進入版本控制。
const required = ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  throw new Error(
    `資料庫設定不完整，缺少環境變數：${missing.join(', ')}。\n` +
    '請在專案根目錄建立 .env 並設定 DB_USER / DB_HOST / DB_NAME / DB_PASSWORD / DB_PORT。'
  );
}

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

// 加入連線錯誤監聽
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export const query = (text, params) => pool.query(text, params);

export default pool;
