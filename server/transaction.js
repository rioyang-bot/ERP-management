// ============================================================================
// 多步驟交易執行器
// ----------------------------------------------------------------------------
// 問題：前端每次 namedQuery 都是獨立的 HTTP 請求，各自取用不同的連線，
//       因此「進貨入庫」這類需要連續寫入十幾筆的操作無法維持交易。
//       中途任一筆失敗，前面已寫入的就留在資料庫裡 —— 單據建立了但明細不全、
//       庫存加了但採購單狀態沒更新。
//
// 作法：前端一次送出整串步驟，伺服器在單一連線的單一交易中依序執行，
//       全部成功才提交，任一步失敗即全部回滾。
//
// 步驟間傳值：後面的步驟常需要前面步驟產生的 id（例如進貨單 id）。
//       在 params 中以 { "$ref": "步驟名.rows.0.id" } 表示，執行時會替換為
//       先前步驟的實際結果。只支援讀取已執行步驟的結果，不支援任意運算。
//
// 安全性：只接受 database/queries.js 中定義的具名查詢，不接受任意 SQL。
//       參數沿用與 /api/namedQuery 相同的處理方式。
// ============================================================================

const MAX_STEPS = 2000;

/** 解析 "步驟名.rows.0.id" 這樣的路徑 */
const resolvePath = (results, path) => {
  const segments = String(path).split('.');
  let current = results;
  for (const seg of segments) {
    if (current === null || current === undefined) {
      throw new Error(`步驟參照無法解析：${path}（在 "${seg}" 處中斷）`);
    }
    current = Array.isArray(current) ? current[Number(seg)] : current[seg];
  }
  if (current === undefined) {
    throw new Error(`步驟參照無對應值：${path}`);
  }
  return current;
};

/** 將 params 中的 { $ref: "..." } 替換為先前步驟的結果 */
const resolveParams = (params, results) =>
  (Array.isArray(params) ? params : []).map((p) => {
    if (p && typeof p === 'object' && !Array.isArray(p) && typeof p.$ref === 'string') {
      return resolvePath(results, p.$ref);
    }
    return p;
  });

/**
 * 在單一交易中依序執行多個具名查詢。
 *
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {Record<string,string>} deps.namedQueries  具名查詢字典
 * @param {(params: unknown[]) => unknown[]} deps.prepareParams
 *        參數前處理（清洗、JSON 字串化、補齊數量），與單筆查詢保持一致
 * @param {Array<{id?: string, queryName: string, params?: unknown[]}>} steps
 * @returns {Promise<{success: boolean, results?: object, error?: string, failedStep?: number}>}
 */
export const runTransaction = async ({ pool, namedQueries, prepareParams }, steps) => {
  if (!Array.isArray(steps) || steps.length === 0) {
    return { success: false, error: '交易內容為空。' };
  }
  if (steps.length > MAX_STEPS) {
    return { success: false, error: `單一交易的步驟數上限為 ${MAX_STEPS}，實際為 ${steps.length}。` };
  }

  // 先驗證所有查詢名稱，避免執行到一半才發現有無效項目
  for (let i = 0; i < steps.length; i++) {
    const name = steps[i]?.queryName;
    if (!name || !namedQueries[name]) {
      return { success: false, error: `第 ${i + 1} 步的查詢名稱無效：${name}`, failedStep: i };
    }
  }

  const client = await pool.connect();
  const results = {};
  try {
    await client.query('BEGIN');

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const sql = namedQueries[step.queryName];
      const params = prepareParams(resolveParams(step.params, results), sql);
      const r = await client.query(sql, params);
      const outcome = { rows: r.rows, rowCount: r.rowCount };
      // 具名步驟才保留結果，供後續步驟以 $ref 取用
      if (step.id) results[step.id] = outcome;
    }

    await client.query('COMMIT');
    return { success: true, results };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => { /* 回滾失敗時保留原始錯誤 */ });
    console.error('[Transaction] 已回滾:', error.message);
    return {
      success: false,
      error: error.message || '交易執行失敗，所有變更已回滾。',
    };
  } finally {
    client.release();
  }
};
