import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { query } from './db.js';
import fs from 'fs/promises';

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
    const result = await query(sql, params);
    return { success: true, rows: result.rows };
  } catch (error) {
    console.error('[DB] Query Error:', error);
    return { success: false, error: error.message };
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
