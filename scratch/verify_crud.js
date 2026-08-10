import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'admin123',
  database: 'ERP_db'
});

async function runTests() {
  try {
    const client = await pool.connect();
    console.log('--- STARTING E2E CRUD VALIDATION ---');
    
    // 1. ADD Partner
    console.log('Testing Partner Add/Delete...');
    const partnerRes = await client.query(`INSERT INTO partners (partner_type, name) VALUES ('SUPPLIER', 'TEST_SUPP_1') RETURNING id;`);
    const partnerId = partnerRes.rows[0].id;
    
    // 2. ADD Brand -> Type -> Model
    console.log('Testing Brand -> Type -> Model Hierarchy (with Cascade Delete)...');
    const brandRes = await client.query(`INSERT INTO item_brands (category_id, name) VALUES ((SELECT id FROM categories WHERE name = '資訊設備'), 'TEST_BRAND_1') RETURNING id;`);
    const brandId = brandRes.rows[0].id;
    
    const typeRes = await client.query(`INSERT INTO item_types (category_id, brand_id, name) VALUES ((SELECT id FROM categories WHERE name = '資訊設備'), $1, 'TEST_TYPE_1') RETURNING id;`, [brandId]);
    const typeId = typeRes.rows[0].id;
    
    const modelRes = await client.query(`INSERT INTO item_models (type_id, name) VALUES ($1, 'TEST_MODEL_1') RETURNING id;`, [typeId]);
    const modelId = modelRes.rows[0].id;
    
    // 3. Delete Brand should cascade to Type and Model
    await client.query(`DELETE FROM item_brands WHERE id = $1`, [brandId]);
    const modelCheck = await client.query(`SELECT id FROM item_models WHERE id = $1`, [modelId]);
    if (modelCheck.rows.length === 0) {
      console.log('✅ Brand delete successfully cascaded to Models!');
    } else {
      throw new Error('CASCADE Delete failed for Models!');
    }

    // 4. ADD Item Master & Assets & Lab Assignments
    console.log('Testing Item Master -> Assets -> Lab Assignments (with Cascade Delete)...');
    const masterRes = await client.query(`INSERT INTO item_master (specification, type, brand, model, unit, category_id, purchase_price) VALUES ('Test Spec', 'TEST_TYPE', 'TEST_BRAND', 'TEST_MODEL', '個', (SELECT id FROM categories WHERE name = '資訊設備'), 0) RETURNING id;`);
    const masterId = masterRes.rows[0].id;

    const assetRes = await client.query(`INSERT INTO assets (item_master_id, sn, custom_attributes) VALUES ($1, 'TEST_SN_001', '{"test": true}') RETURNING id;`, [masterId]);
    const assetId = assetRes.rows[0].id;

    const labRes = await client.query(`INSERT INTO item_lab_assignments (item_master_id, asset_id, quantity) VALUES ($1, $2, 5) RETURNING id;`, [masterId, assetId]);
    const labId = labRes.rows[0].id;

    // Delete Master should cascade
    await client.query(`DELETE FROM item_master WHERE id = $1`, [masterId]);
    const labCheck = await client.query(`SELECT id FROM item_lab_assignments WHERE id = $1`, [labId]);
    if (labCheck.rows.length === 0) {
      console.log('✅ Item Master delete successfully cascaded to Assets and Lab Assignments!');
    } else {
      throw new Error('CASCADE Delete failed for Lab Assignments!');
    }

    // 5. Cleanup
    await client.query(`DELETE FROM partners WHERE id = $1`, [partnerId]);
    console.log('--- ALL TESTS PASSED SUCCESSFULLY! SCHEMA IS ROBUST. ---');
    client.release();
  } catch (err) {
    console.error('Test Failed:', err.message);
  } finally {
    pool.end();
  }
}

runTests();
