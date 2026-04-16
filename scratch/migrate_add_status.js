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
    console.log('Running migration: Adding status column to items table...');
    await pool.query("ALTER TABLE items ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';");
    console.log('Migration successful.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
