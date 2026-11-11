/**
 * 建檔下拉選單的連動：選了上一層，下一層只列出既有卡片裡真的有的組合
 *
 * 設備／硬體的順序是 類型 → 廠牌 → 型號，耗材是 廠牌 → 類型 → 型號。
 * 原本只有「廠牌 → 型號」有連動；選了類型，廠牌還是列出全部，容易選到這個類型底下
 * 根本沒有的廠牌。改成依既有卡片（fetchExistingCards）縮小範圍。
 *
 * 不縮小的情況（維持原本的完整清單）：
 *   - 條件還沒選（例如還沒選類型）
 *   - 條件是這次才新增、還沒有任何卡片的值（新類型底下當然還沒有廠牌）
 * 這次新增的暫存值（keep）一律保留，才選得到。
 */
const norm = (s) => String(s ?? '').trim().toUpperCase();

/**
 * @param {string[]} names 原本的選項
 * @param {object[]} cards 既有卡片（brand / type / model）
 * @param {'brand'|'type'|'model'} field 要列出的欄位
 * @param {object} conds 已選的條件，例如 { type: 'SERVER' }、{ brand, type }
 * @param {string[]} keep 這次新增的暫存值，一律保留
 */
export function optionsMatching(names, cards, field, conds = {}, keep = []) {
  const entries = Object.entries(conds).filter(([, v]) => norm(v) !== '');
  if (entries.length === 0 || !cards?.length) return names;
  const matched = cards.filter((c) => entries.every(([k, v]) => norm(c[k]) === norm(v)));
  // 這個條件還沒有任何卡片（新類型、新廠牌）：沒有依據可以縮小
  if (matched.length === 0) return names;
  const allowed = new Set(matched.map((c) => norm(c[field])));
  return names.filter((n) => allowed.has(norm(n)) || keep.includes(n));
}
