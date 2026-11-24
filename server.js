import 'dotenv/config';
import https from 'https';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';
// DATE 以字串回傳，避免時區換算讓日期差一天（見 server/pgTypes.js）
import './server/pgTypes.js';
import { queries as namedQueries } from './database/queries.js';
import { createAuth } from './server/auth.js';
import { createAuthRoutes } from './server/authRoutes.js';
import { createPreferenceRoutes } from './server/preferenceRoutes.js';
import { createIsoSignatureRoutes } from './server/isoSignatureRoutes.js';
import { createIsoPeriodicCheckRoutes } from './server/isoPeriodicCheckRoutes.js';
import { createIsoRoomCheckRoutes } from './server/isoRoomCheckRoutes.js';
import { createIsoThreatIntelRoutes } from './server/isoThreatIntelRoutes.js';
import { createStockAdjustRoutes } from './server/stockAdjustRoutes.js';
import { createBackupStatusRoutes } from './server/backupStatusRoutes.js';
import { createUploadRoutes } from './server/uploadRoutes.js';
import { purgeTrash, TRASH_DIR_NAME } from './server/uploadCleanup.js';
import { prepareQueryParams } from './server/queryParams.js';
import { runTransaction } from './server/transaction.js';
import { ensureMonthlyBalances } from './server/monthlyBalance.js';
import { createUpload, MAX_UPLOAD_MB } from './server/upload.js';
import { createJsonBodyParser } from './server/jsonBody.js';
import { autoMergeDuplicateItemMasters, cleanupUnusedItemMasters } from './server/itemMasterMaintenance.js';

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
    `);

    // 自動清理無任何資產與單據關聯之設備與硬體幽靈品項主檔 (當初匯入錯誤且資產已修改/刪除的殘留資料)。
    // 拆成獨立一支查詢，才拿得回刪掉了哪些主檔並寫進事件紀錄（見 server/itemMasterMaintenance.js）
    await cleanupUnusedItemMasters(pool);

    await pool.query(`
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

// 大小寫與空白重複品項主檔安全整併核心函式：搬到 server/itemMasterMaintenance.js，
// 每整併一組都寫一筆事件紀錄（保留哪個主檔、刪掉哪些、各資料表搬了幾筆）

const uploadsDir = path.join(__dirname, 'uploads');
// 上傳設定（中文檔名以 UTF-8 解讀、25 MB 上限）見 server/upload.js
const upload = createUpload(__dirname);

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
// 公司範本的 LOGO 以 data: 網址存在範本裡（單張上限 1 MB，見 src/utils/companyPresets.js），
// 預設的 100 KB 一張圖就超過了。不接受壓縮過的請求內容，理由見 server/jsonBody.js
app.use(createJsonBodyParser({ limit: '5mb' }));

const auth = createAuth(pool);

// 逾期連線階段清理：啟動時執行一次，之後每小時一次
auth.purgeExpired().catch(() => {});
setInterval(() => { auth.purgeExpired().catch(() => {}); }, 3600 * 1000).unref?.();

// 每月結餘庫存：沿用同一個每小時的節奏檢查「上個月記了沒」，沒記就補。
// 如此一來 1 日當天沒開機也不會漏掉，開機後第一次檢查就會補上。
const runMonthlyBalance = () =>
  ensureMonthlyBalances({ pool, namedQueries })
    .then(({ generated }) => {
      if (generated.length > 0) console.log(`[MonthlyBalance] 已產生結餘庫存: ${generated.join(', ')}`);
    })
    .catch((e) => console.error('[MonthlyBalance] 產生失敗:', e.message));
runMonthlyBalance();
setInterval(runMonthlyBalance, 3600 * 1000).unref?.();

// 上傳檔案需登入後才能取用；回收區（清掉的檔案，見 server/uploadCleanup.js）不開放
app.use(`/uploads/${TRASH_DIR_NAME}`, (req, res) => res.status(404).end());
app.use('/uploads', auth.requireAuth, express.static(uploadsDir));

// 回收區超過保留天數的檔案真正刪除：啟動時一次，之後每小時一次
const runPurgeTrash = () =>
  purgeTrash(uploadsDir)
    .then((purged) => { if (purged.length > 0) console.log(`[Uploads] 回收區已刪除: ${purged.join(', ')}`); })
    .catch((e) => console.error('[Uploads] 回收區清理失敗:', e.message));
runPurgeTrash();
setInterval(runPurgeTrash, 3600 * 1000).unref?.();

// Named Query API
app.post('/api/namedQuery', auth.requireAuth, async (req, res) => {
  const { queryName, params = [] } = req.body;
  
  if (!queryName || !namedQueries[queryName]) {
    return res.status(400).json({ success: false, error: `Invalid query name: ${queryName}` });
  }
  
  const sql = namedQueries[queryName];

  try {
    // 參數前處理與 /api/transaction、Electron IPC 共用同一份實作
    const result = await pool.query(sql, prepareQueryParams(params, sql, queryName));
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

// ISO 表單線上簽核（設備攜出入單）：簽的人取自連線階段，不能代簽
app.use('/api/iso-signatures', createIsoSignatureRoutes(pool, auth, namedQueries));

// ISO 定期檢查紀錄（S-409-01 備份檢查、S-409-02 日誌審查）：檢查人員取自連線階段，不能代填，見 server/isoPeriodicCheckRoutes.js
app.use('/api/iso-checks', createIsoPeriodicCheckRoutes(pool, auth));

// ISO 27001 S-408-03 機房檢查表：每週一筆，填寫人取自連線階段，見 server/isoRoomCheckRoutes.js
app.use('/api/iso-room-checks', createIsoRoomCheckRoutes(pool, auth));

// ISO 27001 S-413-02 威脅情資自我檢核表：每月上傳 Word 檔、員工逐列簽名，下載時簽名填回原檔，見 server/isoThreatIntelRoutes.js
app.use('/api/iso-threat-intel', createIsoThreatIntelRoutes(pool, auth));

// 耗材盤點調整（只調整 Stock）：要有「可盤點調整」權限，伺服器自己檢查，見 server/stockAdjustRoutes.js
app.use('/api/stock-adjustments', createStockAdjustRoutes(pool, auth));

// 營運總覽的備份燈號：最後一次本機備份與 Google Drive 備份的結果（scripts/server-backup.sh 寫的），見 server/backupStatusRoutes.js
app.use('/api/backup-status', createBackupStatusRoutes(auth, path.join(__dirname, 'backups')));

// 上傳檔案的釋放與清理（刪掉照片、換掉簽收單後清掉舊檔；系統管理的清理工具），見 server/uploadRoutes.js
app.use('/api/uploads', createUploadRoutes(pool, auth, uploadsDir));


const uploadSingle = upload.single('file');

app.post('/api/upload', auth.requireAuth, (req, res, next) => {
  // multer 丟出的錯誤若不接住，會變成一頁 HTML 的 500 ——
  // 前端拿到的是一段解析不了的字串，使用者只看到「上傳失敗」而不知道是檔案太大
  uploadSingle(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({
      success: false,
      error: tooBig
        ? `檔案超過上限 ${MAX_UPLOAD_MB} MB，請壓縮後再上傳。`
        : (err.message || '檔案上傳失敗'),
    });
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  
  // 存檔位置是絕對路徑（見 server/upload.js），網址取它相對專案目錄的部分：/uploads/檔名
  const fileUrl = '/' + path.relative(__dirname, req.file.path).split(path.sep).join('/');

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
    // 傳入 req：事件紀錄記在按下整併的使用者名下（啟動時自動整併則記在「系統」名下）
    const mergeResult = await autoMergeDuplicateItemMasters(pool, { req });
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
