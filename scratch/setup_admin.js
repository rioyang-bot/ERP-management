import pg from 'pg';
import { sha256 } from 'js-sha256';

const { Pool } = pg;
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'admin123',
  database: 'ERP_db'
});

async function run() {
  try {
    const hashedPassword = sha256('admin');
    const query = `
      INSERT INTO users (username, password_hash, role, full_name, is_active)
      VALUES ('admin', $1, 'ADMIN', '系統與帳號管理員', TRUE)
      ON CONFLICT (username) DO UPDATE 
      SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, is_active = EXCLUDED.is_active;
    `;
    const client = await pool.connect();
    await client.query(query, [hashedPassword]);
    console.log('Successfully created/updated admin account!');
    client.release();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
