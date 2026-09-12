// 類型 / 廠牌 / 型號 的統一正規化
//
// 這三個欄位是品項卡片的歸戶依據，若大小寫或前後空白不一致，
// 同一個品項會被拆成多張卡片、下拉選單也會出現重複選項。
// 因此不論是手動新增或批次匯入，一律以本函式正規化後才寫入。
//
// 注意：資料庫端（database/queries.js）同樣以 UPPER(TRIM(...)) 再保險一次，
// 此處負責讓畫面上的狀態即時與寫入值一致。
// 規格 (specification) 不在此列，它可不填且常含描述文字，維持原樣。

/**
 * 正規化類型／廠牌／型號名稱：去除前後空白、將連續空白收斂為單一空白、英文轉大寫。
 * 中文與數字不受 toUpperCase() 影響。
 * @param {unknown} value
 * @returns {string} 正規化後的字串；輸入為 null/undefined 時回傳空字串
 */
export const normalizeMasterName = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ').toUpperCase();
};

/**
 * 供比對用的鍵值（等同 normalizeMasterName，另外提供語意化名稱）。
 * @param {...unknown} parts
 * @returns {string} 以 ___ 串接的正規化鍵值
 */
export const masterKey = (...parts) => parts.map(normalizeMasterName).join('___');

export default normalizeMasterName;
