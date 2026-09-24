/**
 * 類型／廠牌／型號／規格等名稱的輸入檢查
 *
 * 原本這段檢查在六個檔案裡各抄了一份（設備／硬體／耗材的建檔頁與彈窗），
 * 內容完全一樣，但只要有一份跟伺服器的規則對不上，就會出現「資料庫裡存得進去、
 * 表單卻選不出來」的死結 —— 集中在這裡是為了讓前後端只有一份規則要對照。
 *
 * 字元清單刻意和 server/sanitize.js 對齊：規範要求濾除的是
 * | & ; $ % @ ' \ ( ) + CR LF，其中**不含雙引號 "**（伺服器端排除它以支援 JSON）。
 * 前端曾經多擋了 " 和 ,，結果像 `SATA 2.5" SSD` 這種以吋數命名的類型
 * （3.5"、19" 也同理）建得起來卻選不得，只好靠匯入繞過檢查。
 */

/** 規範要求濾除的特殊字元，與 server/sanitize.js 同一份清單 */
export const UNSAFE_NAME_CHARS = /[|&;$%@'\\()+\r\n]/;

/** Mass SQL Injection 規範要求的關鍵字 */
export const UNSAFE_NAME_KEYWORDS = /\b(Select|Insert|Dbo|Declare|Cast|Drop|Union|Exec|Nvarchar)\b/i;

/** 名稱是否含有不合規的字元或關鍵字 */
export function isUnsafeName(val) {
  if (typeof val !== 'string' || !val) return false;
  return UNSAFE_NAME_CHARS.test(val) || UNSAFE_NAME_KEYWORDS.test(val);
}

/**
 * 檢查使用者「新輸入」的名稱：合規就回傳去掉前後空白的字串，不合規回傳 null。
 *
 * 只用在新輸入的值。從下拉選單挑出來的既有資料不該再檢查一次 ——
 * 那些值早就存在資料庫裡，擋下來也不會變乾淨，只會讓人完全無法建檔。
 */
export function validateName(val, fieldName = '欄位', notify = (msg) => globalThis.alert?.(msg)) {
  if (typeof val !== 'string' || !val) return val;
  if (isUnsafeName(val)) {
    notify(`「${fieldName}」包含不合規的安全規則字元或關鍵字，請移除特殊符號。`);
    return null;
  }
  return val.trim();
}
