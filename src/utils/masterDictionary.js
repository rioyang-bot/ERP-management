/**
 * 廠牌／類型／型號這三份下拉選單的字典
 *
 * 三個建檔頁面（設備、硬體、耗材）各自寫了一份幾乎一樣的「按 ＋ 新增」，
 * 九支合起來有兩個共同的毛病：
 *   1. 按下去就直接寫進資料庫，打錯字也回不來 —— 這些名字之後會出現在
 *      每一台設備的識別欄位上，錯一次就得全系統找回來改。
 *   2. 完全沒有事件紀錄，選單裡多出一個奇怪的廠牌，查不到是誰什麼時候加的。
 *
 * 集中在這裡，三頁共用同一套確認語句與紀錄格式。
 */
import { logCreate, logDelete } from './auditLogger';

const KIND_LABEL = { BRAND: '廠牌', TYPE: '類型', MODEL: '型號' };

const QUERY_BY_KIND = {
  BRAND: 'insertDeviceBrand',
  TYPE: 'insertDeviceType',
  MODEL: 'insertDeviceModel',
};

/** 類別對應到事件紀錄的模組 */
export const MODULE_BY_CATEGORY = {
  設備: 'DEVICE',
  硬體: 'HARDWARE',
  耗材: 'CONSUMABLE',
};

/**
 * 新增一筆字典項目：先問過使用者，寫成功後留下紀錄。
 *
 * @param {object} api       window.electronAPI
 * @param {object} opts
 * @param {'BRAND'|'TYPE'|'MODEL'} opts.kind
 * @param {string} opts.category 設備／硬體／耗材
 * @param {string} opts.name     要新增的名稱（呼叫端先做過驗證與正規化）
 * @param {string} [opts.brand]  型號才需要：它掛在哪個廠牌底下
 * @param {function} [opts.confirm] 預設用 window.confirm，測試可換掉
 * @returns {Promise<{ ok: boolean, cancelled?: boolean, message?: string }>}
 */
export async function addDictionaryEntry(api, { kind, category, name, brand, confirm } = {}) {
  const label = KIND_LABEL[kind];
  const queryName = QUERY_BY_KIND[kind];
  if (!label || !queryName) return { ok: false, message: '不支援的項目類型' };
  if (!name) return { ok: false, message: `請輸入${label}名稱` };
  if (kind === 'MODEL' && !brand) return { ok: false, message: '請先選擇廠牌' };

  const ask = confirm || ((msg) => globalThis.confirm?.(msg));
  const where = kind === 'MODEL' ? `${category}／${brand}` : category;
  if (!ask(`確定要新增${label}「${name}」嗎？\n\n新增後會出現在${where}的下拉選單中，`
    + `之後所有用到它的品項都會以這個名字識別。`)) {
    return { ok: false, cancelled: true };
  }

  const params = kind === 'MODEL' ? [brand, name, category] : [category, name];
  const res = await api.namedQuery(queryName, params);
  if (!res?.success) return { ok: false, message: res?.error || '新增失敗' };

  await logCreate(
    MODULE_BY_CATEGORY[category] || 'SETTING',
    name,
    name,
    `新增${category}${label}「${name}」${kind === 'MODEL' ? `（廠牌：${brand}）` : ''}`,
    { kind, category, name, brand: brand || null }
  );
  return { ok: true };
}

/**
 * 字典項目被移除時的紀錄。
 * 移除本身的條件檢查在 deleteItemType.js 裡，這裡只負責留下痕跡。
 */
export async function logDictionaryDelete({ kind, category, name }) {
  const label = KIND_LABEL[kind] || '項目';
  return logDelete(
    MODULE_BY_CATEGORY[category] || 'SETTING',
    name,
    name,
    `移除${category}${label}「${name}」`,
    { kind, category, name }
  );
}

export default { addDictionaryEntry, logDictionaryDelete, MODULE_BY_CATEGORY };
