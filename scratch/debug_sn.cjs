const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function findSn() {
  const sn = 'BC025780';
  console.log(`Searching for SN: "${sn}"`);
  
  try {
    // Exact match
    const res = await pool.query('SELECT a.id, a.sn, i.brand, i.model FROM assets a JOIN item_master i ON a.item_master_id = i.id WHERE a.sn = $1', [sn]);
    console.log('Exact match results:', res.rows);

    // Case insensitive match
    const res2 = await pool.query('SELECT a.id, a.sn, i.brand, i.model FROM assets a JOIN item_master i ON a.item_master_id = i.id WHERE LOWER(a.sn) = LOWER($1)', [sn]);
    console.log('ILike match results:', res2.rows);

    // Partial match
    const res3 = await pool.query('SELECT a.id, a.sn, i.brand, i.model FROM assets a JOIN item_master i ON a.item_master_id = i.id WHERE a.sn LIKE $1', [`%${sn}%`]);
    console.log('Partial match results:', res3.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

findSn();
