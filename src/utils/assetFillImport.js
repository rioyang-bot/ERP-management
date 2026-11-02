/**
 * 重新匯入時「補齊既有資產的空白欄位」
 *
 * 匯入原本只認新序號：序號已經在系統裡就整列擋掉，當初漏填的欄位補不回來，
 * 只能一筆一筆手動編輯。這裡負責算出「哪些欄位是空的、檔案裡剛好有值」，
 * 讓匯入可以只把空白處補上。
 *
 * 規則只有一條，而且不留例外：**已經有值的欄位一律不動**。
 * 匯入檔的內容不見得比系統裡的新，覆蓋過去就救不回來了；
 * 真的要改內容，走編輯視窗才看得到改了什麼。
 */

import { addYears } from './warranty';

/** 可補齊的資產欄位。順序即是 fillEmptyAssetFieldsBySn 的參數順序 */
export const FILLABLE_COLUMNS = [
  { key: 'client', label: '客戶' },
  { key: 'hostname', label: '主機名稱' },
  { key: 'location', label: '位置' },
  { key: 'remarks', label: '備註' },
  { key: 'installed_date', label: '安裝日期' },
  { key: 'customer_warranty_expire', label: '客戶保固到期' },
  { key: 'system_date', label: '系統日期' },
  { key: 'warranty_expire', label: '原廠保固到期' },
  { key: 'stock_date', label: '進貨日期' },
  { key: 'warranty_years', label: '原廠保固（年）' },
  { key: 'customer_warranty_years', label: '客戶保固（年）' },
];

/**
 * 由年數算的保固到期：基準日期 + 年數 → 到期日。
 * 補上基準日期或年數時，到期日跟著算 —— 既有的到期日若跟算出來的不同，
 * 補下去就等於改掉它，所以這一組的基準日期與年數都不補。
 */
const WARRANTY_PAIRS = [
  { base: 'stock_date', years: 'warranty_years', expire: 'warranty_expire' },
  { base: 'installed_date', years: 'customer_warranty_years', expire: 'customer_warranty_expire' },
];

/**
 * 不納入補齊的自訂屬性：這些是匯入自己留下的紀錄，不是使用者的資料。
 * 補齊時會另外寫入本次的紀錄，不需要從檔案帶進來。
 */
const BOOKKEEPING_ATTRS = new Set(['batch_imported', 'import_file', 'import_date', 'filled_by_import', 'fill_import_file', 'fill_import_date']);

/** 常見自訂屬性的顯示名稱，讓預覽看得懂是哪一欄 */
const ATTR_LABELS = {
  end_user: 'End-user',
  contact_person: '聯絡人',
  contact_phone: '聯絡電話',
  project_name: '專案名稱',
  order_source: '訂單來源',
  related_info: '關聯資訊',
  server_sn: '對應伺服器序號',
};

/** 空值判定：null、undefined、空字串與只有空白都算沒填 */
export const isEmptyValue = (v) => v === null || v === undefined || String(v).trim() === '';

/** 日期欄位在資料庫回來可能是 Date 或字串，一律轉成 YYYY-MM-DD 再比對 */
const asDateText = (v) => {
  if (isEmptyValue(v)) return '';
  if (v instanceof Date) return v.toISOString().split('T')[0];
  return String(v).split('T')[0];
};

/**
 * 資產欄位（不含自訂屬性）要補哪些。
 * blocked：檔案有值、既有是空的，卻因為會改掉既有保固到期而不補的欄位
 */
function planFillColumns(existing, row) {
  const columns = {};
  const blocked = [];

  FILLABLE_COLUMNS.forEach(({ key }) => {
    const incoming = row[key];
    if (isEmptyValue(incoming)) return;
    // 既有值不是空的就跳過，絕不覆蓋
    if (!isEmptyValue(existing[key])) return;
    columns[key] = incoming;
  });

  WARRANTY_PAIRS.forEach(({ base, years, expire }) => {
    const pick = (k) => (Object.prototype.hasOwnProperty.call(columns, k) ? columns[k] : existing[k]);
    const computed = addYears(asDateText(pick(base)), pick(years));
    if (!computed) return;
    if (!isEmptyValue(existing[expire])) {
      if (asDateText(existing[expire]) !== computed) {
        [base, years].forEach((k) => {
          if (Object.prototype.hasOwnProperty.call(columns, k)) { delete columns[k]; blocked.push(k); }
        });
      }
      return;
    }
    // 到期日是空的：補上算出來的（檔案裡也有到期日時，以年數算的為準，與資料庫相同）
    columns[expire] = computed;
  });

  return { columns, blocked };
}

/**
 * 算出某一列可以補進既有資產的內容。
 *
 * @param {object} existing 系統中既有的資產（含 custom_attributes）
 * @param {object} row      匯入檔解析後的那一列
 * @param {object} [options]
 * @param {Record<string,string>} [options.attributeLabels] 自訂欄位 id 對應的顯示名稱
 * @returns {{assetId: number, sn: string, columns: object, attributes: object, labels: string[], count: number}|null}
 *          沒有任何欄位可補時回傳 null
 */
export function buildFillPlan(existing, row, { attributeLabels = {} } = {}) {
  if (!existing || !row) return null;

  const { columns } = planFillColumns(existing, row);
  const labels = FILLABLE_COLUMNS.filter(({ key }) => Object.prototype.hasOwnProperty.call(columns, key)).map(({ label }) => label);

  const existingAttrs = (existing.custom_attributes && typeof existing.custom_attributes === 'object')
    ? existing.custom_attributes
    : {};
  const incomingAttrs = (row.custom_attributes && typeof row.custom_attributes === 'object')
    ? row.custom_attributes
    : {};

  const attributes = {};
  Object.entries(incomingAttrs).forEach(([key, value]) => {
    if (BOOKKEEPING_ATTRS.has(key)) return;
    if (isEmptyValue(value)) return;
    if (!isEmptyValue(existingAttrs[key])) return;
    attributes[key] = String(value).trim();
    labels.push(attributeLabels[key] || ATTR_LABELS[key] || key);
  });

  const count = Object.keys(columns).length + Object.keys(attributes).length;
  if (count === 0) return null;

  return { assetId: existing.id, sn: existing.sn, columns, attributes, labels, count };
}

/**
 * 既有資產中「已經有值、因此這次不會被動到」的欄位，用於告知使用者哪些沒被覆蓋。
 *
 * @returns {string[]} 欄位顯示名稱
 */
export function getKeptFieldLabels(existing, row) {
  if (!existing || !row) return [];
  const kept = [];
  FILLABLE_COLUMNS.forEach(({ key, label }) => {
    if (isEmptyValue(row[key])) return;
    if (isEmptyValue(existing[key])) return;
    // 兩邊都有值但內容相同時不算「保留原值」，使用者不需要知道
    const same = String(existing[key]).trim() === String(row[key]).trim()
      || asDateText(existing[key]) === asDateText(row[key]);
    if (!same) kept.push(label);
  });
  // 既有是空的、但補了會改掉既有保固到期的基準日期與年數，也算「保留原狀」
  const { blocked } = planFillColumns(existing, row);
  FILLABLE_COLUMNS.forEach(({ key, label }) => { if (blocked.includes(key)) kept.push(label); });
  return kept;
}

/**
 * 組出 fillEmptyAssetFieldsBySn 的參數。
 * 沒有要補的欄位傳 null，SQL 端會維持原值不動。
 *
 * 自訂屬性以「物件」而非 JSON 字串回傳：具名查詢的參數前處理會對字串做安全
 * 過濾（濾掉 ( ) + @ $ 等字元），JSON 內容會被改壞；物件則是在過濾之後才轉成
 * JSON，內容原封不動。
 *
 * @param {object} plan buildFillPlan 的結果
 * @param {object} [extraAttributes] 一併寫入的自訂屬性，例如這次補齊的來源檔名
 */
export function buildFillParams(plan, extraAttributes = {}) {
  if (!plan) return null;
  const cols = FILLABLE_COLUMNS.map(({ key }) => (
    Object.prototype.hasOwnProperty.call(plan.columns, key) ? plan.columns[key] : null
  ));
  return [plan.assetId, ...cols, { ...(plan.attributes || {}), ...extraAttributes }];
}

/**
 * 把序號清單組成 fetchAssetsBySnListForFill 的參數。
 * 與該查詢的 string_to_array 分隔方式綁在一起，改一邊就會對不起來。
 */
export function buildSnListParam(sns) {
  return (Array.isArray(sns) ? sns : [])
    .map((s) => String(s || '').trim().toUpperCase())
    .filter(Boolean)
    .join(',');
}

/** 以序號（大寫、去空白）為索引，方便與匯入檔的序號對起來 */
export function indexAssetsBySn(rows) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    const key = String(r?.sn || '').trim().toUpperCase();
    if (key) map.set(key, r);
  });
  return map;
}

export default buildFillPlan;
