import { fixMojibake } from './encoding';

/**
 * 匯入檔的欄位對應
 *
 * 同一個欄位在不同來源的檔案裡叫法都不一樣（Project Date、安裝日期、Installed Date…），
 * 因此以「別名清單」比對，忽略大小寫、空格與括號等符號。
 *
 * 兩個原則：
 * 1. **空的欄位不算數。** 檔案裡常常同時存在一個空的英文欄位與一個真正有值的
 *    中文欄位（例如空白的「Project Date」與有值的「安裝日期(Project Date)」）。
 *    先比到空的那個就回報找不到，等於整欄資料被一個空欄位擋掉。
 * 2. **別名的順序決定優先。** 由精確到通用排列，先比對完一個別名的所有欄位
 *    再換下一個；以欄位在檔案中的先後決定會讓結果隨檔案的欄位順序而變。
 */

/** 比對用的正規化：忽略大小寫、空白與常見符號 */
export const normalizeHeader = (str) => String(str ?? '')
  .trim()
  .toLowerCase()
  .replace(/[\s_()\-[\]/\\:]/g, '');

/** 有內容才算數：空字串與只有空白都視為沒填 */
const hasContent = (val) => val !== undefined && val !== null && String(val).trim() !== '';

/** 數字保持原型（Excel 序列日期要靠它），其餘修復亂碼後去除前後空白 */
const takeValue = (val) => (typeof val === 'number' ? val : fixMojibake(String(val).trim()));

/**
 * 從某一列中取出指定欄位的值。
 *
 * @param {object} rowObj           匯入檔解析後的一列（欄位名稱 → 值）
 * @param {string[]} possibleKeys   欄位別名，由精確到通用排列
 * @param {string[]} [excludedKeywords] 欄位名稱含這些字就跳過（例如取「類型」時排除「OS Type」）
 * @returns {string|number} 找不到或全部為空時回傳空字串
 */
export function findColumnValue(rowObj, possibleKeys, excludedKeywords = []) {
  if (!rowObj) return '';

  const keys = Object.keys(rowObj).filter((key) => {
    const nk = normalizeHeader(key);
    return !excludedKeywords.some((ex) => nk.includes(String(ex).toLowerCase()));
  });
  const aliases = (Array.isArray(possibleKeys) ? possibleKeys : []).map(normalizeHeader);

  // 1. 名稱完全相符
  for (const alias of aliases) {
    if (!alias) continue;
    for (const key of keys) {
      if (normalizeHeader(key) === alias && hasContent(rowObj[key])) return takeValue(rowObj[key]);
    }
  }

  // 2. 名稱包含別名（例如「安裝日期(Project Date)」含「安裝日期」）
  for (const alias of aliases) {
    if (alias.length < 2) continue;
    for (const key of keys) {
      if (normalizeHeader(key).includes(alias) && hasContent(rowObj[key])) return takeValue(rowObj[key]);
    }
  }

  return '';
}

export default findColumnValue;
