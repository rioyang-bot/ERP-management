import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { query } from './db.js';
import fs from 'fs/promises';
import { queries as namedQueries } from '../database/queries.js';

// 安全防護：過濾不安全之輸入字元與關鍵字，防範 Mass SQL Injection
function sanitizeParams(params) {
  if (!Array.isArray(params)) return params;
  const charRegex = /[|&;$%@'"\\()+\r\n,]/g;
  const keywordRegex = /\b(Select|Insert|Dbo|Declare|Cast|Drop|Union|Exec|Nvarchar)\b/gi;

  return params.map(param => {
    if (typeof param === 'string') {
      return param.replace(charRegex, '').replace(keywordRegex, '');
    }
    return param;
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 建立上傳資料夾路徑
const uploadsPath = path.join(app.getPath('userData'), 'uploads');

let mainWindow;

// 在 app ready 前註冊協定
protocol.registerSchemesAsPrivileged([
  { scheme: 'erp-media', privileges: { bypassCSP: true, secure: true, supportFetchAPI: true } }
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  console.log('[App] Initializing systems...');
  
  // 確保目錄存在
  try {
    await fs.mkdir(uploadsPath, { recursive: true });
    console.log('[App] Uploads directory ready:', uploadsPath);
  } catch (err) {
    console.error('[App] Directory error:', err);
  }

  // 註冊媒體讀取協定 (使用 erp-media:///filename 格式以支持空格與特殊字元)
  protocol.handle('erp-media', async (request) => {
    try {
      const urlObj = new URL(request.url);
      // 使用 pathname 並移除開頭的斜線，這能完美保留空格與大小寫
      const filename = decodeURIComponent(urlObj.pathname.replace(/^\//, ''));
      const filePath = path.resolve(uploadsPath, filename);
      
      console.log(`[Media] Request: ${request.url} -> Resolved: ${filePath}`);
      
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (e) {
      console.error('[Media] Fetch error:', e);
      return new Response('Media not found', { status: 404 });
    }
  });

  createWindow();
  console.log('[App] Main window created.');
});

// 資料庫查詢 IPC
ipcMain.handle('db:query', async (event, sql, params) => {
  try {
    const safeParams = sanitizeParams(params);
    const result = await query(sql, safeParams);
    return { success: true, rows: result.rows };
  } catch (error) {
    console.error('[DB] Query Error:', error);
    // 遮蔽系統詳細錯誤，避免輸出至畫面
    return { success: false, error: '資料庫連線或查詢失敗，請聯絡系統管理員。' };
  }
});

// 認證 API IPC
ipcMain.handle('auth:login', async (event, username) => {
  try {
    const safeParams = sanitizeParams([username]);
    const result = await query(
      'SELECT id, username, role, full_name, password_hash, menu_access FROM users WHERE username = $1 AND is_active = TRUE',
      safeParams
    );
    return { success: true, rows: result.rows };
  } catch (error) {
    console.error('[DB] Auth Error:', error);
    return { success: false, error: '資料庫連線或查詢失敗，請聯絡系統管理員。' };
  }
});

// 儀表板 API IPC
ipcMain.handle('dashboard:stats', async (event) => {
  try {
    const queries = [
      query('SELECT COUNT(*) as total_items FROM v_inventory_summary'),
      query('SELECT COUNT(*) as low_stock FROM v_inventory_summary WHERE available_qty < safety_stock'),
      query("SELECT COUNT(*) as draft_orders FROM inbound_orders WHERE status = 'DRAFT'")
    ];
    const results = await Promise.all(queries);
    return {
      success: true,
      stats: {
        totalItems: results[0].rows[0].total_items,
        lowStock: results[1].rows[0].low_stock,
        draftOrders: results[2].rows[0].draft_orders
      }
    };
  } catch (error) {
    console.error('[DB] Dashboard Error:', error);
    return { success: false, error: '資料庫連線或查詢失敗，請聯絡系統管理員。' };
  }
});

// 具名查詢 IPC
ipcMain.handle('db:namedQuery', async (event, queryName, params) => {
  if (!queryName || !namedQueries[queryName]) {
    return { success: false, error: '無效的查詢要求' };
  }
  try {
    const sql = namedQueries[queryName];
    const safeParams = sanitizeParams(params);
    const result = await query(sql, safeParams);
    return { success: true, rows: result.rows };
  } catch (error) {
    console.error(`[DB] NamedQuery Error (${queryName}):`, error);
    return { success: false, error: '資料庫連線或查詢失敗，請聯絡系統管理員。' };
  }
});

// 檔案保存 IPC
ipcMain.handle('file:save', async (event, { fileName, arrayBuffer }) => {
  try {
    const buffer = Buffer.from(arrayBuffer);
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    const uniqueName = `${baseName}-${Date.now()}${ext}`;
    const finalPath = path.join(uploadsPath, uniqueName);
    
    await fs.writeFile(finalPath, buffer);
    return { success: true, fileName: uniqueName };
  } catch (error) {
    console.error('[File] Save Error:', error);
    return { success: false, error: error.message };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
