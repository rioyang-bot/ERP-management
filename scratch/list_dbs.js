import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'admin123',
  database: 'postgres'
});
pool.query('SELECT datname FROM pg_database')
  .then(res => console.log('Databases:', res.rows.map(r => r.datname).join(', ')))
  .catch(err => console.error(err))
  .finally(() => pool.end());
