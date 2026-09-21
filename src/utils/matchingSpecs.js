/**
 * 「套用既有規格」的候選清單
 *
 * 原本是把所有既有卡片的規格去重後全部列出來，不管使用者選了什麼類型、
 * 廠牌、型號 —— 幾百筆不相干的規格擠在一個下拉裡，要找的那一個反而難挑。
 *
 * 改為只列出「符合目前已選條件」的規格：選了什麼就用什麼來縮小範圍，
 * 三個都還沒選就不列（這時候任何規格都談不上相關）。
 */

const norm = (v) => String(v ?? '').trim().toUpperCase();

/**
 * 依目前選取的類型／廠牌／型號，取出既有卡片用過的規格。
 *
 * 只以「已經填了的」欄位過濾：例如只選了廠牌，就列出該廠牌用過的所有規格；
 * 三個都選了，就只剩下那個組合用過的。
 *
 * @param {Array<{type?: string, brand?: string, model?: string, specification?: string}>} cards
 * @param {{ type?: string, brand?: string, model?: string }} selection
 * @returns {string[]} 去重並排序後的規格；沒有相符的回空陣列
 */
export function getMatchingSpecs(cards, selection = {}) {
  const type = norm(selection.type);
  const brand = norm(selection.brand);
  const model = norm(selection.model);

  // 什麼都還沒選的時候不給建議 —— 全部列出來等於沒有過濾
  if (!type && !brand && !model) return [];

  const matched = (Array.isArray(cards) ? cards : []).filter((c) => {
    if (type && norm(c.type) !== type) return false;
    if (brand && norm(c.brand) !== brand) return false;
    if (model && norm(c.model) !== model) return false;
    return true;
  });

  const specs = matched
    .map((c) => String(c.specification ?? '').trim())
    .filter((s) => s !== '');

  return [...new Set(specs)].sort((a, b) => a.localeCompare(b));
}

export default getMatchingSpecs;
