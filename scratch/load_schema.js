import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'admin123',
  database: 'ERP_db'
});

async function loadSchema() {
  try {
    const schemaSql = fs.readFileSync('database/schema.sql', 'utf8');
    await pool.query(schemaSql);
    console.log('Schema loaded successfully.');
    
    // Check if seed_db.js exists, if it does, run it? No just schema is fine.
  } catch(err) {
    console.error('Failed to load schema:', err);
  } finally {
    await pool.end();
  }
}

loadSchema();
