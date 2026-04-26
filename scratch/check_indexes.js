import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function checkIndexes() {
  try {
    const res = await pool.query(`
      SELECT 
        conname as constraint_name,
        pg_get_constraintdef(c.oid) as definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'item_brands'::regclass;
    `);
    console.log('Constraints on item_brands:');
    console.table(res.rows);
  } catch (err) {
    console.error('Error checking indexes:', err);
  } finally {
    await pool.end();
  }
}

checkIndexes();
