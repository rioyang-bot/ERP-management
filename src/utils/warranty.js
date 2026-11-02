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

/**
 * 這筆資產是否已完全沒有保固。
 *
 * 只有「有填到期日、而且填了的每一種保固都已過期」才算過保。
 * 原廠保固過了但客戶保固還在，對客戶而言仍在保固責任內，不算過保；
 * 一次延保、二次延保也各算一種保固，延保還在就不算過保；
 * 完全沒填到期日則是狀況不明，同樣不算過保，以免被當成過期處理。
 *
 * @param {{warranty_expire?: any, customer_warranty_expire?: any, ews1_expire?: any, ews2_expire?: any}} item
 * @param {Date} [today] 便於測試指定基準日
 */
export function isFullyOutOfWarranty(item, today = new Date()) {
  const states = [item?.warranty_expire, item?.customer_warranty_expire, item?.ews1_expire, item?.ews2_expire]
    .map((d) => getWarrantyState(d, today))
    .filter(Boolean);

  if (states.length === 0) return false;
  return states.every((s) => s.status === 'EXPIRED');
}

// ---------------------------------------------------------------------------
// 由年數算保固到期
//   原廠保固到期 = 進貨日期 + 原廠保固(年)
//   客戶保固到期 = 安裝日期 + 客戶保固(年)
// 沒選年數（或沒有基準日期）就沿用手動填的到期日，舊資料照舊。
// 真正存檔時由資料庫算（database/queries.js 的 WARRANTY_FROM_YEARS），
// 這裡是畫面上的即時預覽，規則必須一致。
// ---------------------------------------------------------------------------

/** 原廠／客戶保固可選的年數 */
export const WARRANTY_YEAR_OPTIONS = [1, 2, 3, 4, 5];

/**
 * 'YYYY-MM-DD' 加上整數年。與 PostgreSQL 的 date + make_interval(years => n) 相同：
 * 2/29 加到平年會落在 2/28。基準日或年數不合法時回傳 null。
 */
export function addYears(dateStr, years) {
  const n = Number(years);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr ?? ''));
  if (!m || !Number.isInteger(n) || n <= 0) return null;
  const y = Number(m[1]) + n;
  const month = Number(m[2]);
  const lastDay = new Date(Date.UTC(y, month, 0)).getUTCDate();
  return `${y}-${m[2]}-${String(Math.min(Number(m[3]), lastDay)).padStart(2, '0')}`;
}

/** 到期日是否由年數自動算出：有選年數、也有基準日期 */
export const isAutoWarranty = (baseDate, years) => addYears(baseDate, years) !== null;

/** 編輯視窗要存的到期日：能自動算就用算的，否則用手動填的 */
export function resolveWarrantyExpire(baseDate, years, manual) {
  return addYears(baseDate, years) || manual || null;
}

/**
 * 編輯視窗裡跟保固有關的欄位，與事件紀錄的中文名稱。
 * 括號用全形：伺服器的參數過濾會刪掉半形 ( )，事件紀錄會變成「原廠保固年」
 */
export const WARRANTY_FIELDS = [
  ['stock_date', '進貨日期'],
  ['installed_date', '安裝日期'],
  ['warranty_years', '原廠保固（年）'],
  ['warranty_expire', '原廠保固到期'],
  ['customer_warranty_years', '客戶保固（年）'],
  ['customer_warranty_expire', '客戶保固到期'],
  ['ews1_expire', '一次延保（1st EWS）'],
  ['ews2_expire', '二次延保（2nd EWS）'],
];

const normWarrantyValue = (key, v) => {
  if (v === null || v === undefined || v === '') return '';
  return key.endsWith('_years') ? String(Number(v)) : String(v).slice(0, 10);
};

/**
 * 從資產資料取出編輯視窗用的保固欄位：日期統一成 'YYYY-MM-DD'，年數成字串，沒有就是 ''
 */
export function pickWarrantyFields(item) {
  return Object.fromEntries(WARRANTY_FIELDS.map(([k]) => [k, normWarrantyValue(k, item?.[k])]));
}

/**
 * 編輯後要存的保固欄位：到期日依年數算好
 * @returns {object} 與 pickWarrantyFields 同樣的鍵
 */
export function finalizeWarrantyFields(item) {
  const f = pickWarrantyFields(item);
  f.warranty_expire = resolveWarrantyExpire(f.stock_date, f.warranty_years, f.warranty_expire) || '';
  f.customer_warranty_expire = resolveWarrantyExpire(f.installed_date, f.customer_warranty_years, f.customer_warranty_expire) || '';
  return f;
}

/** 新增設備／硬體表單的保固欄位初始值 */
export const EMPTY_WARRANTY_FORM = Object.freeze(Object.fromEntries(WARRANTY_FIELDS.map(([k]) => [k, ''])));

/** 新增時寫進事件紀錄的保固欄位：只列有填的 */
export function filledWarrantyFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).filter(([k, v]) => WARRANTY_FIELDS.some(([f]) => f === k) && v !== '' && v !== null && v !== undefined));
}

/** updateAssetWarrantyInfo 的參數 */
export function warrantyInfoParams(fields, id) {
  const v = (x) => (x === '' || x === undefined ? null : x);
  const n = (x) => (x === '' || x === undefined || x === null ? null : Number(x));
  return [
    v(fields.stock_date), v(fields.installed_date),
    n(fields.warranty_years), v(fields.warranty_expire),
    n(fields.customer_warranty_years), v(fields.customer_warranty_expire),
    parseInt(id, 10),
    v(fields.ews1_expire), v(fields.ews2_expire),
  ];
}

/**
 * 保固欄位的異動，給事件紀錄用。例如：
 *   [{ field: 'warranty_years', label: '原廠保固(年)', from: '', to: '3' }]
 */
export function diffWarrantyFields(before, after) {
  const b = pickWarrantyFields(before);
  const a = pickWarrantyFields(after);
  return WARRANTY_FIELDS
    .filter(([k]) => b[k] !== a[k])
    .map(([k, label]) => ({ field: k, label, from: b[k], to: a[k] }));
}

/** 把異動寫成一句話：原廠保固（年）「--」→「3 年」、原廠保固到期「--」→「2029-10-01」 */
export function describeWarrantyChanges(changes) {
  const show = (field, v) => (v === '' ? '--' : field.endsWith('_years') ? `${v} 年` : v);
  return changes.map((c) => `${c.label}「${show(c.field, c.from)}」→「${show(c.field, c.to)}」`).join('、');
}
