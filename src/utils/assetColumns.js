/**
 * 設備／硬體列表的欄位組合
 *
 * 類型、廠牌、型號、規格原本散在兩欄，現在併成一欄兩行呈現：
 *   第一行  類型 / 廠牌
 *   第二行  型號 / 規格
 *
 * 這些欄位常常有缺（尤其規格），直接用字串樣板會留下 "SERVER - " 或 " / 56C"
 * 這種半截的字，因此一律以本函式組合。
 */

/**
 * 以「 / 」串接有值的部分。
 *
 * @param {...unknown} parts 要串接的欄位值
 * @returns {string} 全部為空時回傳 '--'
 */
export function joinParts(...parts) {
  const kept = parts
    .map((p) => (p === null || p === undefined ? '' : String(p).trim()))
    .filter((p) => p !== '');
  return kept.length > 0 ? kept.join(' / ') : '--';
}

export default joinParts;

/**
 * 首欄四個識別欄位各自的顏色。
 *
 * 取自主題變數而非寫死色碼，深淺色主題各有一組值（見 index.css）。
 */
export const ASSET_PART_COLORS = {
  type: 'var(--asset-type-color)',
  brand: 'var(--asset-brand-color)',
  model: 'var(--asset-model-color)',
  specification: 'var(--asset-spec-color)',
};
