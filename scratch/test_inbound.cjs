const pg = require('pg');
const pool = new pg.Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'admin123',
  port: 5432,
});

async function main() {
  try {
    const res = await pool.query(`INSERT INTO inbound_orders (order_no, partner_id, invoice_no, status) VALUES ('IN-20260812-99', 9, '', 'COMPLETED') RETURNING id`);
    console.log("Order Insert ID:", res.rows[0].id);
  } catch(e) {
    console.error("Order error:", e);
  }
  
  try {
    const r2 = await pool.query(`INSERT INTO assets (sn, item_master_id, status, custom_attributes) VALUES ($1, $2, 'ACTIVE', jsonb_build_object('project_name', $3::text)) RETURNING id`, ['TEST-SN', 1, 'Project X']);
    console.log("Asset Insert ID:", r2.rows[0].id);
  } catch (e) {
    console.error("Asset error:", e.message);
  }

  process.exit(0);
}
main();
