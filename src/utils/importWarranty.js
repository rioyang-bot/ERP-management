import { findColumnValue } from './importColumnMatch';
import { resolveWarrantyExpire } from './warranty';

/**
 * 批次匯入：進貨日期、原廠保固(年)、客戶保固(年)
 *
 * 設備與硬體的匯入共用。到期日的規則與編輯視窗相同（src/utils/warranty.js）：
 *   原廠保固到期 = 進貨日期 + 原廠保固(年)
 *   客戶保固到期 = 安裝日期 + 客戶保固(年)
 * 檔案有填年數就以算出來的為準；沒填年數才用檔案裡的到期日。
 */

/** 進貨日期欄位的別名。Stock Data 是常見的手誤，照收 */
export const STOCK_DATE_ALIASES = [
  'Stock Date', 'StockDate', 'Stock Data', '進貨日期', '進貨日', '到貨日期', '到貨日',
  'Inbound Date', 'Received Date', 'Arrival Date',
];

export const WARRANTY_YEARS_ALIASES = [
  '原廠保固(年)', '原廠保固年數', '原廠保固年', '原廠保固年限',
  'Warranty (Years)', 'Warranty Years', 'Warranty Year', 'OEM Warranty Years',
];

export const CUSTOMER_WARRANTY_YEARS_ALIASES = [
  '客戶保固(年)', '客戶保固年數', '客戶保固年', '客戶保固年限',
  'Cust Warranty (Years)', 'Cust Warranty Years', 'Customer Warranty (Years)', 'Customer Warranty Years',
];

/**
 * 找到期日欄位時要跳過年數欄位：到期日的別名有「原廠保固」「客戶保固」，
 * 名稱包含比對會把「原廠保固(年)」的 3 當成到期日
 */
export const YEARS_COLUMN_KEYWORDS = ['年', 'year'];

/**
 * 年數：接受 3、'3'、'3年'、'3 年'、'3 years'、'3Y'，只收 1~5 的整數。
 * @returns {{ years: number|null, invalid: boolean }} 空白回傳 { years: null, invalid: false }
 */
export function parseWarrantyYears(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return { years: null, invalid: false };
  const m = /^(\d+(?:\.\d+)?)\s*(年|years?|y)?$/i.exec(String(raw).trim());
  const n = m ? Number(m[1]) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 5) return { years: null, invalid: true };
  return { years: n, invalid: false };
}

/**
 * 從匯入檔的一列取出進貨日期與兩種保固年數。
 *
 * @param {object} row 匯入檔的一列
 * @param {(raw: any) => string|null} parseDate 該匯入畫面的日期解析（各自支援 Excel 序列日期等格式）
 */
export function readImportWarranty(row, parseDate) {
  const rawStockDate = findColumnValue(row, STOCK_DATE_ALIASES);
  // 原廠的年數別名（Warranty Years）也包含在客戶的（Customer Warranty Years）裡，要排除
  const rawWarrantyYears = findColumnValue(row, WARRANTY_YEARS_ALIASES, ['客戶', 'cust']);
  const rawCustomerWarrantyYears = findColumnValue(row, CUSTOMER_WARRANTY_YEARS_ALIASES);
  const w = parseWarrantyYears(rawWarrantyYears);
  const c = parseWarrantyYears(rawCustomerWarrantyYears);
  return {
    stock_date: parseDate(rawStockDate),
    warranty_years: w.years,
    customer_warranty_years: c.years,
    rawStockDate,
    rawWarrantyYears,
    rawCustomerWarrantyYears,
    warrantyYearsInvalid: w.invalid,
    customerWarrantyYearsInvalid: c.invalid,
  };
}

/** 依年數算出要存的兩個到期日（算不出來就用檔案裡的） */
export function resolveImportExpiries({ stock_date, installed_date, warranty_years, customer_warranty_years, warranty_expire, customer_warranty_expire }) {
  return {
    warranty_expire: resolveWarrantyExpire(stock_date, warranty_years, warranty_expire),
    customer_warranty_expire: resolveWarrantyExpire(installed_date, customer_warranty_years, customer_warranty_expire),
  };
}

const yearsOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/** insertAssetRecord 的第 16~18 個參數（匯入與新增表單共用；表單的年數是字串） */
export const warrantyInsertTail = (item) => [
  item.stock_date || null,
  yearsOrNull(item.warranty_years),
  yearsOrNull(item.customer_warranty_years),
];

/** 匯入範本的範例欄位 */
export const WARRANTY_TEMPLATE_SAMPLE = {
  'Stock Date': '2024-07-01',
  '原廠保固(年)': 3,
  '客戶保固(年)': 3,
};
