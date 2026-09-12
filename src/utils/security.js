/**
 * 安全性過濾函式（前端引用點）
 *
 * 實作已移至 server/sanitize.js —— 部署時只會上傳 dist / database / server /
 * scripts，不會上傳 src/，若實作留在這裡會導致伺服器端找不到模組。
 * 此檔保留原有的匯出，前端與既有測試的引用方式不需變動。
 */
export {
  sanitizeParams,
  sanitizeInput,
  sanitizeSearchInput,
  default as default,
} from '../../server/sanitize.js';
