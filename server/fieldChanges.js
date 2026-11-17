// ============================================================================
// 欄位變更紀錄：每個改到的欄位都記「變更前 → 變更後」
// ----------------------------------------------------------------------------
// 事件查詢與品項履歷都要看得出「改了哪個欄位、從什麼改成什麼」。
// 敘述（summary）寫成「欄位：舊 → 新」，履歷只顯示敘述也看得懂；
// details.changes 存結構化的清單，事件查詢用表格列出變更前／變更後。
// 照片與附件記的是檔名（變更前的檔名 → 變更後的檔名）。
//
// 純函式、不碰資料庫與瀏覽器：伺服器的路由（server/*Routes.js）與前端
// （src/utils/auditLogger.js 轉出）共用這一份，兩邊的格式才會一致。
// 放在 server/ 是因為部署只上傳 server/，不上傳 src/。
// ============================================================================

export const EMPTY_TEXT = '（空白）';

/** 欄位值轉成可比較、可閱讀的文字（null/undefined 為空字串，陣列以頓號串接） */
export function normalizeValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(normalizeValue).filter(Boolean).join('、');
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
}

/**
 * 比對變更前後的資料，回傳有變的欄位
 * @param {object} before 變更前（例如資料庫讀回來的原始那筆）
 * @param {object} after  變更後（要寫回的內容）
 * @param {{ key: string, label: string, format?: (value: any, row: object) => any }[]} fields
 *        要比對的欄位；format 用來把代碼轉成顯示文字（例如 FOR_SALE → 銷售用）
 * @returns {{ field: string, label: string, from: string, to: string }[]}
 */
export function diffFields(before = {}, after = {}, fields = []) {
  const changes = [];
  for (const { key, label, format } of fields) {
    const show = (row) => normalizeValue(format ? format(row?.[key], row || {}) : row?.[key]);
    const from = show(before);
    const to = show(after);
    if (from !== to) changes.push({ field: key, label: label || key, from, to });
  }
  return changes;
}

/** 檔案（照片、附件、LOGO、簽名）的變更：記檔名；沒換回傳 null */
export function fileChange(label, oldName, newName, field = 'file') {
  const from = normalizeValue(oldName);
  const to = normalizeValue(newName);
  return from === to ? null : { field, label, from, to, kind: 'file' };
}

/** 取網址或路徑最後的檔名（/uploads/assets/abc.jpg → abc.jpg）；data: 開頭的內嵌圖片回傳說明文字 */
export function fileNameOf(value) {
  const s = normalizeValue(value);
  if (!s) return '';
  if (s.startsWith('data:')) return '（內嵌圖片）';
  const clean = s.split(/[?#]/)[0];
  const name = clean.substring(clean.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(name) || clean;
  } catch {
    return name || clean;
  }
}

/** 變更清單 → 敘述文字「欄位：舊 → 新；欄位：舊 → 新」 */
export function describeChanges(changes = []) {
  return (changes || [])
    .filter(Boolean)
    .map((c) => `${c.label}：${c.from || EMPTY_TEXT} → ${c.to || EMPTY_TEXT}`)
    .join('；');
}

export default { EMPTY_TEXT, normalizeValue, diffFields, fileChange, fileNameOf, describeChanges };
