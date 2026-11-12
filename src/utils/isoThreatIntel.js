/**
 * ISO 27001「S-413-02 威脅情資自我檢核表」：每月上傳 Word 檔、檢核人線上簽核一次
 *
 * 檢核表由威脅情資檢核專案每月產生，任何登入帳號都能上傳（每月 1 日）；
 * 月份取檢核表上的檢核日期（115/11/01 → 2026-11，內容是上個月的情資）。
 * 任何帳號都能簽，有一個人簽就算當月結案；下載的 Word 檔會把簽名填進「檢核人（簽章）」那一行。
 *
 * 本月狀態（檢核頁與營運總覽）：
 *   MISSING  2 日起還沒上傳 → 紅色醒目提醒
 *   WAITING  1 日當天還沒上傳 → 一般提示
 *   UNSIGNED 已上傳、還沒人簽 → 黃色提醒
 *   CLOSED   已簽核 → 結案
 * 伺服器端在 server/isoThreatIntelRoutes.js。
 */
import { formatRocDate, rocYear } from './isoEquipmentForm';

export { formatRocDate };

export const FORM_CODE = 'S-413-02';
export const FORM_META = { docNo: 'S-413-02', docName: '威脅情資自我檢核表' };
export const PATH = '/iso-threat-intel';

/** 每月幾號起還沒上傳就紅色提醒（1 日是上傳日） */
export const REMIND_FROM_DAY = 2;
/** 單檔上限（伺服器同樣檢查） */
export const MAX_FILE_BYTES = 3 * 1024 * 1024;

const pad = (n) => String(n).padStart(2, '0');

export const currentPeriod = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

/** 2026-11 → 115年11月 */
export const rocMonthLabel = (period) => `${rocYear(period.slice(0, 4))}年${period.slice(5, 7)}月`;

/** 2026-11 → 2026-10（檢核表的內容是上個月的情資） */
export const previousPeriod = (period) => {
  const [y, m] = period.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
};

/**
 * 本月狀態：latest 是最新一份（GET /latest 的 latest）
 * @returns {{ period: string, state: 'MISSING'|'WAITING'|'UNSIGNED'|'CLOSED', level: 'red'|'yellow'|'green'|'none' }}
 */
export const monthStatus = (latest, now = new Date()) => {
  const period = currentPeriod(now);
  if (!latest || latest.period !== period) {
    return now.getDate() >= REMIND_FROM_DAY ? { period, state: 'MISSING', level: 'red' } : { period, state: 'WAITING', level: 'none' };
  }
  return latest.signedByName ? { period, state: 'CLOSED', level: 'green' } : { period, state: 'UNSIGNED', level: 'yellow' };
};

/** 提醒的顏色（紅、黃、綠、一般） */
export const LEVEL_STYLE = {
  red: { border: 'rgba(220, 38, 38, 0.55)', bg: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' },
  yellow: { border: 'rgba(217, 119, 6, 0.55)', bg: 'rgba(245, 158, 11, 0.12)', color: '#b45309' },
  green: { border: 'rgba(16, 185, 129, 0.4)', bg: 'rgba(16, 185, 129, 0.08)', color: '#059669' },
  none: { border: 'var(--border-color)', bg: 'var(--bg-surface-subtle)', color: 'var(--text-main)' },
};

/** 讀檔成 base64（不含 data: 前綴） */
export const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
  reader.onerror = () => reject(new Error('讀不到這個檔案'));
  reader.readAsDataURL(file);
});

/** 檔案大小：123456 → 121 KB */
export const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** 簽核、上傳時間：115/11/12 14:30 */
export const formatRocDateTime = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${rocYear(d.getFullYear())}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
