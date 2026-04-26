import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function checkRelationships() {
  try {
    const res = await pool.query(`
        SELECT t.id as type_id, t.name as type_name, t.category_id as type_cat, 
               b.id as brand_id, b.name as brand_name, b.category_id as brand_cat
        FROM item_types t 
        JOIN item_brands b ON t.brand_id = b.id 
        LIMIT 20
    `);
    console.log('Results:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkRelationships();
