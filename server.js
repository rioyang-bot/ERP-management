import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { queries as namedQueries } from './database/queries.js';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 優化後的安全性處理：針對 Named Query 不再暴力濾除
// 因為 Named Query 使用參數化查詢 ($1, $2)，本身即具備防禦 SQL Injection 能力
function sanitizeParams(params) {
  if (!Array.isArray(params)) return [];
  return params; // 參數化查詢不需要手動濾除引號，手動濾除反而會破壞資料
}

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ERP_db', 
  password: 'Admin123',
  port: 5432,
});

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
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

// Named Query API
app.post('/api/namedQuery', async (req, res) => {
  const { queryName, params = [] } = req.body;
  
  if (!queryName || !namedQueries[queryName]) {
    return res.status(400).json({ success: false, error: `Invalid query name: ${queryName}` });
  }
  
  const sql = namedQueries[queryName];
  
  try {
    // 處理 JSON 物件
    const processedParams = params.map(p => 
      (typeof p === 'object' && p !== null) ? JSON.stringify(p) : p
    );
    
    const result = await pool.query(sql, processedParams);
    res.json({ success: true, rows: result.rows });
  } catch (error) {
    console.error(`[DB Error] ${queryName}:`, error.message);
    res.status(500).json({ success: false, error: `資料庫錯誤: ${error.message}` });
  }
});

// 其他 API 簡化 (維持原有功能)...
app.post('/api/auth/login', async (req, res) => {
  const { username } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, username, role, full_name, password_hash, menu_access FROM users WHERE username = $1 AND is_active = TRUE',
      [username]
    );
    res.json({ success: true, rows: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const results = await Promise.all([
      pool.query('SELECT COUNT(*) as total_items FROM v_inventory_summary'),
      pool.query('SELECT COUNT(*) as low_stock FROM v_inventory_summary WHERE available_qty < safety_stock'),
      pool.query("SELECT COUNT(*) as draft_orders FROM inbound_orders WHERE status = 'DRAFT'")
    ]);
    res.json({
      success: true,
      stats: {
        totalItems: results[0].rows[0].total_items,
        lowStock: results[1].rows[0].low_stock,
        draftOrders: results[2].rows[0].draft_orders
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  res.json({ success: true, fileName: req.file.filename });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
