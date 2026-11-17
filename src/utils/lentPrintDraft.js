/**
 * 借貨申請單預覽：修改過的內容存回借用單（outbound_requests.print_draft）
 *
 * 預覽可以即時編輯經銷商、客戶資訊、明細、注意事項等，先前改完沒有地方存，
 * 關掉再打開就恢復原樣。現在每張借用單存一份，打開時套用在預設內容之上。
 *
 * 只存下面這些欄位；其餘（例如沒換過的 LOGO）每次照範本重新帶入。
 *
 * customLogoName：換過的 LOGO 的原始檔名，事件紀錄寫「舊檔名 → 新檔名」用。
 * 這個欄位是後來才加的，舊的存檔沒有它 —— 讀回來就是沒有檔名，紀錄寫「自訂 LOGO」。
 */
import { diffFields, fileChange, normalizeValue } from '../../server/fieldChanges.js';

export const DRAFT_VERSION = 1;

export const DRAFT_FIELDS = [
  'selectedPreset', 'headerLayout', 'headerRightText', 'customLogo', 'customLogoName',
  'selectedDealerId', 'dealerName', 'dealerSales', 'dealerPhone', 'dealerAddress',
  'applyCompany', 'applyDate', 'custCompany', 'custPerson', 'custPhone', 'custAddress',
  'tableRows', 'termsList', 'footerWarnings',
];

/** 換過的 LOGO 也存；太大就不存（其餘照存），避免單據資料肥大 */
export const MAX_DRAFT_LOGO_LENGTH = 1.4 * 1024 * 1024;

const pick = (form = {}) => Object.fromEntries(DRAFT_FIELDS.filter((k) => form[k] !== undefined).map((k) => [k, form[k]]));

/** 畫面上的內容 → 要存的資料 */
export function toDraft(form) {
  const picked = pick(form);
  if (typeof picked.customLogo === 'string' && picked.customLogo.length > MAX_DRAFT_LOGO_LENGTH) picked.customLogo = null;
  // LOGO 沒存，檔名也不存：讀回來用的是範本的 LOGO
  if (!picked.customLogo && picked.customLogoName !== undefined) picked.customLogoName = null;
  return { version: DRAFT_VERSION, savedAt: new Date().toISOString(), form: picked };
}

/** 存過的資料 → 要套用的欄位；不是預期的格式就當沒存過 */
export function fromDraft(draft) {
  const d = typeof draft === 'string' ? safeParse(draft) : draft;
  if (!d || typeof d !== 'object' || !d.form || typeof d.form !== 'object') return null;
  const form = pick(d.form);
  for (const k of ['tableRows', 'termsList', 'footerWarnings']) {
    if (form[k] !== undefined && !Array.isArray(form[k])) delete form[k];
  }
  return form;
}

const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };

/** 兩份內容是否一樣（判斷有沒有未儲存的修改） */
export const sameForm = (a, b) => JSON.stringify(pick(a)) === JSON.stringify(pick(b));

/** 改了哪些欄位（寫事件紀錄用） */
export const changedFields = (before, after) => DRAFT_FIELDS.filter(
  (k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null),
);

export const FIELD_LABELS = {
  selectedPreset: '公司範本', headerLayout: '頁首版型', headerRightText: '頁首公司資訊', customLogo: 'LOGO', customLogoName: 'LOGO 檔名',
  selectedDealerId: '經銷商', dealerName: '經銷商名稱', dealerSales: '經銷商業務', dealerPhone: '經銷商電話', dealerAddress: '經銷商地址',
  applyCompany: '申請公司', applyDate: '申請日期', custCompany: '客戶公司', custPerson: '客戶聯絡人', custPhone: '客戶電話', custAddress: '客戶地址',
  tableRows: '借貨明細', termsList: '注意事項', footerWarnings: '頁尾警語',
};

/** 頁首版型的顯示文字（與預覽裡的下拉選單一致） */
export const LAYOUT_LABELS = {
  STANDARD: '標準商務 (Logo左 / 文字右)',
  LEFT_COMPACT: '左側並列 (Logo左 / 文字左)',
  CENTER_ROW: '品牌置中 (Logo左 / 文字右)',
  CENTERED: '品牌置中 (Logo中 / 文字中 - 上下)',
  REVERSE: '現代反向 (Logo右 / 文字左)',
};

/** LOGO 的顯示名稱：換過的寫檔名（舊存檔沒有檔名寫「自訂 LOGO」），沒換過寫「範本 LOGO」 */
export const logoDisplayName = (form) => (form?.customLogo ? (normalizeValue(form.customLogoName) || '自訂 LOGO') : '範本 LOGO');

/** 借貨明細一列 → 可閱讀的文字（空白列為空字串） */
export const tableRowText = (row) => {
  if (!row || typeof row !== 'object') return normalizeValue(row);
  const dates = [row.loanDate, row.returnDate].map(normalizeValue).filter(Boolean).join(' ~ ');
  return [row.model, row.sn, row.purpose, dates, row.remarks].map(normalizeValue).filter(Boolean).join(' / ');
};

/** 清單（明細、注意事項、警語）逐列比對：哪一列從什麼改成什麼 */
const listChanges = (field, label, unit, before, after, show) => {
  const a = Array.isArray(before) ? before : [];
  const b = Array.isArray(after) ? after : [];
  const changes = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const from = show(a[i]);
    const to = show(b[i]);
    if (from !== to) changes.push({ field, label: `${label}第 ${i + 1} ${unit}`, from, to });
  }
  return changes;
};

/**
 * 改了哪些欄位、變更前與變更後的值（寫事件紀錄用）
 * @param {object} before 變更前（上次存的那一份）
 * @param {object} after  變更後
 * @param {{ presetLabel?: (key: string) => string, dealerLabel?: (id: string) => string }} [labels]
 *        公司範本、經銷商的代碼轉成名稱
 * @returns {{ field: string, label: string, from: string, to: string, kind?: string }[]}
 */
export function draftChanges(before = {}, after = {}, { presetLabel = (k) => k, dealerLabel = (id) => id } = {}) {
  const b = before || {};
  const a = after || {};
  const changes = [];
  for (const key of DRAFT_FIELDS) {
    if (key === 'customLogoName') continue; // 併在 LOGO 那一筆
    if (key === 'customLogo') {
      const from = logoDisplayName(b);
      const to = logoDisplayName(a);
      const logoChanged = normalizeValue(b.customLogo) !== normalizeValue(a.customLogo);
      const change = fileChange(FIELD_LABELS.customLogo, from, to, 'customLogo')
        // 換了一張同檔名的圖：仍要記，看得出換過
        || (logoChanged ? { field: 'customLogo', label: FIELD_LABELS.customLogo, from, to: `${to}（已更換）`, kind: 'file' } : null);
      if (change) changes.push(change);
      continue;
    }
    if (key === 'tableRows') {
      changes.push(...listChanges(key, FIELD_LABELS[key], '列', b[key], a[key], tableRowText));
      continue;
    }
    if (key === 'termsList' || key === 'footerWarnings') {
      changes.push(...listChanges(key, FIELD_LABELS[key], '條', b[key], a[key], normalizeValue));
      continue;
    }
    let format;
    if (key === 'selectedPreset') format = (v) => (v ? presetLabel(v) : v);
    else if (key === 'selectedDealerId') format = (v) => (v ? dealerLabel(v) : v);
    else if (key === 'headerLayout') format = (v) => LAYOUT_LABELS[v] || v;
    changes.push(...diffFields(b, a, [{ key, label: FIELD_LABELS[key], format }]));
  }
  return changes;
}
