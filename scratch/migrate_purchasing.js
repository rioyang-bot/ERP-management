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
    console.log('Starting migration...');

    // 1. 更新 users 表的 role 約束
    // 先找出約束名稱 (通常是 users_role_check)
    await pool.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('IT', 'WAREHOUSE', 'ADMIN', 'PURCHASING'));
    `);
    console.log('Updated users role constraint.');

    // 2. 建立採購紀錄表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS purchase_records (
          id SERIAL PRIMARY KEY,
          order_no VARCHAR(50) UNIQUE NOT NULL, -- 採購單號
          partner_id INTEGER REFERENCES partners(id), -- 供應商
          category_id INTEGER REFERENCES categories(id), -- 資產或耗材
          item_type VARCHAR(100),              -- 類型 (Type)
          brand VARCHAR(100),                  -- 廠牌 (Brand)
          specification TEXT NOT NULL,         -- 規格 (Specification)
          unit VARCHAR(20),                    -- 單位 (Unit)
          unit_price DECIMAL(15, 2) NOT NULL,    -- 採購單價
          quantity INTEGER NOT NULL DEFAULT 1,   -- 採購數量
          received_quantity INTEGER DEFAULT 0,  -- 已入庫數量
          status VARCHAR(20) DEFAULT 'ORDERED', -- ORDERED (已下單), PARTIAL (部分入庫), COMPLETED (結案)
          purchaser_id INTEGER REFERENCES users(id), -- 採購人員
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created purchase_records table.');

    // 3. 在 inbound_items 增加對 purchase_record_id 的引用
    await pool.query(`
      ALTER TABLE inbound_items ADD COLUMN IF NOT EXISTS purchase_record_id INTEGER REFERENCES purchase_records(id);
    `);
    console.log('Added purchase_record_id to inbound_items.');

    // 4. 新增一個預設的採購人員測試帳號 (選填)
    await pool.query(`
      INSERT INTO users (username, password_hash, role, full_name) 
      VALUES ('purchasing', 'purchasing_hash_placeholder', 'PURCHASING', '採購專員')
      ON CONFLICT (username) DO NOTHING;
    `);
    console.log('Added default purchasing user.');

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
