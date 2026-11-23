/**
 * 出機檢查表：列印與匯出 Word 要包含哪些區塊
 *
 * 不一定每次都要全部印出來，使用者可以勾選；勾選結果存在個人偏好設定
 * （checklistExportSections，存的是「沒勾」的區塊，沒設定過就是全部都印）。
 *
 * MAC 表只對需要 MAC 表的設備出現。檢查表本身的區塊全部沒勾、只勾 MAC 表時，只輸出 MAC 表那一頁。
 */
export const EXPORT_SECTIONS = [
  { id: 'info', label: '設備資訊' },
  { id: 'hardware', label: '搭載硬體' },
  { id: 'photos', label: '主機照片' },
  { id: 'checks', label: '檢查項目' },
  { id: 'details', label: '細項紀錄' },
  { id: 'mac', label: 'MAC 表' },
];

export const EXPORT_SECTIONS_PREF_KEY = 'checklistExportSections';

/** 全部都印（預設） */
export const ALL_SECTIONS = Object.freeze(Object.fromEntries(EXPORT_SECTIONS.map((s) => [s.id, true])));

/** 檢查表本身（不含 MAC 表）的區塊 */
export const SHEET_SECTION_IDS = ['info', 'hardware', 'photos', 'checks', 'details'];

/** 勾選狀態 → { info: true, hardware: false, ... } */
export const sectionsFrom = (isSelected) => Object.fromEntries(EXPORT_SECTIONS.map((s) => [s.id, Boolean(isSelected(s.id))]));

/** 檢查表本身有沒有任何區塊要印 */
export const hasSheetSection = (sections = ALL_SECTIONS) => SHEET_SECTION_IDS.some((id) => sections[id]);
