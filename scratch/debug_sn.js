import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function debugSn() {
  const sn = 'X0343982';
  console.log(`--- Debugging SN: ${sn} ---`);
  try {
    const res = await pool.query(`
      SELECT a.id, a.sn, i.brand, i.model, i.type, c.name as category 
      FROM assets a 
      JOIN item_master i ON a.item_master_id = i.id 
      LEFT JOIN categories c ON i.category_id = c.id 
      WHERE a.sn = $1
    `, [sn]);

    if (res.rows.length > 0) {
      console.log('FOUND MATCHING RECORD:');
      console.table(res.rows);
    } else {
      console.log('No record found with this SN in the assets table.');
    }
  } catch (err) {
    console.error('Database Error:', err.message);
  } finally {
    await pool.end();
  }
}

debugSn();
