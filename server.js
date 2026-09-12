import 'dotenv/config';
import https from 'https';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { queries as namedQueries } from './database/queries.js';
import { createAuth } from './server/auth.js';
import { createAuthRoutes } from './server/authRoutes.js';
import { createPreferenceRoutes } from './server/preferenceRoutes.js';
import { prepareQueryParams } from './server/queryParams.js';
import { runTransaction } from './server/transaction.js';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.HTTPS_PORT || 5566;

// SSL 憑證設定（Private CA 簽發）
const sslOptions = {
  key: fs.readFileSync(process.env.SSL_KEY_PATH || path.join(__dirname, 'ssl', 'server.key')),
  cert: fs.readFileSync(process.env.SSL_CERT_PATH || path.join(__dirname, 'ssl', 'server.crt')),
  ca: fs.readFileSync(process.env.SSL_CA_PATH || path.join(__dirname, 'ssl', 'ca.crt')),
};

// 優化後的安全性處理：針對 Named Query 不再暴力濾除
// 因為 Named Query 使用參數化查詢 ($1, $2)，本身即具備防禦 SQL Injection 能力
// 依照 SECURITY_GUIDELINES.md 實作的安全性過濾函式

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'ERP_db',
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

// 自動初始化維修單資料表
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repair_orders (
        id SERIAL PRIMARY KEY,
        repair_no VARCHAR(50) UNIQUE NOT NULL,
        customer_name VARCHAR(100) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'ON_SITE_HANDLING',
        on_site_date DATE,
        on_site_status TEXT,
        send_oem_date DATE,
        oem_return_date DATE,
        results TEXT,
        completion_date DATE,
        creator_id INTEGER,
        remarks TEXT,
        signed_doc_url TEXT,
        signed_doc_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS repair_items (
        id SERIAL PRIMARY KEY,
        repair_id INTEGER REFERENCES repair_orders(id) ON DELETE CASCADE,
        asset_id INTEGER,
        item_master_id INTEGER,
        brand VARCHAR(100),
        type VARCHAR(100),
        model VARCHAR(100),
        specification TEXT,
        sn VARCHAR(100)
      );
    `);
    await pool.query(`
      ALTER TABLE item_master ALTER COLUMN specification DROP NOT NULL;
      ALTER TABLE item_master ALTER COLUMN specification SET DEFAULT '';
      ALTER TABLE inbound_orders ADD COLUMN IF NOT EXISTS order_date DATE DEFAULT CURRENT_DATE;
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS end_user VARCHAR(100);
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS ownership VARCHAR(30) DEFAULT 'FOR_SALE';
      ALTER TABLE assets ADD COLUMN IF NOT EXISTS shipping_date DATE;
      ALTER TABLE outbound_items ADD COLUMN IF NOT EXISTS location VARCHAR(255);
      ALTER TABLE outbound_items ADD COLUMN IF NOT EXISTS purpose VARCHAR(255) DEFAULT '運作測試';
      ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS location VARCHAR(255);
      ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS project_name VARCHAR(100);
      ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS signed_doc_url TEXT;
      ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS signed_doc_name TEXT;

      -- 自動清理無任何資產與單據關聯之設備與硬體幽靈品項主檔 (當初匯入錯誤且資產已修改/刪除的殘留資料)
      DELETE FROM item_master i
      WHERE i.id IN (
        SELECT im.id FROM item_master im
        JOIN categories c ON im.category_id = c.id
        WHERE c.name IN ('設備', '硬體')
          AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.item_master_id = im.id)
          AND NOT EXISTS (SELECT 1 FROM inbound_items ii WHERE ii.item_id = im.id)
          AND NOT EXISTS (SELECT 1 FROM outbound_items oi WHERE oi.item_id = im.id)
          AND NOT EXISTS (SELECT 1 FROM item_lab_assignments la WHERE la.item_master_id = im.id)
      );

      -- 自動補齊 item_master 中的廠牌與類型至主檔表
      INSERT INTO item_brands (category_id, name)
      SELECT DISTINCT category_id, brand
      FROM item_master
      WHERE brand IS NOT NULL AND TRIM(brand) != '' AND category_id IS NOT NULL
      ON CONFLICT DO NOTHING;

      INSERT INTO item_types (category_id, name)
      SELECT DISTINCT category_id, type
      FROM item_master
      WHERE type IS NOT NULL AND TRIM(type) != '' AND category_id IS NOT NULL
      ON CONFLICT DO NOTHING;

      -- 型號同樣自品項主檔補齊。原本只補廠牌與類型，型號因新增功能長期失效
      -- 而從未寫入 item_models，導致「型號」下拉選單一直是空的。
      -- 型號隸屬於廠牌，以名稱與類別對應回 item_brands。
      INSERT INTO item_models (brand_id, name)
      SELECT DISTINCT b.id, UPPER(TRIM(i.model))
      FROM item_master i
      JOIN item_brands b
        ON UPPER(TRIM(b.name)) = UPPER(TRIM(i.brand))
       AND b.category_id = i.category_id
      WHERE i.model IS NOT NULL AND TRIM(i.model) != ''
      ON CONFLICT DO NOTHING;
    `);

    // 自動偵測並整併大小寫與空白重複之品項主檔 (Case-Insensitive Master Merge)
    await autoMergeDuplicateItemMasters(pool);

    console.log('✅ Repair Order Tables (RMA) & schema migrations checked & ready');
  } catch (e) {
    console.error('⚠️ Notice on auto-initializing tables / schema migration:', e.message);
  }
})();

// 大小寫與空白重複品項主檔安全整併核心函式
async function autoMergeDuplicateItemMasters(clientPool) {
  try {
    const dupRes = await clientPool.query(`
      SELECT 
        c.name as cat_name,
        LOWER(TRIM(i.brand)) as norm_brand,
        LOWER(TRIM(i.type)) as norm_type,
        LOWER(TRIM(i.model)) as norm_model,
        LOWER(TRIM(COALESCE(i.specification, ''))) as norm_specification,
        array_agg(i.id ORDER BY i.id ASC) as ids
      FROM item_master i
      JOIN categories c ON i.category_id = c.id
      WHERE c.name IN ('設備', '硬體')
      GROUP BY c.name, LOWER(TRIM(i.brand)), LOWER(TRIM(i.type)), LOWER(TRIM(i.model)), LOWER(TRIM(COALESCE(i.specification, '')))
      HAVING COUNT(*) > 1
    `);

    if (dupRes.rows.length === 0) {
      console.log('✅ Item Master check: No duplicate case-insensitive masters found.');
      return { mergedGroups: 0, removedMasters: 0 };
    }

    console.log(`🔍 Found ${dupRes.rows.length} groups of case-insensitive duplicate item masters. Merging...`);
    let totalRemoved = 0;

    for (const group of dupRes.rows) {
      const allIds = group.ids;
      // 找出擁有最多資產關聯的主檔做為主要主檔 (primaryId)
      const assetCounts = await clientPool.query(`
        SELECT item_master_id, COUNT(*) as cnt
        FROM assets
        WHERE item_master_id = ANY($1)
        GROUP BY item_master_id
        ORDER BY cnt DESC, item_master_id ASC
      `, [allIds]);

      const primaryId = assetCounts.rows.length > 0 ? assetCounts.rows[0].item_master_id : allIds[0];
      const secondaryIds = allIds.filter(id => id !== primaryId);

      if (secondaryIds.length === 0) continue;

      // 1. 轉移資產關聯 (assets)
      await clientPool.query(`
        UPDATE assets SET item_master_id = $1 WHERE item_master_id = ANY($2)
      `, [primaryId, secondaryIds]);

      // 2. 轉移進貨單項目 (inbound_items)
      await clientPool.query(`
        UPDATE inbound_items SET item_id = $1 WHERE item_id = ANY($2)
      `, [primaryId, secondaryIds]);

      // 3. 轉移出貨單項目 (outbound_items)
      await clientPool.query(`
        UPDATE outbound_items SET item_id = $1 WHERE item_id = ANY($2)
      `, [primaryId, secondaryIds]);

      // 4. 轉移 LAB 配置紀錄 (item_lab_assignments)
      await clientPool.query(`
        UPDATE item_lab_assignments SET item_master_id = $1 WHERE item_master_id = ANY($2)
      `, [primaryId, secondaryIds]);

      // 5. 轉移維修品項目 (repair_items)
      await clientPool.query(`
        UPDATE repair_items SET item_master_id = $1 WHERE item_master_id = ANY($2)
      `, [primaryId, secondaryIds]);

      // 6. 安全刪除次要重複主檔
      await clientPool.query(`
        DELETE FROM item_master WHERE id = ANY($1)
      `, [secondaryIds]);

      totalRemoved += secondaryIds.length;
      console.log(`   ✨ Merged [${group.cat_name} ${group.norm_brand} ${group.norm_model}]: Kept ID ${primaryId}, merged ${secondaryIds.length} duplicate(s) (${secondaryIds.join(',')})`);
    }

    console.log(`✅ Item Master Auto-Merge finished: Merged ${dupRes.rows.length} groups, removed ${totalRemoved} duplicate masters.`);
    return { mergedGroups: dupRes.rows.length, removedMasters: totalRemoved };
  } catch (err) {
    console.error('⚠️ Notice on auto-merging duplicate item masters:', err.message);
    return { error: err.message };
  }
}

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folderPath = 'uploads/';
    if (req.body.projectName) {
      const safeName = req.body.projectName.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
      folderPath = path.join('uploads', safeName);
      const fullPath = path.join(__dirname, folderPath);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }
    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    cb(null, `${baseName}-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

// CORS：僅允許自家前端來源，避免任意網站透過瀏覽器讀取本系統資料。
// 以環境變數 ALLOWED_ORIGINS 設定（逗號分隔），未設定時僅允許同源與本機。
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // 無 origin：一般同源請求、Electron 或伺服器間呼叫
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);

    // 不在允許清單時「不回傳 CORS 標頭」，但仍讓請求正常完成。
    //
    // 這裡不可以回傳 Error：那會讓 Express 走錯誤處理直接回 500，把同源請求
    // 一起打死。index.html 裡的 <script crossorigin> 與 <link crossorigin>
    // 即使是同源也會送出 Origin 標頭，因此以伺服器 IP 開啟時
    // （例如 https://192.168.100.249:5566）JS 與 CSS 全數變成 500，畫面空白。
    //
    // 回傳 false 才是正確作法：同源請求不受 CORS 檢查限制，可正常載入；
    // 真正跨來源的請求因為拿不到 Access-Control-Allow-Origin，
    // 仍會被瀏覽器擋下讀取，安全性目的不變。
    return cb(null, false);
  },
  credentials: true,
}));
app.use(express.json());

const auth = createAuth(pool);

// 逾期連線階段清理：啟動時執行一次，之後每小時一次
auth.purgeExpired().catch(() => {});
setInterval(() => { auth.purgeExpired().catch(() => {}); }, 3600 * 1000).unref?.();

// 上傳檔案需登入後才能取用
app.use('/uploads', auth.requireAuth, express.static(uploadsDir));

// Named Query API
app.post('/api/namedQuery', auth.requireAuth, async (req, res) => {
  const { queryName, params = [] } = req.body;
  
  if (!queryName || !namedQueries[queryName]) {
    return res.status(400).json({ success: false, error: `Invalid query name: ${queryName}` });
  }
  
  const sql = namedQueries[queryName];

  try {
    // 參數前處理與 /api/transaction、Electron IPC 共用同一份實作
    const result = await pool.query(sql, prepareQueryParams(params, sql));
    res.json({ success: true, rows: result.rows });
  } catch (error) {
    console.error(`[DB Error] ${queryName}:`, error.message);
    res.status(500).json({ success: false, error: `資料庫執行異常: ${error.message}` });
  }
});

// 多步驟交易：整串步驟在單一連線的單一交易中執行，全成功才提交。
// 用於進貨、出庫、匯入、採購單編輯等需要連續寫入多筆的流程，
// 避免中途失敗留下「單據建立了但明細不全」這類半套資料。
app.post('/api/transaction', auth.requireAuth, async (req, res) => {
  const { steps } = req.body || {};
  const result = await runTransaction(
    { pool, namedQueries, prepareParams: prepareQueryParams },
    steps
  );
  res.status(result.success ? 200 : 500).json(result);
});

// 其他 API 簡化 (維持原有功能)...
// 身分驗證路由：密碼一律於伺服器端驗證，password_hash 絕不回傳給用戶端。
// 登入成功後發給連線代碼，其餘 /api 端點皆需附上該代碼（見 auth.requireAuth）。
app.use('/api/auth', createAuthRoutes(pool, auth));

// 使用者個人偏好設定（例如各列表的顯示欄位），對象取自連線階段
app.use('/api/preferences', createPreferenceRoutes(pool, auth));


app.post('/api/upload', auth.requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  
  let fileUrl = req.file.path.replace(/\\/g, '/');
  if (!fileUrl.startsWith('/')) {
    fileUrl = '/' + fileUrl;
  }
  
  res.json({ success: true, fileName: req.file.filename, url: fileUrl });
});

// 手動掃描大小寫重複品項主檔 API
app.get('/api/item-master/scan-duplicates', auth.requireAuth, async (req, res) => {
  try {
    const result = await pool.query(namedQueries.scanDuplicateItemMasters);
    res.json({ success: true, rows: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 手動執行大小寫重複品項主檔整併 API
app.post('/api/item-master/merge-duplicates', auth.requireAuth, auth.requireRole('ADMIN'), async (req, res) => {
  try {
    const mergeResult = await autoMergeDuplicateItemMasters(pool);
    if (mergeResult.error) {
      return res.status(500).json({ success: false, error: mergeResult.error });
    }
    res.json({ success: true, ...mergeResult });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 正式環境：服務前端 React 打包檔（dist/）
// 開發環境由 Vite dev server 處理，此段不影響開發
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback — React Router 需要（Express 5 語法）
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log(`📁 Serving frontend from: ${distPath}`);
}

// 建立 HTTPS 伺服器（Port 5566，Private CA 憑證）
https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
  console.log(`✅ HTTPS Server running on https://0.0.0.0:${PORT}`);
  console.log(`   Local:   https://localhost:${PORT}`);
  console.log(`   Network: https://<your-server-ip>:${PORT}`);
});
