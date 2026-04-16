import pg from 'pg';

const { Pool } = pg;

// 預設資料庫設定
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

// 加入連線錯誤監聽
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export const query = (text, params) => pool.query(text, params);

export default pool;
