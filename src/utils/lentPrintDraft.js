/**
 * 借貨申請單預覽：修改過的內容存回借用單（outbound_requests.print_draft）
 *
 * 預覽可以即時編輯經銷商、客戶資訊、明細、注意事項等，先前改完沒有地方存，
 * 關掉再打開就恢復原樣。現在每張借用單存一份，打開時套用在預設內容之上。
 *
 * 只存下面這些欄位；其餘（例如沒換過的 LOGO）每次照範本重新帶入。
 */

export const DRAFT_VERSION = 1;

export const DRAFT_FIELDS = [
  'selectedPreset', 'headerLayout', 'headerRightText', 'customLogo',
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
  selectedPreset: '公司範本', headerLayout: '頁首版型', headerRightText: '頁首公司資訊', customLogo: 'LOGO',
  selectedDealerId: '經銷商', dealerName: '經銷商名稱', dealerSales: '經銷商業務', dealerPhone: '經銷商電話', dealerAddress: '經銷商地址',
  applyCompany: '申請公司', applyDate: '申請日期', custCompany: '客戶公司', custPerson: '客戶聯絡人', custPhone: '客戶電話', custAddress: '客戶地址',
  tableRows: '借貨明細', termsList: '注意事項', footerWarnings: '頁尾警語',
};
