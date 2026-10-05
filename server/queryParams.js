// ============================================================================
// 具名查詢的參數前處理
// ----------------------------------------------------------------------------
// 由 /api/namedQuery、/api/transaction 與 Electron 的 IPC 共用，
// 確保無論走哪條路徑，同一組參數的處理方式完全一致。
// ============================================================================

import { sanitizeParams } from './sanitize.js';
import { freeTextIndexes } from './freeTextParams.js';

/**
 * 這個參數在 SQL 裡是不是被轉成 PostgreSQL 陣列，例如 `$1::text[]`、`$2::int[]`。
 * 必須寫明轉型才算 —— 沒寫的陣列參數照舊轉 JSON 字串給 JSONB 欄位用。
 * @param {string} sql
 * @param {number} n 參數編號（$n）
 */
export const isPgArrayParam = (sql, n) =>
  new RegExp(`\\$${n}::[a-z_ ]+\\[\\]`, 'i').test(String(sql));

/**
 * @param {unknown[]} params 原始參數
 * @param {string} sql       目標 SQL，用於推算需要補齊到幾個參數
 * @param {string} [queryName] 具名查詢名稱；白名單裡的說明文字參數不刪特殊字元
 * @returns {unknown[]}
 */
export const prepareQueryParams = (params, sql, queryName) => {
  // 1. 安全性過濾（依 SECURITY_GUIDELINES；說明文字例外見 freeTextParams.js）
  const sanitized = sanitizeParams(Array.isArray(params) ? params : [], freeTextIndexes(queryName));

  // 2. 物件轉為 JSON 字串（供 JSONB 欄位使用）。
  //    例外：SQL 明確把這個參數轉成 PostgreSQL 陣列（$1::text[]、$1::int[]）時，
  //    陣列要原樣交給 pg，由它轉成陣列格式。先前一律 JSON.stringify，
  //    $1::text[] 收到 ["A","B"] 會報 malformed array literal ——
  //    確認進貨的序號檢查、刪除進貨單的動用檢查都因此在伺服器上失敗。
  const processed = sanitized.map((p, i) => {
    if (Array.isArray(p) && isPgArrayParam(sql, i + 1)) return p;
    return (typeof p === 'object' && p !== null) ? JSON.stringify(p) : p;
  });

  // 3. 補齊 SQL 所需的最大參數數量，避免少傳選擇性參數時 pg 報錯
  const matches = String(sql).match(/\$(\d+)/g);
  if (matches) {
    const maxIdx = Math.max(...matches.map((m) => parseInt(m.substring(1), 10)));
    while (processed.length < maxIdx) processed.push(null);
  }

  return processed;
};
