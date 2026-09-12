import { useState, useEffect, useRef, useContext } from 'react';
import { RoleContext } from '../context/RoleContext';

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * 各列表的「每頁顯示筆數」。
 *
 * 設定以登入身分為範圍存放在伺服器端，因此同一位使用者換一台電腦登入仍會沿用，
 * 同一台電腦不同人登入也不會互相覆蓋。
 *
 * localStorage 只當作本機快取：畫面一開就先用上次的值，避免等伺服器回應時
 * 先閃一次預設筆數；伺服器回來的值才是準的，會覆蓋快取。
 */
export function usePageSize(pageKey, defaultSize = 10) {
  const { authUser } = useContext(RoleContext) || {};
  const username = authUser?.username ? authUser.username.toLowerCase() : 'global';
  const cacheKey = `page_size_${username}_${pageKey}`;
  const prefKey = `pageSize:${pageKey}`;

  const readCache = () => {
    try {
      const num = parseInt(localStorage.getItem(cacheKey), 10);
      return PAGE_SIZE_OPTIONS.includes(num) ? num : null;
    } catch {
      return null;
    }
  };

  const [pageSize, setPageSizeState] = useState(() => readCache() ?? defaultSize);
  // 使用者在伺服器回應前就先改筆數時，不要被回來的舊值蓋掉
  const userChanged = useRef(false);

  useEffect(() => {
    let cancelled = false;
    userChanged.current = false;

    // 先套用本機快取，讓切換帳號時不會沿用上一位使用者的筆數
    const cached = readCache();
    setPageSizeState(cached ?? defaultSize);

    (async () => {
      try {
        const res = await window.electronAPI?.getUserPreference?.(prefKey);
        if (cancelled || userChanged.current) return;
        const num = Number(res?.value);
        if (res?.success && PAGE_SIZE_OPTIONS.includes(num)) {
          setPageSizeState(num);
          try { localStorage.setItem(cacheKey, String(num)); } catch { /* 快取寫不進去不影響功能 */ }
        }
      } catch {
        // 讀不到就沿用本機快取或預設值
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefKey, cacheKey]);

  const setPageSize = (newSize) => {
    const val = Number(newSize);
    if (!PAGE_SIZE_OPTIONS.includes(val)) return;
    userChanged.current = true;
    setPageSizeState(val);
    try { localStorage.setItem(cacheKey, String(val)); } catch { /* 快取寫不進去不影響功能 */ }
    window.electronAPI?.setUserPreference?.(prefKey, val);
  };

  return [pageSize, setPageSize];
}
