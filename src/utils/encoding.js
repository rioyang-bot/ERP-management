import * as XLSX from 'xlsx';

// Windows-1252 to byte mapping for common Mojibake recovery
const win1252ToByte = {
  '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84, '\u2026': 0x85, '\u2020': 0x86, '\u2021': 0x87,
  '\u02C6': 0x88, '\u2030': 0x89, '\u0160': 0x8A, '\u2039': 0x8B, '\u0152': 0x8C, '\u017D': 0x8E, '\u2018': 0x91,
  '\u2019': 0x92, '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97, '\u02DC': 0x98,
  '\u2122': 0x99, '\u0161': 0x9A, '\u203A': 0x9B, '\u0153': 0x9C, '\u017E': 0x9E, '\u0178': 0x9F
};

/**
 * 智慧修復 UTF-8 誤以 Windows-1252 / Latin-1 解碼產生的亂碼字串
 * 例如: "Yuanta æ–°é‡‘" -> "Yuanta 新金"
 */
/**
 * 將試算表的儲存格值安全地轉為去除前後空白的字串。
 *
 * XLSX 讀取時，純數字的儲存格會回傳 number 而非 string（例如型號 12345、
 * 序號 007）。若直接對它呼叫 (val || '').trim() 會丟出
 * 「.trim is not a function」，在正式版建置中會讓整個畫面卸載成空白頁。
 * 另外 (val || '') 遇到數字 0 會被當成空值，此處一併避免。
 *
 * @param {unknown} value
 * @returns {string}
 */
export function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * 判斷 Excel 的數值格式字串是否為日期格式。
 *
 * 不使用 XLSX.SSF.is_date：SSF 只掛在 xlsx 的 default export 上，
 * 以 `import * as XLSX` 取用會是 undefined，這也正是原本序號日期轉換
 * 長期失效的原因（錯誤被 try/catch 吞掉）。此處自行判斷，不依賴匯出形式。
 *
 * @param {string} fmt Excel 數值格式，例如 mmm-yy、yyyy-mm-dd、#,##0.00
 * @returns {boolean}
 */
export function isDateFormat(fmt) {
  if (!fmt || typeof fmt !== 'string') return false;
  // 先移除引號包住的字面文字與 [紅色]、[$-409] 這類區段，避免誤判
  const stripped = fmt.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
  return /[ymdhs]/i.test(stripped);
}

/**
 * 將 Excel 日期序號轉為 YYYY-MM-DD。
 *
 * Excel 的序號基準為 1899-12-30（含其著名的 1900 閏年錯誤）。
 * 以純運算實作，不依賴 XLSX.SSF，因此在任何打包方式下都可用。
 *
 * @param {number|string} serial
 * @returns {string|null} 無法轉換時回傳 null
 */
export function excelSerialToDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 1 || n > 2958465) return null; // 上限為 9999-12-31
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  if (Number.isNaN(d.getTime())) return null;
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 將「日期格式」儲存格改為 Excel 實際顯示的文字。
 *
 * Excel 會把使用者輸入的「Jan-26」自動判讀成日期（2026 年 1 月），
 * 以序號 46023 儲存、再依格式 mmm-yy 顯示為 Jan-26。
 * 讀取時若取原始值，純文字欄位（例如「訂單來源」）就會變成 46023。
 *
 * 這裡改取儲存格的顯示文字 w，讓匯入結果與使用者在 Excel 中看到的一致：
 *   - 文字性質的欄位保留原樣（Jan-26）
 *   - 真正的日期欄位會拿到可讀的日期字串，仍由各匯入畫面的日期解析處理
 *
 * @param {object} worksheet XLSX 工作表物件（就地修改）
 */
export function preserveDisplayedDateText(worksheet) {
  if (!worksheet || typeof worksheet !== 'object') return worksheet;
  for (const addr of Object.keys(worksheet)) {
    if (addr.startsWith('!')) continue; // !ref、!margins 等中繼資料
    const cell = worksheet[addr];
    if (!cell || cell.t !== 'n') continue;          // 只處理數值型儲存格
    if (!isDateFormat(cell.z)) continue;            // 且格式必須是日期
    if (typeof cell.w !== 'string' || !cell.w) continue; // 需有顯示文字
    cell.t = 's';
    cell.v = cell.w;
  }
  return worksheet;
}

export function fixMojibake(str) {
  if (!str || typeof str !== 'string') return str;
  // 若包含典型的 UTF-8 -> Latin1 誤解碼字元 (如 æ, é, ‡, –, °, œ, ™ 等)
  if (!/[æøåéèêëíìîïóòôõöúùûüñç¿¡\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2021\u2026\u00B0\u00A0-\u00FF]/i.test(str)) {
    return str;
  }

  try {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const code = char.charCodeAt(0);
      if (win1252ToByte[char] !== undefined) {
        bytes.push(win1252ToByte[char]);
      } else if (code <= 0xFF) {
        bytes.push(code);
      } else {
        return str; // 若含有非 Latin1/Win1252 字元，則維持原樣
      }
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    return decoded;
  } catch (e) {
    return str;
  }
}

/**
 * 智慧解碼文字檔案 ArrayBuffer (支援 UTF-8 BOM, UTF-8, Big5 / CP950)
 */
export function decodeTextBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  
  // 1. 檢查 UTF-8 BOM (0xEF, 0xBB, 0xBF)
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    const utf8Decoder = new TextDecoder('utf-8');
    return utf8Decoder.decode(buffer.slice(3));
  }

  // 2. 嚴格模式測試是否為有效 UTF-8
  try {
    const utf8Strict = new TextDecoder('utf-8', { fatal: true });
    return utf8Strict.decode(buffer);
  } catch (e) {
    // 3. 若非有效 UTF-8 (例如繁體中文 Windows Excel 導出的 Big5/CP950 ANSI CSV)
    try {
      const big5Decoder = new TextDecoder('big5');
      return big5Decoder.decode(buffer);
    } catch (e2) {
      const fallbackDecoder = new TextDecoder('utf-8');
      return fallbackDecoder.decode(buffer);
    }
  }
}

/**
 * 讀取 Excel / CSV 檔案並自動校正中文字元編碼
 */
export async function parseSpreadsheetFile(selectedFile) {
  if (!selectedFile) return [];
  const fileName = (selectedFile.name || '').toLowerCase();
  const isCsv = fileName.endsWith('.csv') || fileName.endsWith('.txt');

  const arrayBuffer = await selectedFile.arrayBuffer();
  let workbook;

  if (isCsv) {
    const decodedText = decodeTextBuffer(arrayBuffer);
    workbook = XLSX.read(decodedText, { type: 'string', raw: true });
  } else {
    // cellNF 取得每格的數值格式，用以辨識日期格式的儲存格
    workbook = XLSX.read(new Uint8Array(arrayBuffer), {
      type: 'array', cellDates: false, codepage: 65001, cellNF: true,
    });
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  preserveDisplayedDateText(worksheet);
  const raw2D = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });
  const rawHeaderRow = (raw2D && raw2D[0] && Array.isArray(raw2D[0])) ? raw2D[0] : [];
  const cleanRawHeaders = rawHeaderRow.map(h => fixMojibake(String(h || '').trim())).filter(Boolean);

  const headerCounts = {};
  const duplicateHeaders = [];
  cleanRawHeaders.forEach(h => {
    const norm = h.toLowerCase();
    headerCounts[norm] = (headerCounts[norm] || 0) + 1;
    if (headerCounts[norm] === 2) {
      duplicateHeaders.push(h);
    }
  });

  const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: true });

  // 對物件內所有 key 與 value 進行防禦性修復
  const cleanedRows = rawJson.map(row => {
    const cleanedRow = {};
    for (const [k, v] of Object.entries(row)) {
      const cleanKey = fixMojibake(String(k).trim());
      const cleanVal = typeof v === 'string' ? fixMojibake(v.trim()) : v;
      cleanedRow[cleanKey] = cleanVal;
    }
    return cleanedRow;
  });

  cleanedRows._duplicateHeaders = duplicateHeaders;
  cleanedRows._rawHeaders = cleanRawHeaders;
  return cleanedRows;
}

/**
 * 讀取 Excel / CSV 檔案並回傳 2D 陣列 (用於處理階層標題等複雜結構)
 */
export async function parseSpreadsheet2D(selectedFile) {
  if (!selectedFile) return [];
  const fileName = (selectedFile.name || '').toLowerCase();
  const isCsv = fileName.endsWith('.csv') || fileName.endsWith('.txt');

  const arrayBuffer = await selectedFile.arrayBuffer();
  let workbook;

  if (isCsv) {
    const decodedText = decodeTextBuffer(arrayBuffer);
    workbook = XLSX.read(decodedText, { type: 'string', raw: true });
  } else {
    // cellNF 取得每格的數值格式，用以辨識日期格式的儲存格
    workbook = XLSX.read(new Uint8Array(arrayBuffer), {
      type: 'array', cellDates: false, codepage: 65001, cellNF: true,
    });
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  preserveDisplayedDateText(worksheet);
  const raw2D = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });

  return raw2D.map(row => {
    if (!Array.isArray(row)) return [];
    return row.map(cell => typeof cell === 'string' ? fixMojibake(cell.trim()) : cell);
  });
}

export default {
  asText,
  fixMojibake,
  decodeTextBuffer,
  parseSpreadsheetFile,
  parseSpreadsheet2D
};
