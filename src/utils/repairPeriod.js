/**
 * 維修單列表：已結案的單只看一段期間
 *
 * 完工結案的單會一直累積，幾個月、幾年下來列表與卡片上的數字只會越來越大，
 * 日常用不到。未結案（現場處理、送修原廠、原廠返還）的單一律全部顯示；
 * 已結案的只顯示選定期間內完工的，預設近 3 個月。
 *
 * 搜尋時不受期間限制：打單號、序號或客戶就能找到以前的單。
 */

export const PERIODS = {
  MONTH: '本月',
  '3M': '近 3 個月',
  YEAR: '今年',
  ALL: '全部',
  CUSTOM: '自訂',
};

export const DEFAULT_PERIOD = '3M';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * 期間的起訖日（含當天），YYYY-MM-DD；沒有限制的一端為 null。
 * @param {string} period PERIODS 的 key
 * @param {{from?: string, to?: string}} custom 自訂的起訖
 */
export function periodRange(period, custom = {}, now = new Date()) {
  const today = ymd(now);
  switch (period) {
    case 'MONTH':
      return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case '3M': {
      const d = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      return { from: ymd(d), to: today };
    }
    case 'YEAR':
      return { from: `${now.getFullYear()}-01-01`, to: today };
    case 'CUSTOM':
      return { from: custom.from || null, to: custom.to || null };
    default:
      return { from: null, to: null };
  }
}

/** 結案日：完工出貨日；舊資料沒填的退回建立日 */
export const closedDateOf = (order) => {
  const raw = order?.completion_date || order?.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : ymd(d);
};

export const isClosed = (order) => order?.status === 'COMPLETED';

/** 這張單在不在期間內：未結案的永遠算在內 */
export function inPeriod(order, range) {
  if (!isClosed(order)) return true;
  if (!range.from && !range.to) return true;
  const d = closedDateOf(order);
  if (!d) return true;
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

/** 期間的說明文字，例如「近 3 個月」「2026-01-01 ～ 2026-03-31」 */
export function periodLabel(period, custom = {}) {
  if (period !== 'CUSTOM') return PERIODS[period] || PERIODS[DEFAULT_PERIOD];
  if (custom.from && custom.to) return `${custom.from} ～ ${custom.to}`;
  if (custom.from) return `${custom.from} 起`;
  if (custom.to) return `至 ${custom.to}`;
  return '自訂（未設定日期）';
}
