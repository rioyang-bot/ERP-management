/**
 * 維修代用機
 *
 * 客戶設備送修期間借一台給客戶暫用。代用機走借用單（借出、借貨申請單、延長、歸還照舊），
 * 借用單連回維修單（outbound_requests.repair_id），維修單上看得到代用機，
 * 完工出貨時提醒收回（可一併登記歸還，見 utils/lendReturn.js）。
 *
 * 跟「以庫存換貨」不同：代用機只是暫借，保固資訊不轉移。
 */

export const LOANER_STATUS_LABEL = { PENDING: '待借出', SHIPPED: '借出中', RETURNED: '已歸還' };

/** 送修期間（客戶的東西還沒交回）才能提供代用機；內部維修沒有客戶 */
export const canProvideLoaner = (order) => !!order && !order.is_internal
  && ['ON_SITE_HANDLING', 'SENT_OEM', 'OEM_RETURNED'].includes(order.status);

const loanersOf = (order) => (Array.isArray(order?.loaners) ? order.loaners : []);

/** 還沒歸還的（待借出、借出中） */
export const activeLoaners = (order) => loanersOf(order).filter((l) => l.status === 'PENDING' || l.status === 'SHIPPED');

/** 已經借出、還在客戶那邊的 —— 完工時要收回的 */
export const outstandingLoaners = (order) => loanersOf(order).filter((l) => l.status === 'SHIPPED');

/** 「DN-20261020-01（X0345623）」 */
export const loanerLabel = (l) => `${l.request_no}${l.sns ? `（${l.sns}）` : ''}`;
