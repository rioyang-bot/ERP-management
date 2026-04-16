import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function migrate() {
  try {
    console.log('Starting menu_access migration...');

    // 1. 新增 menu_access 欄位
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS menu_access JSONB DEFAULT '{}';
    `);
    console.log('Added menu_access column.');

    // 2. 初始化現有使用者的權限 (基於角色)
    const itAccess = { inventory: true, outbound: true, reports: true };
    const warehouseAccess = { 
      inventory: true, review: true, inbound: true, assets: true, 
      assetList: true, consumables: true, partners: true, reports: true 
    };
    const purchasingAccess = { inventory: true, purchasing: true, reports: true };
    const adminAccess = { settings: true };

    await pool.query(`UPDATE users SET menu_access = $1 WHERE role = 'IT'`, [JSON.stringify(itAccess)]);
    await pool.query(`UPDATE users SET menu_access = $1 WHERE role = 'WAREHOUSE'`, [JSON.stringify(warehouseAccess)]);
    await pool.query(`UPDATE users SET menu_access = $1 WHERE role = 'PURCHASING'`, [JSON.stringify(purchasingAccess)]);
    await pool.query(`UPDATE users SET menu_access = $1 WHERE role = 'ADMIN'`, [JSON.stringify(adminAccess)]);
    
    console.log('Initialized menu_access for existing users.');

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
