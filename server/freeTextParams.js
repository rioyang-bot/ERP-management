// ============================================================================
// 自由文字參數白名單
// ----------------------------------------------------------------------------
// sanitizeParams 依 SECURITY_GUIDELINES.md 第 1 節刪除 | & ; $ % @ ' \ ( ) +
// 與換行，並濾掉 Select、Insert 等英文字。對名稱、代碼這類欄位沒有影響，
// 但拍攝說明是給人看的指示：「正面 & 背面」「(關機狀態)」會被刪字，
// 分行寫的步驟會黏成一行，連「Insert the cable」都會少掉一個字。
//
// 這裡明確列出「哪一支查詢的第幾個參數」是說明文字，只有這些參數：
//   - 不刪特殊字元、不濾英文字、保留換行（CRLF 統一成 LF）
//   - 仍然移除其他控制字元，並限制長度
// 其餘所有參數維持原本的過濾。
//
// 安全性不受影響的原因：具名查詢一律以 $1、$2 參數化傳給 PostgreSQL，
// 參數內容不會被當成 SQL 解讀；畫面顯示走 React 的預設轉義，列印走 escapeHtml。
//
// 新增項目時只加真正的長篇說明欄位，並同步更新 SECURITY_GUIDELINES.md 的例外清單。
// ============================================================================

/** 查詢名稱 → 自由文字參數的索引（從 0 起算，$1 就是 0） */
export const FREE_TEXT_PARAMS = Object.freeze({
  insertChecklistItem: [4],                   // $5 拍照項目說明
  updateChecklistItemDescription: [0],        // $1 拍照項目說明
  syncAssetChecklistDescriptionBySource: [0], // $1 拍照項目說明
  insertChecklistPhotoExample: [1],           // $2 範例說明
  updateChecklistPhotoExample: [1],           // $2 範例說明
});

/** 說明文字的長度上限 */
export const FREE_TEXT_MAX_LENGTH = 2000;

/** 這支查詢的哪些參數是自由文字 */
export const freeTextIndexes = (queryName) => new Set(FREE_TEXT_PARAMS[queryName] || []);

/**
 * 自由文字的清理：保留可見字元與換行，其他控制字元移除，超過上限截斷。
 */
export const cleanFreeText = (val) => {
  if (typeof val !== 'string') return val;
  return val
    .replace(/\r\n?/g, '\n')
    // 保留 \t 與 \n，其餘 C0 控制字元與 DEL 移除
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '')
    .slice(0, FREE_TEXT_MAX_LENGTH)
    .trim();
};
