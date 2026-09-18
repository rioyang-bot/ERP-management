/**
 * 交貨簽收單的品項來源
 *
 * 出貨單有兩種品項形狀：
 *   建單畫面上的暫存清單  數量欄是 qty
 *   資料庫讀回來的明細    數量欄是 quantity（outbound_items.quantity）
 *
 * 交貨簽收單吃的是資料庫那一種。先前建單後自動彈出的簽收單直接把畫面上的
 * 清單交過去，quantity 是 undefined，每一列就退回預設值 1 ——
 * 關掉再從出貨單列表開一次（那時是從資料庫讀的）數量才正確。
 */

/**
 * 轉成交貨簽收單看得懂的形狀。
 *
 * @param {Array} items 建單畫面上的品項清單
 * @returns {Array} 具有 quantity 欄位的品項
 */
export function toReceiptItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    // 已經是資料庫形狀就不要動它
    const quantity = item?.quantity ?? item?.qty;
    const n = Number(quantity);
    return { ...item, quantity: Number.isFinite(n) && n > 0 ? n : 1 };
  });
}

export default toReceiptItems;
