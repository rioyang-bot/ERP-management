// ============================================================================
// 具名查詢的參數前處理
// ----------------------------------------------------------------------------
// 由 /api/namedQuery、/api/transaction 與 Electron 的 IPC 共用，
// 確保無論走哪條路徑，同一組參數的處理方式完全一致。
// ============================================================================

import { sanitizeParams } from './sanitize.js';

/**
 * @param {unknown[]} params 原始參數
 * @param {string} sql       目標 SQL，用於推算需要補齊到幾個參數
 * @returns {unknown[]}
 */
export const prepareQueryParams = (params, sql) => {
  // 1. 安全性過濾（依 SECURITY_GUIDELINES）
  const sanitized = sanitizeParams(Array.isArray(params) ? params : []);

  // 2. 物件轉為 JSON 字串（供 JSONB 欄位使用）
  const processed = sanitized.map((p) =>
    (typeof p === 'object' && p !== null) ? JSON.stringify(p) : p);

  // 3. 補齊 SQL 所需的最大參數數量，避免少傳選擇性參數時 pg 報錯
  const matches = String(sql).match(/\$(\d+)/g);
  if (matches) {
    const maxIdx = Math.max(...matches.map((m) => parseInt(m.substring(1), 10)));
    while (processed.length < maxIdx) processed.push(null);
  }

  return processed;
};
