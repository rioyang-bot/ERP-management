/**
 * 盤點表的近三個月結存
 *
 * 伺服器每月記一筆當下的庫存作為上個月的結餘（見 server/monthlyBalance.js）。
 * 這裡把那些紀錄整理成盤點表要的形狀：每一列對應到它自己的三個月數字。
 */

/**
 * 從結存紀錄取出要顯示的月份，由新到舊，最多三個。
 *
 * @param {Array<{month: string}>} rows
 * @returns {string[]} 例如 ['2026-09', '2026-08', '2026-07']
 */
export function getBalanceMonths(rows) {
  const months = [...new Set((rows || []).map((r) => r.month).filter(Boolean))];
  return months.sort().reverse().slice(0, 3);
}

/**
 * 整理成 { item_master_id: { '2026-09': 總數, ... } }。
 *
 * 耗材的結存分庫存與實驗室兩筆，盤點表上的「系統庫存」也是兩者分開列，
 * 但月結存只呈現一個數字，因此以兩者相加作為該月的總持有量。
 *
 * @param {Array} rows fetchRecentMonthlyBalances 的結果
 */
export function indexBalances(rows) {
  const map = {};
  (rows || []).forEach((r) => {
    const id = r.item_master_id;
    if (id === null || id === undefined) return;
    if (!map[id]) map[id] = {};
    map[id][r.month] = (Number(r.stock_qty) || 0) + (Number(r.lab_qty) || 0);
  });
  return map;
}

/**
 * 取某一列在某個月的數字。
 *
 * 還沒有那個月的紀錄時回傳 null，由呼叫端顯示為「—」——
 * 顯示 0 會讓人以為當時庫存是零，而不是「當時還沒開始記錄」。
 */
export function getBalance(balances, itemMasterId, month) {
  const value = balances?.[itemMasterId]?.[month];
  return value === undefined ? null : value;
}

export default indexBalances;
