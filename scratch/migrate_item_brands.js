import pg from 'pg';

const pool = new pg.Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

async function migrate() {
  try {
    console.log('開始執行資料庫擴充 (item_brands)...');

    // 1. 建立 item_brands 資料表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS item_brands (
          id SERIAL PRIMARY KEY,
          category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
          name VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(category_id, name)
      );
    `);
    console.log('1. item_brands 資料表已建立');

    // 2. 初始化資產預設廠牌 (資訊設備)
    await pool.query(`
      INSERT INTO item_brands (category_id, name)
      SELECT c.id, t.name FROM categories c
      CROSS JOIN (
          SELECT 'Apple' as name UNION ALL
          SELECT 'Dell' UNION ALL
          SELECT 'HP' UNION ALL
          SELECT 'Lenovo' UNION ALL
          SELECT 'ASUS' UNION ALL
          SELECT 'Acer' UNION ALL
          SELECT 'MSI' UNION ALL
          SELECT 'Cisco' UNION ALL
          SELECT 'Logi' UNION ALL
          SELECT '其他'
      ) t
      WHERE c.name = '資訊設備'
      ON CONFLICT DO NOTHING;
    `);
    console.log('2. 資產預設廠牌初始化完成');

    // 3. 初始化耗材預設廠牌 (辦公耗材)
    await pool.query(`
      INSERT INTO item_brands (category_id, name)
      SELECT c.id, t.name FROM categories c
      CROSS JOIN (
          SELECT 'Double A' as name UNION ALL
          SELECT '3M' UNION ALL
          SELECT 'HP' UNION ALL
          SELECT 'Epson' UNION ALL
          SELECT 'Brother' UNION ALL
          SELECT 'Pilot' UNION ALL
          SELECT 'Pentel' UNION ALL
          SELECT '其他'
      ) t
      WHERE c.name = '辦公耗材'
      ON CONFLICT DO NOTHING;
    `);
    console.log('3. 耗材預設廠牌初始化完成');

    console.log('資料庫擴充完成！');
  } catch (err) {
    console.error('擴充失敗：', err);
  } finally {
    await pool.end();
  }
}

migrate();
