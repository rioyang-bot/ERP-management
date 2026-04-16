import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'Admin123',
  database: 'ERP_db'
});

async function test() {
  try {
    console.log('Testing connection...');
    const res = await pool.query('SELECT current_database(), current_user');
    console.log('Connection OK:', res.rows[0]);
    
    const users = await pool.query('SELECT username, role, full_name, is_active FROM users');
    console.log('Users in DB:', users.rows);
  } catch (err) {
    console.error('Database Connection Failed:', err.message);
  } finally {
    await pool.end();
  }
}

test();
