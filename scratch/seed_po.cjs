const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'admin123',
  port: 5432,
});

async function seed() {
  try {
    await pool.query(`
      INSERT INTO purchase_records 
      (order_no, category_id, item_type, brand, model, specification, unit, unit_price, quantity, status) 
      VALUES 
      ('PO-TEST-001', (SELECT id FROM categories LIMIT 1), 'Test Type', 'Test Brand', 'Test Model', 'Test Spec', '個', 100, 5, 'ORDERED')
    `);
    console.log("Seeded PO-TEST-001");
  } catch (err) {
    console.error('Failed to seed:', err);
  } finally {
    pool.end();
  }
}

seed();
