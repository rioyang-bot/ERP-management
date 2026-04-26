import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function debugDelete() {
  try {
    const brand = 'BlackCore'; // Example brand from previous logs
    const type = 'SERVER';    // Example type
    const category = '資訊設備';
    
    console.log(`Checking models for ${brand} / ${type}...`);
    const models = await pool.query(`
      SELECT m.name as model_name, t.name as type_name, b.name as brand_name, m.id as model_id
      FROM item_models m 
      JOIN item_types t ON m.type_id = t.id 
      JOIN item_brands b ON t.brand_id = b.id
      WHERE b.name = $1 AND t.name = $2
    `, [brand, type]);
    
    console.log('Results:', models.rows);
    
    if (models.rows.length > 0) {
        const modelName = models.rows[0].model_name;
        console.log(`Attempting to delete model: ${modelName}`);
        
        // Use the exact query from queries.js
        const q = `DELETE FROM item_models WHERE name = $1 AND type_id = (SELECT t.id FROM item_types t JOIN item_brands b ON t.brand_id = b.id WHERE b.name = $2 AND t.name = $3 AND b.category_id = (SELECT id FROM categories WHERE name = $4) AND t.category_id = (SELECT id FROM categories WHERE name = $4))`;
        
        const res = await pool.query(q, [modelName, brand, type, category]);
        console.log('Delete result rowCount:', res.rowCount);
    } else {
        console.log('No models found to test delete.');
    }
    
  } catch (err) {
    console.error('Error during debug:', err);
  } finally {
    await pool.end();
  }
}

debugDelete();
