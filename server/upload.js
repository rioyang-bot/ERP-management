// ============================================================================
// 檔案上傳（/api/upload）的 multer 設定
// ----------------------------------------------------------------------------
// 從 server.js 抽出來，才測得到。
//
// 中文檔名：瀏覽器送出的檔名是 UTF-8，但 multer（busboy）預設把沒標字集的
// 檔名當 latin1 解讀，「簽收單.pdf」存到磁碟會變成「ç°½æ¶å®.pdf」。
// 改用 defParamCharset: 'utf8' 照實際的字集解讀。
// 已經存成亂碼的舊檔不改名：資料庫裡記的就是那個檔名，改了反而對不上。
// ============================================================================

import fs from 'fs';
import path from 'path';
import multer from 'multer';

// 上傳沒有上限時，一支手機連拍就能把磁碟塞滿。
// 25 MB 容得下掃描的報價單與手機直出的照片，又不至於讓單一檔案失控。
export const MAX_UPLOAD_MB = 25;

/**
 * @param {string} rootDir 專案根目錄（uploads 放在它底下）
 * @param {object} [opts]
 * @param {number} [opts.maxMb] 單檔上限（MB），測試用
 */
export function createUpload(rootDir, { maxMb = MAX_UPLOAD_MB } = {}) {
  const uploadsDir = path.join(rootDir, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      let folderPath = path.join(rootDir, 'uploads');
      if (req.body.projectName) {
        const safeName = req.body.projectName.replace(/[^a-zA-Z0-9_\-一-龥]/g, '_');
        folderPath = path.join(rootDir, 'uploads', safeName);
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
      }
      cb(null, folderPath);
    },
    filename: (req, file, cb) => {
      // basename 去掉路徑，檔名裡夾帶 ../ 也寫不到 uploads 外面
      const ext = path.extname(file.originalname);
      const baseName = path.basename(file.originalname, ext);
      cb(null, `${baseName}-${Date.now()}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxMb * 1024 * 1024 },
    defParamCharset: 'utf8',
  });
}
