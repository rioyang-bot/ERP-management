/**
 * 保固狀態判定
 *
 * 規則集中在這裡，畫面只負責呈現。日後要調整「即將到期」的天數門檻，
 * 或是別的頁面也要用到保固狀態，都從這裡取用。
 */

/** 即將到期的天數門檻 */
export const EXPIRING_SOON_DAYS = 90;

/** 去掉時分秒，只保留日期 */
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * 依到期日算出保固狀態。
 *
 * 以「日」為單位比較，不受當下時間影響：到期日當天仍算保固內，隔天才算過期。
 * 沒有填到期日時回傳 null —— 沒填不等於過期，不應被標成紅色。
 *
 * @param {string|Date|null|undefined} expireDate
 * @param {Date} [today] 便於測試指定基準日
 * @returns {{status: 'VALID'|'EXPIRING'|'EXPIRED', days: number} | null}
 *          days 為距離到期日的天數，已過期時為負數。
 */
export function getWarrantyState(expireDate, today = new Date()) {
  if (!expireDate) return null;

  const expire = new Date(expireDate);
  if (Number.isNaN(expire.getTime())) return null;

  const days = Math.round((startOfDay(expire) - startOfDay(today)) / 86400000);

  if (days < 0) return { status: 'EXPIRED', days };
  if (days <= EXPIRING_SOON_DAYS) return { status: 'EXPIRING', days };
  return { status: 'VALID', days };
}
