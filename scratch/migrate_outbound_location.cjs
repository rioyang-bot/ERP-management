const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'admin123',
  port: 5432,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('Adding location column to outbound_items...');
    await client.query(`ALTER TABLE outbound_items ADD COLUMN IF NOT EXISTS location VARCHAR(255);`);
    console.log('Successfully added location column to outbound_items.');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

main();
