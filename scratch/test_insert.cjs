const { Pool } = require('pg');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'admin123',
  port: 5432,
});

async function run() {
  try {
    const res = await pool.query(`
      INSERT INTO purchase_records (order_no, partner_id, category_id, item_type, brand, model, specification, unit, quantity, purchaser_id, status, remarks, project_name, unit_price) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0)
    `, [
      'PO-TEMP-002',
      1, // partner_id
      1, // category_id
      '類型',
      '廠牌',
      '3122-SM Plus',
      null, // specification
      '台',
      1, // quantity
      1, // purchaser_id
      'ORDERED',
      '備註',
      '專案'
    ]);
    console.log('Insert Succeeded:', res.rowCount);
  } catch (err) {
    console.error('Error details:', err);
  } finally {
    pool.end();
  }
}
run();
