import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'admin123',
  database: 'postgres'
});
pool.query('CREATE DATABASE "ERP_db"')
  .then(() => console.log('Database ERP_db created!'))
  .catch(err => {
    if(err.code === '42P04') console.log('Database ERP_db already exists');
    else console.error(err);
  })
  .finally(() => pool.end());
