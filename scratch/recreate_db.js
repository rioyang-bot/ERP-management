import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'admin123',
  database: 'postgres'
});

async function run() {
  try {
    // Terminate all other connections to ERP_db
    await pool.query(`SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = 'ERP_db' AND pid <> pg_backend_pid();`);
    await pool.query('DROP DATABASE IF EXISTS "ERP_db"');
    await pool.query('CREATE DATABASE "ERP_db"');
    console.log('Database ERP_db recreated cleanly.');
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
