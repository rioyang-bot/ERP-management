import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function checkConstraints() {
  try {
    const res = await pool.query(`
      SELECT conname, relname 
      FROM pg_constraint c 
      JOIN pg_class r ON c.conrelid = r.oid 
      WHERE relname IN ('inbound_items', 'outbound_items')
    `);
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkConstraints();
