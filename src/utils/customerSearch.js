/**
 * 同一位客戶的多種寫法
 *
 * 匯入時同一個人被寫成好幾種：郭沛晴有 Niky／Niky IMC／YCPFNiky／Yuanta Niky／
 * Yuanta QFII／元大 郭沛晴 六種，共 119 台；林耀群 374 台分成三種寫法。
 * 搜其中一種就找不到另一種的設備。
 *
 * 好消息是 contact_person 早就正規化了 —— 六種寫法底下的聯絡人都是「郭沛晴」。
 * 所以不必另外維護別名表，現有資料自己就是對照表：
 *
 *   1. 先用關鍵字比對「客戶身分」欄位（客戶、End-user、聯絡人）
 *   2. 取出命中那些列的聯絡人
 *   3. 把同一位聯絡人底下的資產全部納入
 *
 * 搜「niky」→ 命中聯絡人「郭沛晴」→ 展開成全部 119 台。
 *
 * 只從「客戶身分」欄位取聯絡人是關鍵：若連序號、型號都算，
 * 搜一組序號就會把那位客戶的整批設備全撈出來，那不是使用者要的。
 */

const norm = (v) => String(v ?? '').trim().toLowerCase();

/**
 * 從一列資料取出用來比對客戶身分的文字。
 * 呼叫端提供取值方式，設備與硬體的欄位名稱不同。
 */
export function identityText(item, { getClient, getEndUser, getContact }) {
  return [getClient?.(item), getEndUser?.(item), getContact?.(item)]
    .map(norm)
    .filter(Boolean)
    .join(' ');
}

/**
 * 找出關鍵字命中的聯絡人。
 *
 * 多個關鍵字之間是 AND，與列表既有的搜尋行為一致。
 *
 * @returns {Set<string>} 正規化後的聯絡人名稱；沒有命中就是空集合
 */
export function matchedContacts(items, terms, accessors) {
  const found = new Set();
  if (!Array.isArray(items) || !Array.isArray(terms) || terms.length === 0) return found;

  for (const item of items) {
    const contact = norm(accessors.getContact?.(item));
    if (!contact) continue;
    const text = identityText(item, accessors);
    if (terms.every((t) => text.includes(norm(t)))) found.add(contact);
  }
  return found;
}

/** 這一列是否屬於某位已命中的聯絡人 */
export function belongsToContacts(item, contacts, accessors) {
  if (!contacts || contacts.size === 0) return false;
  const contact = norm(accessors.getContact?.(item));
  return !!contact && contacts.has(contact);
}

/**
 * 因為展開而多納進來的客戶寫法，用來在畫面上說明「為什麼多出這些」。
 * 只列關鍵字本身沒有直接命中的那些寫法。
 */
export function expandedSpellings(items, contacts, terms, accessors) {
  if (!contacts || contacts.size === 0) return [];
  const out = new Set();
  for (const item of items) {
    if (!belongsToContacts(item, contacts, accessors)) continue;
    const client = String(accessors.getClient?.(item) ?? '').trim();
    if (!client) continue;
    const lower = norm(client);
    if (terms.some((t) => lower.includes(norm(t)))) continue; // 直接命中的不必解釋
    out.add(client);
  }
  return [...out].sort();
}
