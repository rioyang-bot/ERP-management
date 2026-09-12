// 測試用的交易替身
//
// 正式環境中 runTransaction 會把整串步驟送到伺服器，在單一交易中執行。
// 測試裡沒有真實資料庫，因此改為把每個步驟轉發給既有的 namedQuery 模擬，
// 並以相同規則解析 { $ref: '步驟名.rows.0.id' }。
//
// 這麼做可讓測試繼續驗證「實際寫入了哪些查詢、帶了哪些參數」，
// 不必因為呼叫路徑改變而放棄既有的驗證。

const resolvePath = (results, path) => {
  const segments = String(path).split('.');
  let current = results;
  for (const seg of segments) {
    if (current === null || current === undefined) {
      throw new Error(`步驟參照無法解析：${path}`);
    }
    current = Array.isArray(current) ? current[Number(seg)] : current[seg];
  }
  return current;
};

/**
 * @param {Function} namedQueryMock 測試中使用的 namedQuery 模擬函式
 * @returns {(steps: Array) => Promise<{success: boolean, results?: object, error?: string}>}
 */
export const createRunTransactionMock = (namedQueryMock) => async (steps) => {
  const results = {};
  for (const step of steps || []) {
    const params = (step.params || []).map((p) =>
      (p && typeof p === 'object' && !Array.isArray(p) && typeof p.$ref === 'string')
        ? resolvePath(results, p.$ref)
        : p);

    const res = await namedQueryMock(step.queryName, params);

    // 任一步失敗即整批失敗，對應正式環境的回滾行為
    if (res && res.success === false) {
      return { success: false, error: res.error || `步驟 ${step.queryName} 失敗` };
    }
    if (step.id) {
      results[step.id] = { rows: res?.rows || [], rowCount: res?.rowCount ?? (res?.rows?.length || 0) };
    }
  }
  return { success: true, results };
};
