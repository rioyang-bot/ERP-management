/**
 * ISO 27001 定期檢查紀錄（雙周檢視一次的表單）
 *
 *   S-409-01 備份檢查紀錄表：防火牆、Core Switch 組態檔案；正常要填最後備份日（文字）
 *   S-409-02 日誌審查紀錄表：防火牆、Core Switch 的 System Log／Event Log
 *
 * 每次檢查在報表中心新增一筆（pages/IsoPeriodicCheck.jsx）：
 *   - 日期：新增時帶今天，可以改（不能選未來）
 *   - 結果：每個項目勾「正常」或「異常」，異常要寫說明
 *   - 檢查人員：新增時登入的帳號（伺服器寫入，見 server/isoPeriodicCheckRoutes.js）
 *
 * 照公司範本排成 A4 橫式下載 PDF（components/IsoPeriodicCheckSheet.jsx）：
 * 一次檢查佔兩列（防火牆、Core Switch），日期合併兩列；欄位、欄寬、一頁幾次照各自的範本。
 *
 * 營運總覽顯示每張表最後一次的日期，超過兩週（REVIEW_INTERVAL_DAYS）沒做就醒目提醒。
 */
import { rocYear, formatRocDate } from './isoEquipmentForm';

export { rocYear, formatRocDate };

/** 雙周檢視一次：距離上次超過這個天數就提醒 */
export const REVIEW_INTERVAL_DAYS = 14;

const COMMON_META = { publishDate: '115/06/01', version: 'v1.0', confidentiality: '內部使用', remark: '備註：雙周檢視一次' };

/**
 * 表單定義；伺服器 server/isoPeriodicCheckRoutes.js 有對應的一份（測試比對兩邊一致）
 *
 * items：label 是畫面上的名稱，sheetLabel 是表單上印的（照範本），detail 是內容說明
 * columns：表單的欄位，w 是範本的欄寬（twips）；key 決定那一格放什麼（見 IsoPeriodicCheckSheet）
 * lastBackup：勾正常時要填最後備份日
 */
export const ISO_CHECK_FORMS = {
  'S-409-01': {
    ...COMMON_META,
    code: 'S-409-01',
    docNo: 'S-409-01',
    docName: '備份檢查紀錄表',
    verb: '檢查',
    path: '/iso-backup-check',
    lastBackup: true,
    perPage: 4,
    rowHeight: 56,
    summary: '防火牆、Core Switch 組態檔案備份',
    items: [
      { key: 'FIREWALL', label: '防火牆', sheetLabel: '防火牆', detail: '組態檔案(雙周備份)' },
      { key: 'CORE_SWITCH', label: 'Core Switch', sheetLabel: 'Core Switch組態檔案', detail: '組態檔案(雙周備份)' },
    ],
    columns: [
      { key: 'date', label: '檢查日期', w: 2085 },
      { key: 'item', label: '備份項目', w: 2612 },
      { key: 'detail', label: '備份內容', w: 2895 },
      { key: 'result', label: '檢查結果', w: 4335 },
      { key: 'reviewer', label: '檢查人員', w: 2782 },
    ],
  },
  'S-409-02': {
    ...COMMON_META,
    code: 'S-409-02',
    docNo: 'S-409-02',
    docName: '日誌審查紀錄表',
    verb: '審查',
    path: '/iso-log-review',
    lastBackup: false,
    perPage: 3,
    rowHeight: 62,
    summary: '防火牆、Core Switch 的 System Log／Event Log',
    items: [
      { key: 'FIREWALL', label: '防火牆', sheetLabel: '防火牆', detail: 'System Log、Event Log' },
      { key: 'CORE_SWITCH', label: 'Core Switch', sheetLabel: 'Core Switch', detail: 'System Log、Event Log' },
    ],
    columns: [
      { key: 'date', label: '審查日期', w: 1702 },
      { key: 'itemDetail', label: '審查內容', w: 3846 },
      { key: 'result', label: '審查結果', w: 6785 },
      { key: 'reviewer', label: '審查人員', w: 2268 },
    ],
  },
};

/** 營運總覽、報表中心的排列順序 */
export const ISO_CHECK_FORM_CODES = ['S-409-01', 'S-409-02'];

export const STATUS_LABEL = { NORMAL: '正常', ABNORMAL: '異常' };

const pad = (n) => String(n).padStart(2, '0');

/** 本地的今天（toISOString 在台灣早上 8 點前會是前一天） */
export const todayYmd = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** 兩個 YYYY-MM-DD 相差幾天（b − a），只看日期不看時區 */
export const daysBetween = (a, b) => {
  const toUtc = (s) => {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
};

/**
 * 最後一次到今天幾天、是否超過兩週
 * @param {string|null} lastDate YYYY-MM-DD；沒有任何紀錄是 null
 * @returns {{ lastDate: string|null, days: number|null, overdue: boolean }}
 */
export const reviewStatus = (lastDate, now = new Date()) => {
  if (!lastDate) return { lastDate: null, days: null, overdue: true };
  const days = daysBetween(lastDate, todayYmd(now));
  return { lastDate, days, overdue: days > REVIEW_INTERVAL_DAYS };
};

/** 6 天前／今天；未來的日期（時區差）當成今天 */
export const daysAgoText = (days) => (days == null ? '' : days <= 0 ? '今天' : `${days} 天前`);

/** 新增時的空白結果：每個項目都還沒勾 */
export const emptyResults = (def) => def.items.map((i) => ({ key: i.key, status: '', note: '', ...(def.lastBackup ? { lastBackup: '' } : {}) }));

/** 這筆紀錄某個項目的結果 */
export const resultOf = (record, key) => (record?.results || []).find((r) => r.key === key) || null;

/** 送出的內容：異常才帶說明、正常才帶最後備份日，都去頭尾空白 */
export const toPayload = (def, checkDate, results) => ({
  checkDate,
  results: results.map((r) => ({
    key: r.key,
    status: r.status,
    note: r.status === 'ABNORMAL' ? String(r.note || '').trim() : '',
    ...(def.lastBackup ? { lastBackup: r.status === 'NORMAL' ? String(r.lastBackup || '').trim() : '' } : {}),
  })),
});

/** 前端先檢查一次（伺服器還會再檢查） */
export const validateCheck = (def, { checkDate, results }, today = todayYmd()) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkDate || '')) return `請選擇${def.verb}日期。`;
  if (checkDate > today) return `${def.verb}日期不能是未來的日期。`;
  for (const item of def.items) {
    const r = (results || []).find((x) => x.key === item.key);
    if (!r || !STATUS_LABEL[r.status]) return `請勾選「${item.label}」的${def.verb}結果（正常或異常）。`;
    if (r.status === 'ABNORMAL' && !String(r.note || '').trim()) return `「${item.label}」勾了異常，請填寫異常說明。`;
    if (def.lastBackup && r.status === 'NORMAL' && !String(r.lastBackup || '').trim()) return `「${item.label}」勾了正常，請填寫最後備份日。`;
  }
  return '';
};

/** 這一年的紀錄，表單上由舊到新排 */
export const recordsOfYear = (records = [], year) => records
  .filter((r) => String(r.checkDate || '').startsWith(`${year}-`))
  .sort((a, b) => (a.checkDate === b.checkDate ? a.id - b.id : a.checkDate < b.checkDate ? -1 : 1));

/** 分頁：一頁 perPage 次，最後一頁補空白（null）；沒有紀錄也有一頁空白表單 */
export const paginateRecords = (records = [], perPage) => {
  const pages = [];
  for (let i = 0; i < Math.max(records.length, 1); i += perPage) {
    const page = records.slice(i, i + perPage);
    while (page.length < perPage) page.push(null);
    pages.push(page);
  }
  return pages;
};

export const formFileName = (def, year) => `${def.code}${def.docName}_${rocYear(year)}年.pdf`;
