import { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { RoleContext } from '../context/RoleContext';

/**
 * 自訂查詢標籤：常用關鍵字，點一下就帶進搜尋框。
 *
 * 存在伺服器的個人設定（user_preferences），以登入身分為範圍：換一台電腦登入
 * 一樣看得到，同一台電腦換人登入也不會看到別人的標籤。
 * 以前這些標籤只存在瀏覽器的 localStorage，換電腦就沒了；帳號裡還沒有設定過時，
 * 會把這台瀏覽器裡舊的標籤搬進帳號（只搬一次，之後以帳號裡的為準）。
 */
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 20;

/** 只留字串、去頭尾空白、不分大小寫去重、最長 20 字、最多 10 個 */
export const normalizeTags = (list) => {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag || out.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
};

/** 舊版存在瀏覽器裡的標籤；當時以 erp_session 的 username（沒有就用 id）區分 */
const readLegacyTags = (legacyPrefix) => {
  if (!legacyPrefix) return [];
  try {
    const session = JSON.parse(localStorage.getItem('erp_session') || '{}');
    const owner = session.username || session.id;
    if (!owner) return [];
    return normalizeTags(JSON.parse(localStorage.getItem(`${legacyPrefix}${owner}`) || '[]'));
  } catch {
    return [];
  }
};

/**
 * @param {string} prefKey       個人設定的鍵值，例如 consumableSearchTags
 * @param {string} [legacyPrefix] 舊版 localStorage 的鍵值前綴，例如 consumable_custom_tags_
 */
export function useSearchTags(prefKey, legacyPrefix) {
  const { authUser } = useContext(RoleContext) || {};
  const [tags, setTags] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // 使用者在伺服器回應前就先改了標籤時，不要被回來的舊值蓋掉
  const userChanged = useRef(false);

  useEffect(() => {
    let cancelled = false;
    userChanged.current = false;
    setTags([]);
    setLoaded(false);
    (async () => {
      try {
        const res = await window.electronAPI?.getUserPreference?.(prefKey);
        if (cancelled || userChanged.current) return;
        if (res?.success && Array.isArray(res.value)) {
          setTags(normalizeTags(res.value));
        } else if (res?.success && res.value == null) {
          // 帳號裡還沒有設定過：把這台瀏覽器裡舊的標籤搬進帳號
          const legacy = readLegacyTags(legacyPrefix);
          if (legacy.length > 0) {
            setTags(legacy);
            await window.electronAPI?.setUserPreference?.(prefKey, legacy);
          }
        }
      } catch {
        // 讀不到就先不顯示標籤，不影響搜尋
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [prefKey, legacyPrefix, authUser?.id]);

  /** 存進帳號；回傳 { success, error } 讓畫面決定要顯示「已儲存」還是錯誤 */
  const saveTags = useCallback(async (next) => {
    userChanged.current = true;
    const clean = normalizeTags(next);
    const prev = tags;
    setTags(clean);
    const res = await window.electronAPI?.setUserPreference?.(prefKey, clean);
    if (!res?.success) {
      setTags(prev);
      return { success: false, error: res?.error || '儲存失敗' };
    }
    return { success: true };
  }, [prefKey, tags]);

  return { tags, saveTags, loaded };
}

export default useSearchTags;
