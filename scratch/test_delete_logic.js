import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function testDelete() {
  try {
    const modelName = '3122-SM+';
    const brand = 'BlackCore';
    const type = 'Server';
    const category = '資訊設備';
    
    // 1. Test subquery first
    const subquery = `
        SELECT t.id FROM item_types t 
        JOIN item_brands b ON t.brand_id = b.id 
        WHERE b.name = $1 AND t.name = $2 
        AND b.category_id = (SELECT id FROM categories WHERE name = $3) 
        AND t.category_id = (SELECT id FROM categories WHERE name = $3)
    `;
    console.log('Running subquery...');
    const subRes = await pool.query(subquery, [brand, type, category]);
    console.log('Subquery result:', subRes.rows);
    
    if (subRes.rows.length === 1) {
        const typeId = subRes.rows[0].id;
        console.log(`Found type_id: ${typeId}. Attempting delete...`);
        
        const deleteQ = `DELETE FROM item_models WHERE name = $1 AND type_id = $2`;
        const delRes = await pool.query(deleteQ, [modelName, typeId]);
        console.log('Delete result rowCount:', delRes.rowCount);
    } else if (subRes.rows.length > 1) {
        console.log('Error: Multiple type IDs found!');
    } else {
        console.log('Error: No type ID found!');
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

testDelete();
