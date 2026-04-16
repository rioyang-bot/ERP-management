import pg from 'pg';
import { sha256 } from 'js-sha256';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function fix() {
  try {
    const commonPassword = 'admin'; // 設定預設密碼為 admin
    const hashed = sha256(commonPassword);
    
    console.log(`Setting password for 'admin' and 'purchasing' to '${commonPassword}'`);
    console.log(`Hash: ${hashed}`);

    await pool.query("UPDATE users SET password_hash = $1 WHERE username = 'admin'", [hashed]);
    await pool.query("UPDATE users SET password_hash = $1 WHERE username = 'purchasing'", [hashed]);
    
    // 如果有其他常用密碼需求也可以在這裡一併修改
    // await pool.query("UPDATE users SET password_hash = $1 WHERE username = 'Rio'", [hashed]);

    console.log('Passwords updated successfully.');
  } catch (err) {
    console.error('Failed to update passwords:', err);
  } finally {
    await pool.end();
  }
}

fix();
