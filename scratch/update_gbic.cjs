const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function updateGbic() {
  try {
    // Find GBIC
    const res = await pool.query("SELECT id, brand, model, specification, stock_qty FROM item_master WHERE specification ILIKE '%GBIC%' OR model ILIKE '%GBIC%'");
    console.log('Found GBIC items:', res.rows);

    if (res.rows.length > 0) {
      for (const item of res.rows) {
        await pool.query("UPDATE item_master SET stock_qty = 100 WHERE id = $1", [item.id]);
        console.log(`Updated ID ${item.id} (${item.model}) to 100 stock.`);
      }
    } else {
      console.log('No GBIC items found to update.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

updateGbic();
