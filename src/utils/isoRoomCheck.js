/**
 * ISO 27001「S-408-03 機房檢查表」：每週檢查一次，一個月一張表（A4 橫式）
 *
 * 版面照公司範本（S-408-03機房檢查表_v1.0.docx，見 components/IsoRoomCheckSheet.jsx）：
 *   - 欄：檢查項目、檢查項目說明、檢查 OOO 月份（第一～五周）、異常狀況說明
 *   - 列：日期時間、溫度、溼度、監視設備、門禁管理、設備管理、機房環境（正常 V、異常 ｘ）
 *   - 最下面一列：檢查人、單位主管（每月線上簽核一次）
 *
 * 1～7 日是第一周、8～14 日第二周…29 日以後第五周，同一周只能有一筆。
 * 填寫人只記在事件紀錄，不印在表單上。
 * 伺服器端在 server/isoRoomCheckRoutes.js（項目定義兩邊各一份，測試會比對一致）。
 */
import { rocYear, formatRocDate } from './isoEquipmentForm';
import { todayYmd, daysBetween } from './isoPeriodicCheck';

export { rocYear, formatRocDate, todayYmd };

export const FORM_CODE = 'S-408-03';

export const FORM_META = {
  docNo: 'S-408-03',
  docName: '機房檢查表',
  publishDate: '115/06/01',
  version: 'v1.0',
  confidentiality: '內部使用',
  remark: '備註：正常打“V”，異常打“ｘ”，並說明異常狀況及處理方式。',
};

export const PATH = '/iso-room-check';

/** 每週檢查一次：超過 7 天沒檢查，營運總覽就醒目提醒 */
export const CHECK_INTERVAL_DAYS = 7;

/** 打勾的項目（範本的檢查項目與說明） */
export const ITEMS = [
  { key: 'CCTV', label: '監視設備', detail: '檢視CCTV監控涵蓋範圍皆能符合鎖定區域、校時確認' },
  { key: 'ACCESS', label: '門禁管理', detail: '機房門禁已確實上鎖' },
  { key: 'EQUIPMENT', label: '設備管理', detail: '伺服器、網路設備，無異常燈號/聲音' },
  { key: 'ENVIRONMENT', label: '機房環境', detail: '1.檢視機房環境是否有存放不適切之物品\n2.維持環境整潔' },
];

/** 管制範圍：超出就算異常 */
export const TEMP_RANGE = { min: 15, max: 26 };
export const HUMIDITY_RANGE = { min: 40, max: 80 };
export const MAX_TEXT = 100;

/** 簽核角色：每月一次（檢查人任何帳號都能簽；單位主管要有權責主管的簽核權限） */
export const SIGN_ROLES = [
  { role: 'INSPECTOR', label: '檢查人' },
  { role: 'SUPERVISOR', label: '單位主管' },
];

export const WEEKS = [1, 2, 3, 4, 5];
export const WEEK_LABEL = ['', '第一周', '第二周', '第三周', '第四周', '第五周'];

const pad = (n) => String(n).padStart(2, '0');

/** 1～7 日第一周、8～14 日第二周…29 日以後第五周 */
export const weekOf = (ymd) => Math.min(5, Math.ceil(Number(String(ymd).slice(8, 10)) / 7));

/** 這個月第幾周涵蓋哪幾天：2026-11 第五周 → 29～30日；平年 2 月沒有第五周 */
export const weekRangeText = (period, week) => {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const from = (week - 1) * 7 + 1;
  if (from > last) return '這個月沒有';
  const to = week === 5 ? last : week * 7;
  return from === to ? `${from}日` : `${from}～${to}日`;
};

/** 2026-11 → 115年11月 */
export const rocMonthLabel = (period) => `${rocYear(period.slice(0, 4))}年${period.slice(5, 7)}月`;

export const currentPeriod = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
export const nowHm = (now = new Date()) => `${pad(now.getHours())}:${pad(now.getMinutes())}`;

/** 22.0 → 22、22.5 → 22.5 */
export const formatNumber = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '' : String(Math.round(Number(v) * 10) / 10));

export const tempOutOfRange = (t) => t !== '' && t !== null && t !== undefined && (Number(t) < TEMP_RANGE.min || Number(t) > TEMP_RANGE.max);
export const humidityOutOfRange = (h) => h !== '' && h !== null && h !== undefined && (Number(h) < HUMIDITY_RANGE.min || Number(h) > HUMIDITY_RANGE.max);

/** 有沒有異常：任一項勾異常，或溫度、溼度超出管制範圍 */
export const isAbnormal = ({ temperature, humidity, results }) => (
  ITEMS.some((i) => results?.[i.key] === 'ABNORMAL') || tempOutOfRange(temperature) || humidityOutOfRange(humidity)
);

/** 新增時的空白內容：日期、時間帶現在 */
export const emptyCheck = (now = new Date()) => ({
  checkDate: todayYmd(now),
  checkTime: nowHm(now),
  temperature: '',
  humidity: '',
  results: {},
  abnormalNote: '',
  abnormalAction: '',
});

/** 送出的內容：數字轉成數字，沒有異常就不帶說明 */
export const toPayload = (c) => {
  const payload = {
    checkDate: c.checkDate,
    checkTime: c.checkTime,
    temperature: c.temperature === '' ? '' : Number(c.temperature),
    humidity: c.humidity === '' ? '' : Number(c.humidity),
    results: Object.fromEntries(ITEMS.map((i) => [i.key, c.results?.[i.key] || ''])),
    abnormalNote: '',
    abnormalAction: '',
  };
  if (isAbnormal(payload)) {
    payload.abnormalNote = String(c.abnormalNote || '').trim();
    payload.abnormalAction = String(c.abnormalAction || '').trim();
  }
  return payload;
};

/** 前端先檢查一次（伺服器還會再檢查） */
export const validateCheck = (p, today = todayYmd()) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.checkDate || '')) return '請選擇檢查日期。';
  if (p.checkDate > today) return '檢查日期不能是未來的日期。';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.checkTime || '')) return '請填寫檢查時間。';
  if (p.temperature === '' || !Number.isFinite(p.temperature)) return '請填寫機房溫度。';
  if (p.humidity === '' || !Number.isFinite(p.humidity)) return '請填寫相對溼度。';
  if (p.humidity < 0 || p.humidity > 100) return '相對溼度要在 0～100% 之間。';
  for (const item of ITEMS) {
    if (!p.results?.[item.key]) return `請勾選「${item.label}」的檢查結果（正常或異常）。`;
  }
  if (isAbnormal(p)) {
    if (!p.abnormalNote) return '有異常（勾了異常，或溫度、溼度超出管制範圍），請填寫異常說明。';
    if (!p.abnormalAction) return '有異常，請填寫處理方式。';
  }
  return '';
};

/** 這個月的紀錄依周排好：[第一周, …, 第五周]，沒有的是 null */
export const byWeek = (records = []) => WEEKS.map((w) => records.find((r) => r.weekNo === w) || null);

/** 最後一次檢查距今幾天；超過 7 天（或從沒做過）就要提醒 */
export const roomCheckStatus = (lastDate, now = new Date()) => {
  if (!lastDate) return { lastDate: null, days: null, overdue: true };
  const days = daysBetween(lastDate, todayYmd(now));
  return { lastDate, days, overdue: days > CHECK_INTERVAL_DAYS };
};

/** PDF 檔名：S-408-03機房檢查表_115年11月.pdf */
export const formFileName = (period) => `${FORM_META.docNo}${FORM_META.docName}_${rocMonthLabel(period)}.pdf`;

/** 2026-11-10 → 2026-11 */
export const periodOf = (ymd) => String(ymd).slice(0, 7);
