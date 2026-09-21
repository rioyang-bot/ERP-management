// ============================================================================
// 每月結餘庫存的產生
// ----------------------------------------------------------------------------
// 盤點表要能對照近三個月的庫存，但系統裡沒有異動流水表可以回推 ——
// 耗材的庫存有九條寫入路徑，其中調撥與匯入不留任何有日期的紀錄。
// 因此改為每月記一筆當下的庫存，作為上個月的結餘。
//
// 為什麼不用外部排程：
//   伺服器本來就有一個每小時的清理排程（逾期連線階段），沿用同一個節奏即可，
//   不必再多一個 Windows 工作排程要維護。每小時檢查一次「上個月的結存記了沒」，
//   沒記就補 —— 1 日當天伺服器沒開機也不會漏掉，開機後第一次檢查就會補上。
//
// 補記的代價：若 1 日沒開機、5 日才補，記到的是 5 日當下的庫存，
// 與真正的月底結存會有落差。這一點寫在盤點表的說明裡，不隱瞞。
// ============================================================================

/** 某個日期所屬月份的 1 日，回傳 YYYY-MM-DD */
export const firstOfMonth = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

/** 上一個月的 1 日 */
export const previousMonth = (date) => {
  const d = new Date(date);
  return firstOfMonth(new Date(d.getFullYear(), d.getMonth() - 1, 1));
};

/** 過了這麼多天之後才記，數字已經不能代表上個月的結餘 */
export const GRACE_DAYS = 7;

/**
 * 依目前時間判斷這次該不該記、記哪一個月。
 *
 * 記下的永遠是「執行當下的庫存」，因此只有在月初執行，這個數字才等於
 * 上個月的結餘。離月初越遠，這個月的進出就累積得越多，記下來的就不是結餘了。
 * 所以只在每月前 7 天（GRACE_DAYS）內補記，而且只補上一個月：
 *
 *   • 月中才安裝或部署 —— 這次不記。上個月我們根本沒在看，
 *     把今天的庫存寫成上個月的結餘是捏造數字。下個月 1 日才開始記。
 *   • 1 日沒開機、3 日才開 —— 記，數字是 3 日的，與月底有幾天落差（說明裡有寫）。
 *   • 整個月都沒開機 —— 中間漏掉的月份直接放棄，不回頭補。
 *     那些月份的庫存無從得知，填今天的數字只會讓報表看起來有資料而已。
 *
 * @param {string|null} latestMonth 已記錄到的最後一個月（YYYY-MM-DD），沒有則為 null
 * @param {Date} now
 * @returns {string[]} 這次要產生的月份（0 或 1 個）
 */
export function monthsToGenerate(latestMonth, now = new Date()) {
  if (now.getDate() > GRACE_DAYS) return [];

  const target = previousMonth(now);
  if (latestMonth && firstOfMonth(latestMonth) >= target) return [];

  return [target];
}

/**
 * 補齊缺少的月結存。
 *
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {Record<string,string>} deps.namedQueries
 * @returns {Promise<{ generated: string[] }>}
 */
export async function ensureMonthlyBalances({ pool, namedQueries }, now = new Date()) {
  const latest = await pool.query(namedQueries.fetchLatestBalanceMonth);
  const latestMonth = latest.rows[0]?.latest_month || null;

  const months = monthsToGenerate(latestMonth, now);
  const generated = [];
  for (const month of months) {
    const res = await pool.query(namedQueries.generateMonthlyBalances, [month]);
    if (res.rowCount > 0) generated.push(month);
  }
  return { generated };
}

export default ensureMonthlyBalances;
