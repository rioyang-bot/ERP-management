import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function renameCategory() {
  try {
    const res = await pool.query("UPDATE categories SET name = '硬體' WHERE name = '網卡'");
    console.log(`Successfully renamed category. Rows affected: ${res.rowCount}`);
  } catch (err) {
    console.error('Error renaming category:', err);
  } finally {
    await pool.end();
  }
}

renameCategory();
