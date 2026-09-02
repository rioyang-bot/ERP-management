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
    workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: false, codepage: 65001 });
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: true });

  // 對物件內所有 key 與 value 進行防禦性修復
  return rawJson.map(row => {
    const cleanedRow = {};
    for (const [k, v] of Object.entries(row)) {
      const cleanKey = fixMojibake(String(k).trim());
      const cleanVal = typeof v === 'string' ? fixMojibake(v.trim()) : v;
      cleanedRow[cleanKey] = cleanVal;
    }
    return cleanedRow;
  });
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
    workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: false, codepage: 65001 });
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const raw2D = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });

  return raw2D.map(row => {
    if (!Array.isArray(row)) return [];
    return row.map(cell => typeof cell === 'string' ? fixMojibake(cell.trim()) : cell);
  });
}

export default {
  fixMojibake,
  decodeTextBuffer,
  parseSpreadsheetFile,
  parseSpreadsheet2D
};
