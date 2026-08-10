import pg from 'pg';

const pool = new pg.Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db', 
  password: 'admin123',
  port: 5432,
});

console.log('Attempting to connect to PostgreSQL database (ERP_db)...');

pool.query('SELECT NOW()')
  .then(res => {
    console.log('✅ Successfully connected to the database.');
    console.log('✅ Database server time:', res.rows[0].now);
  })
  .catch(err => {
    console.error('❌ Failed to connect to the database.');
    console.error(err.message || err);
  })
  .finally(() => {
    pool.end();
  });
