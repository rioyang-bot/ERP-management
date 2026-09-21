/**
 * 拖曳排序：把一筆項目移到另一筆的位置
 *
 * 只算出新的順序，不碰畫面也不碰資料庫 —— 排序規則本身是最容易出錯的地方
 * （往下拖時索引會因為先移除而偏掉一格），單獨拉出來才測得到。
 */

/**
 * 把 sourceId 移到 targetId 原本的位置，其餘項目遞補。
 *
 * 目標索引取「原始清單」裡的位置，而不是移除來源之後再找 ——
 * 往下拖時移除會讓後面整體前移一格，用移除後的索引會少放一格，
 * 拖到最後一項時永遠停在倒數第二。用原始索引則兩個方向都剛好落在目標原位。
 *
 * @param {Array<{id: any}>} list 目前的順序
 * @param {any} sourceId 被拖曳的項目 id
 * @param {any} targetId 放開時所在的項目 id
 * @returns {Array} 新的順序；來源或目標不存在、或兩者相同時原樣返回
 */
export function moveItem(list, sourceId, targetId) {
  const items = Array.isArray(list) ? [...list] : [];
  if (sourceId === targetId) return items;

  const from = items.findIndex((i) => i?.id === sourceId);
  const to = items.findIndex((i) => i?.id === targetId);
  if (from < 0 || to < 0) return items;

  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
  return items;
}

/**
 * 把排好的項目組成 reorderChecklistItems 的參數。
 * 與該查詢的 string_to_array 分隔方式綁在一起，改一邊就會對不起來。
 */
export function buildOrderParam(list) {
  return (Array.isArray(list) ? list : [])
    .map((i) => i?.id)
    .filter((id) => id !== undefined && id !== null)
    .join(',');
}

export default moveItem;
