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
    console.log('Adding brand_id to item_types...');
    await pool.query(`
      ALTER TABLE item_types ADD COLUMN IF NOT EXISTS brand_id INTEGER REFERENCES item_brands(id) ON DELETE CASCADE;
      
      -- Remove the old unique constraint if it exists and create a new one that includes brand_id
      -- First, let's find the constraint name. Usually it's item_types_category_id_name_key
      ALTER TABLE item_types DROP CONSTRAINT IF EXISTS item_types_category_id_name_key;
      -- Create a new one that allows the same type name for different brands
      ALTER TABLE item_types ADD CONSTRAINT item_types_cid_brand_name_key UNIQUE (category_id, brand_id, name);
    `);
    console.log('Successfully updated item_types table.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
