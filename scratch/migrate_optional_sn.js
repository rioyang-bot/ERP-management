import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function migrate() {
  try {
    console.log('Dropping NOT NULL constraint from items.sn...');
    await pool.query(`ALTER TABLE items ALTER COLUMN sn DROP NOT NULL;`);
    console.log('Successfully updated items table.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
