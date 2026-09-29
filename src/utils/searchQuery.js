/**
 * 列表搜尋的關鍵字解析
 *
 * 同一位客戶在匯入時被寫成好幾種（郭沛晴 = Niky / Yuanta QFII / 元大 郭沛晴…），
 * 搜其中一種找不到另一種。
 *
 * 先前試過「自動依聯絡人展開」，但那個做法會放大得太離譜：End-user 是 QRT 的
 * 那幾台，搜「QRT」時會先命中聯絡人，再把那位聯絡人名下所有設備全撈出來 ——
 * 使用者要的只是 QRT 那幾台。自動展開猜不準使用者是在找「這個欄位」還是「這個人」。
 *
 * 改成讓使用者自己講：逗號分組，組與組之間是「或」。
 *
 *   NIKY              只有 NIKY 那些
 *   NIKY,郭沛晴        兩種寫法都列出來
 *   yuanta niky,郭沛晴 組內仍然是「且」，維持原本以空白分隔的行為
 *
 * 半形與全形逗號都可以 —— 中文輸入法打出來常常是全形。
 */

/**
 * 把查詢字串拆成「或」的群組，每組內是「且」的關鍵字。
 *
 * @returns {string[][]} 例如 'a b,c' → [['a','b'], ['c']]；空查詢回空陣列
 */
export function parseSearchQuery(query) {
  return String(query ?? '')
    .toLowerCase()
    .split(/[,，]/)
    .map((group) => group.split(/\s+/).filter(Boolean))
    .filter((group) => group.length > 0);
}

/**
 * 有任何一組全部命中就算命中。
 *
 * @param {string[][]} groups parseSearchQuery 的結果
 * @param {(term: string) => boolean} matchTerm 單一關鍵字怎麼比對，由呼叫端決定
 */
export function matchesSearchQuery(groups, matchTerm) {
  if (!Array.isArray(groups) || groups.length === 0) return true;
  return groups.some((terms) => terms.every((term) => matchTerm(term)));
}

/** 搜尋框的提示文字，三個列表共用一句 */
export const SEARCH_PLACEHOLDER = '快速搜尋...（多組請用逗號分隔）';
