/**
 * 搭載硬體 SN 欄位的即時篩選
 *
 * 那個欄位放的是「以逗號或空格分隔的多個序號」，使用者是在最後面接著打新的一筆。
 * 因此篩選要用「正在輸入的那一段」，不能拿整個欄位內容去比對 ——
 * 否則只要已經選過一筆，後面就永遠篩不出東西。
 */

/** 與欄位本身相同的分隔規則 */
const SEPARATOR = /[,，\s\n]+/;

/**
 * 取出使用者正在輸入的那一段序號。
 *
 * 已經以分隔符號結尾（例如「SN001, 」）代表上一筆已經打完，
 * 回傳空字串，清單就會顯示全部供下一筆挑選。
 *
 * @param {string} text 欄位目前的完整內容
 * @returns {string}
 */
export function getActiveSnTerm(text) {
  const raw = String(text || '');
  if (!raw) return '';
  // 結尾是分隔符號 → 這一筆已經輸入完畢
  if (SEPARATOR.test(raw.slice(-1))) return '';
  const parts = raw.split(SEPARATOR);
  return (parts[parts.length - 1] || '').trim();
}

/**
 * 依輸入的關鍵字篩選可掛載的硬體。
 *
 * 比對序號、廠牌、型號與類型，不分大小寫的部分比對 ——
 * 使用者常常只記得序號的後幾碼，或只想用廠牌縮小範圍。
 *
 * @param {Array} list 可掛載硬體清單
 * @param {string} term 關鍵字
 */
export function filterMountableHw(list, term) {
  const items = Array.isArray(list) ? list : [];
  const t = String(term || '').trim().toLowerCase();
  if (!t) return items;

  return items.filter((hw) => {
    const hay = [hw?.sn, hw?.brand, hw?.model, hw?.type]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(t);
  });
}
