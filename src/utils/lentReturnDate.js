/**
 * 借用單：延長預計歸還日
 *
 * 借出中的單，客戶常常會要求多借一段時間。原本只有「待借出」的單能編輯，
 * 一出庫預計歸還日就改不了，只能看著它變成逾期。
 *
 * 日期一律用本地的年月日比較：資料庫的 DATE 送到前端會變成當地午夜的時間，
 * 用 toISOString() 取日期在台灣會往前少一天。
 */

const pad = (n) => String(n).padStart(2, '0');

/** 任何日期值 → 本地的 YYYY-MM-DD；無效或空值回傳 null */
export function toLocalYmd(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD 加幾天 */
export function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  return toLocalYmd(new Date(y, m - 1, d + days));
}

/** 兩個 YYYY-MM-DD 相差幾天（b − a） */
export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
}

/**
 * 延長從哪一天起算：還沒到期從原本的預計歸還日往後加；
 * 已經逾期的從今天往後加，否則加了還是逾期。
 */
export function extensionBase(currentYmd, todayYmd) {
  if (!currentYmd || currentYmd < todayYmd) return todayYmd;
  return currentYmd;
}

/** 新的預計歸還日最早可以選哪一天 */
export function minExtensionDate(currentYmd, todayYmd) {
  const dayAfterCurrent = currentYmd ? addDays(currentYmd, 1) : todayYmd;
  return dayAfterCurrent > todayYmd ? dayAfterCurrent : todayYmd;
}

/**
 * 檢查新的預計歸還日。是「延長」，所以必須晚於原本的日期，也不能早於今天。
 * @returns {string|null} 錯誤訊息；沒問題回傳 null
 */
export function validateExtension(currentYmd, nextYmd, todayYmd) {
  if (!nextYmd) return '請選擇新的預計歸還日。';
  if (currentYmd && nextYmd <= currentYmd) return `新的預計歸還日必須晚於目前的 ${currentYmd}。`;
  if (nextYmd < todayYmd) return '新的預計歸還日不能早於今天。';
  return null;
}
