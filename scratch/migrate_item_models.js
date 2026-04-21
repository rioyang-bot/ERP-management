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
    console.log('Creating item_models table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS item_models (
          id SERIAL PRIMARY KEY,
          type_id INTEGER REFERENCES item_types(id) ON DELETE CASCADE,
          name VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type_id, name)
      );
    `);
    console.log('Successfully created item_models table.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
