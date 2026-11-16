/**
 * 列印單據「上次選的公司範本」
 *
 * 存在伺服器的個人偏好設定（user_preferences），以登入帳號為範圍：
 * 換電腦登入仍沿用，同一台電腦不同人登入也不會互相覆蓋。
 * 讀不到或存不進去都不影響列印，呼叫端退回預設範本即可。
 */

export const PRESET_PREF_KEYS = {
  deliveryReceipt: 'deliveryReceipt:companyPreset',
  lentOrder: 'lentOrder:companyPreset',
};

/** 讀取上次選的範本 id；沒有或讀取失敗時回傳 null */
export const readPresetPreference = async (prefKey) => {
  try {
    const res = await window.electronAPI?.getUserPreference?.(prefKey);
    return res?.success && typeof res.value === 'string' && res.value ? res.value : null;
  } catch {
    return null;
  }
};

/** 記下這次選的範本 id（背景寫入，不等待結果） */
export const savePresetPreference = (prefKey, presetId) => {
  if (!presetId) return;
  try {
    Promise.resolve(window.electronAPI?.setUserPreference?.(prefKey, presetId))
      .catch(() => { /* 存不進去不影響列印 */ });
  } catch { /* 存不進去不影響列印 */ }
};
