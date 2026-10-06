/**
 * 出機檢查表：複製主項目
 *
 * 選一個既有的主項目、輸入新名稱，底下的主要檢查功能、細項、拍照項目
 * （含拍攝說明與順序）全部複製一份。適合「另一個機種大致一樣、改幾項就好」。
 *
 * 主項目是依廠牌／型號自動套用到設備的。新主項目若跟來源一樣的範圍，
 * 符合的設備會同時套用兩份，項目重複出現 —— 因此複製時一併選適用範圍，
 * 範圍相同要再確認一次。
 */

const norm = (s) => String(s ?? '').trim().toUpperCase();

/** 兩個主項目的適用範圍（廠牌＋型號）是否相同；沒有廠牌時型號不算 */
export function sameScope(a, b) {
  const brandA = norm(a?.brand);
  const brandB = norm(b?.brand);
  if (brandA !== brandB) return false;
  if (!brandA) return true;
  return norm(a?.model) === norm(b?.model);
}

/**
 * @param {object} draft { name, brand, model }
 * @param {object[]} groups 既有的主項目
 * @returns {string|null} 錯誤訊息；沒問題回傳 null
 */
export function validateGroupCopy(draft, groups = []) {
  const name = String(draft?.name ?? '').trim();
  if (!name) return '請輸入新的主項目名稱。';
  // 資料庫的唯一條件：同一個廠牌底下名稱不可重複（忽略大小寫）
  const clash = groups.find((g) => norm(g.brand) === norm(draft.brand) && norm(g.name) === norm(name));
  if (clash) return `「${clash.brand || '通用'}」底下已經有名為「${clash.name}」的主項目，請換一個名稱。`;
  return null;
}

/**
 * 交易步驟：先建新主項目，再把來源的項目整批搬過去。
 * 任何一步失敗整批退回，不會留下只有名稱、沒有項目的主項目。
 */
export function buildGroupCopySteps(sourceId, draft, sortOrder) {
  const brand = String(draft.brand ?? '').trim() || null;
  const model = brand ? (String(draft.model ?? '').trim() || null) : null;
  return [
    {
      id: 'group',
      queryName: 'insertChecklistGroup',
      params: [String(draft.name).trim(), brand, sortOrder, model],
      expectRows: 1,
      errorMessage: '建立新的主項目失敗',
    },
    {
      queryName: 'copyChecklistItems',
      params: [{ $ref: 'group.rows.0.id' }, sourceId],
    },
  ];
}
