import express from 'express';

/**
 * API 的 JSON 請求內容解析
 *
 * 不接受壓縮過的請求內容（inflate: false）：body-parser 預設會依 Content-Encoding
 * 用 Node 的 zlib 解壓（gzip、deflate、br），而且這一步在登入檢查之前，連得到伺服器
 * 就能把任意的壓縮資料送進解碼器。Node.js 的 Brotli 解碼器曾有越界寫入可遠端執行
 * 程式碼的漏洞（CVE-2026-111497），不解壓就碰不到這一類問題。
 *
 * 前端送資料從來不壓縮，正常使用不受影響；帶 Content-Encoding 的請求直接回 415。
 */
export const createJsonBodyParser = ({ limit = '5mb' } = {}) => {
  const parse = express.json({ limit, inflate: false });
  return (req, res, next) => parse(req, res, (err) => {
    if (!err) return next();
    // 預設的錯誤頁是一段 HTML，前端解析不了；與其他 API 一樣回 JSON
    if (err.type === 'encoding.unsupported') {
      return res.status(415).json({ success: false, error: '不接受壓縮過的請求內容' });
    }
    return next(err);
  });
};
