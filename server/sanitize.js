/**
 * 依照 SECURITY_GUIDELINES.md 實作的安全性過濾函式
 * 用於處理 Named Query 的參數過濾
 *
 * 放在 server/ 之下的原因：這是伺服器端的輸入處理，而 deploy 只會上傳
 * dist / database / server / scripts，不會上傳 src/。原本放在
 * src/utils/security.js 會導致伺服器啟動時找不到模組。
 * src/utils/security.js 改為從這裡再匯出，前端與測試的引用方式不受影響。
 *
 * 注意：本函式會「刪除」字串中的特殊字元，屬於破壞性處理。
 * 密碼相關流程刻意不使用它（見 server/authRoutes.js 的說明）。
 */
export function sanitizeParams(params) {
  if (!Array.isArray(params)) return [];
  return params.map(val => {
    if (typeof val !== 'string') return val;

    // 1. 濾除規範要求的特殊字元列表 (排除雙引號 " 以支援 JSON)
    // | & ; $ % @ ' \ ( ) + CR LF ,
    let s = val.replace(/[|&;$%@'\\()+\r\n]/g, '');

    // 2. 濾除 Mass SQL Injection 強制要求的關鍵字
    const sqlKeywords = /\b(Select|Insert|Dbo|Declare|Cast|Drop|Union|Exec|Nvarchar)\b/gi;
    s = s.replace(sqlKeywords, '');

    return s.trim();
  });
}

export function sanitizeInput(val) {
  if (typeof val !== 'string') return val;
  let s = val.replace(/[|&;$%@'\\()+\r\n]/g, '');
  const sqlKeywords = /\b(Select|Insert|Dbo|Declare|Cast|Drop|Union|Exec|Nvarchar)\b/gi;
  return s.replace(sqlKeywords, '').trim();
}

export function sanitizeSearchInput(val) {
  return sanitizeInput(val);
}

export default {
  sanitizeParams,
  sanitizeInput,
  sanitizeSearchInput
};
