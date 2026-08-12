const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'admin123',
  port: 5432,
});

async function testQuery() {
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `PO-${today}-`;
    const res = await pool.query(`
      WITH seqs AS (
          SELECT CAST(SUBSTRING(order_no FROM '-([0-9]+)$') AS INTEGER) as sq
          FROM purchase_records
          WHERE order_no LIKE $1 || '%'
      )
      SELECT s.val as count
      FROM generate_series(1, 1000) as s(val)
      WHERE NOT EXISTS (SELECT 1 FROM seqs WHERE seqs.sq = s.val)
      ORDER BY s.val ASC
      LIMIT 1;
    `, [prefix]);
    console.log("Next gap filled number:", res.rows[0]);
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    pool.end();
  }
}

testQuery();
