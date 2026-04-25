import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 安全防護：過濾不安全之輸入字元與關鍵字，防範 Mass SQL Injection
function sanitizeParams(params) {
  if (!Array.isArray(params)) return params;
  
  // 濾除字元：| & ; $ % @ ' " \ ( ) + CR LF ,
  const charRegex = /[|&;$%@'"\\()+\r\n,]/g;
  // 濾除關鍵字：Select, Insert, Dbo, Declare, Cast, Drop, Union, EXEC, NVARCHAR
  const keywordRegex = /\b(Select|Insert|Dbo|Declare|Cast|Drop|Union|Exec|Nvarchar)\b/gi;

  return params.map(param => {
    if (typeof param === 'string') {
      return param.replace(charRegex, '').replace(keywordRegex, '');
    }
    return param;
  });
}

// 資料庫設定 (與 electron/db.js 一致)
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db',
  password: 'Admin123',
  port: 5432,
});

// 建立上傳目錄
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer 設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    cb(null, `${baseName}-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));



// 認證 API
app.post('/api/auth/login', async (req, res) => {
  let { username } = req.body;
  const safeParams = sanitizeParams([username]);

  try {
    const result = await pool.query(
      'SELECT id, username, role, full_name, password_hash, menu_access FROM users WHERE username = $1 AND is_active = TRUE',
      safeParams
    );
    res.json({ success: true, rows: result.rows });
  } catch (error) {
    console.error('[DB Auth Error]', error);
    res.status(500).json({ success: false, error: '資料庫處理失敗，請稍後再試或聯絡維護人員。' });
  }
});

// 儀表板 API
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const queries = [
      pool.query('SELECT COUNT(*) as total_items FROM v_inventory_summary'),
      pool.query('SELECT COUNT(*) as low_stock FROM v_inventory_summary WHERE available_qty < safety_stock'),
      pool.query("SELECT COUNT(*) as draft_orders FROM inbound_orders WHERE status = 'DRAFT'")
    ];
    const results = await Promise.all(queries);
    res.json({
      success: true,
      stats: {
        totalItems: results[0].rows[0].total_items,
        lowStock: results[1].rows[0].low_stock,
        draftOrders: results[2].rows[0].draft_orders
      }
    });
  } catch (error) {
    console.error('[DB Dashboard Error]', error);
    res.status(500).json({ success: false, error: '資料庫處理失敗，請稍後再試或聯絡維護人員。' });
  }
});

import { queries as namedQueries } from './database/queries.js';

// 具名查詢 API (防範 SQL Injection，取代直接傳送動態 SQL)
app.post('/api/namedQuery', async (req, res) => {
  const { queryName, params } = req.body;
  if (!queryName || !namedQueries[queryName]) {
    return res.status(400).json({ success: false, error: '無效的查詢要求' });
  }
  
  const sql = namedQueries[queryName];
  const safeParams = sanitizeParams(params).map(p => 
    (typeof p === 'object' && p !== null) ? JSON.stringify(p) : p
  );

  try {
    const result = await pool.query(sql, safeParams);
    res.json({ success: true, rows: result.rows });
  } catch (error) {
    console.error(`[DB NamedQuery Error] (${queryName}):`, error);
    res.status(500).json({ success: false, error: '資料庫查詢失敗，請稍後再試或聯絡維護人員。' });
  }
});

// 檔案上傳 API
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  res.json({ success: true, fileName: req.file.filename });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
