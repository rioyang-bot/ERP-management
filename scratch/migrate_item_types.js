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
    console.log('開始執行資料庫擴充 (item_types)...');

    // 1. 建立 item_types 資料表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS item_types (
          id SERIAL PRIMARY KEY,
          category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
          name VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(category_id, name)
      );
    `);
    console.log('1. item_types 資料表已建立');

    // 2. 初始化資產預設類型 (資訊設備)
    await pool.query(`
      INSERT INTO item_types (category_id, name)
      SELECT c.id, t.name FROM categories c
      CROSS JOIN (
          SELECT '筆記型電腦' as name UNION ALL
          SELECT '桌上型電腦' UNION ALL
          SELECT '伺服器' UNION ALL
          SELECT '螢幕/顯示器' UNION ALL
          SELECT '網路設備' UNION ALL
          SELECT '周邊設備' UNION ALL
          SELECT '其他'
      ) t
      WHERE c.name = '資訊設備'
      ON CONFLICT DO NOTHING;
    `);
    console.log('2. 資產預設類型初始化完成');

    // 3. 初始化耗材預設類型 (辦公耗材)
    await pool.query(`
      INSERT INTO item_types (category_id, name)
      SELECT c.id, t.name FROM categories c
      CROSS JOIN (
          SELECT '紙張' as name UNION ALL
          SELECT '文具' UNION ALL
          SELECT '墨水/碳粉' UNION ALL
          SELECT '清潔用品' UNION ALL
          SELECT '其他'
      ) t
      WHERE c.name = '辦公耗材'
      ON CONFLICT DO NOTHING;
    `);
    console.log('3. 耗材預設類型初始化完成');

    console.log('資料庫擴充完成！');
  } catch (err) {
    console.error('擴充失敗：', err);
  } finally {
    await pool.end();
  }
}

migrate();
