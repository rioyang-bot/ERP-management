import { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { RoleContext } from '../context/RoleContext';

/**
 * 列表上方統計卡片的排列位置。
 *
 * 排列以登入身分為範圍存放在伺服器端，因此同一位使用者換一台電腦登入仍會沿用，
 * 同一台電腦不同人登入也不會互相覆蓋（原本放在 localStorage 兩者都做不到）。
 *
 * localStorage 只當作本機快取：畫面一開就先用上次的排列，避免等伺服器回應時
 * 卡片先跳一次預設位置；伺服器回來的值才是準的，會覆蓋快取。
 *
 * legacyKey 是這個功能改為個人設定之前用的 localStorage 鍵值。
 * 帳號在伺服器上還沒有存過排列時，會把本機既有的排列帶上去，
 * 使用者原本排好的位置不會因為這次改動而消失。
 *
 * @param {string} prefKey        伺服器端的設定鍵值，例如 cardLayout:deviceList
 * @param {object|Array} defaultValue 尚未設定過時的預設值（物件或陣列）
 * @param {string} [legacyKey]    舊版本機排列的 localStorage 鍵值
 * @returns {[any, (v: any) => void, boolean]} [排列, 更新排列, 伺服器是否已回應]
 */
export function useCardLayout(prefKey, defaultValue, legacyKey) {
  const { authUser } = useContext(RoleContext) || {};
  const username = authUser?.username ? authUser.username.toLowerCase() : 'global';
  const cacheKey = `card_layout_${username}_${prefKey}`;
  const isArrayShape = Array.isArray(defaultValue);

  // 形狀不符（例如舊資料或別的設定寫進同一個鍵）就當作沒設定過，
  // 否則畫面會拿陣列當物件用而整區空白
  const matchesShape = (v) => v !== null && typeof v === 'object' && Array.isArray(v) === isArrayShape;

  const readJson = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return matchesShape(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const writeCache = (v) => {
    try { localStorage.setItem(cacheKey, JSON.stringify(v)); } catch { /* 快取寫不進去不影響功能 */ }
  };

  const [value, setValueState] = useState(
    () => readJson(cacheKey) ?? (legacyKey ? readJson(legacyKey) : null) ?? defaultValue
  );
  const [loaded, setLoaded] = useState(false);
  // 使用者在伺服器回應前就先拖曳時，不要被回來的舊值蓋掉
  const userChanged = useRef(false);

  useEffect(() => {
    let cancelled = false;
    userChanged.current = false;
    setLoaded(false);

    // 先套用本機快取，讓切換帳號時不會沿用上一位使用者的排列
    const cached = readJson(cacheKey);
    const legacy = legacyKey ? readJson(legacyKey) : null;
    setValueState(cached ?? legacy ?? defaultValue);

    (async () => {
      try {
        const res = await window.electronAPI?.getUserPreference?.(prefKey);
        if (cancelled || userChanged.current) return;
        if (res?.success && matchesShape(res.value)) {
          setValueState(res.value);
          writeCache(res.value);
        } else if (res?.success && legacy) {
          // 這個帳號還沒存過：把本機既有的排列帶上去
          writeCache(legacy);
          window.electronAPI?.setUserPreference?.(prefKey, legacy);
        }
      } catch {
        // 讀不到就沿用本機快取或預設值
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefKey, cacheKey]);

  const setValue = useCallback((next) => {
    if (!matchesShape(next)) return;
    userChanged.current = true;
    setValueState(next);
    writeCache(next);
    window.electronAPI?.setUserPreference?.(prefKey, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefKey, cacheKey]);

  return [value, setValue, loaded];
}

/**
 * 卡片聚合維度切換時，卡片本身也整批換掉（依規格／型號／類型／廠牌各有各的卡片），
 * 因此排列必須依維度分開存放。共用一份的話，切到別的維度再切回來，
 * 原本排好的位置就會被當成「已不存在的卡片」清掉。
 *
 * @param {string} prefKey  伺服器端的設定鍵值
 * @param {string} mode     目前的聚合維度（SPEC / MODEL / TYPE / BRAND）
 * @param {string} [legacyKey] 舊版本機排列的 localStorage 鍵值
 * @returns {[object, (m: object) => void, boolean]} [該維度的排列, 更新該維度的排列, 是否已載入]
 */
export function useCardLayoutByMode(prefKey, mode, legacyKey) {
  const [byMode, setByMode, loaded] = useCardLayout(prefKey, {}, legacyKey);

  // 舊版只存一份排列（當時只有依規格一種維度），轉成依維度存放
  const isFlat = Object.values(byMode).some((v) => typeof v === 'string');
  const normalized = isFlat ? { SPEC: byMode } : byMode;

  const layout = normalized[mode] || {};
  const setLayout = useCallback(
    (next) => setByMode({ ...(isFlat ? { SPEC: byMode } : byMode), [mode]: next }),
    [setByMode, byMode, isFlat, mode]
  );

  return [layout, setLayout, loaded];
}

/**
 * 卡片「順序」的依維度版本。
 *
 * useCardLayoutByMode 存的是位置對照表（物件），這支存的是排列順序（陣列）——
 * 耗材列表用的是後者。兩者都依聚合維度各存一份，切換規則時順序不會互相蓋掉。
 *
 * 耗材原本固定依類型、只存一份陣列，因此讀到陣列時視為「依類型」那一份，
 * 既有的排列不會因為這次改版而消失。
 *
 * @param {string} prefKey
 * @param {string} mode      目前的聚合維度
 * @param {string} [legacyKey] 舊的 localStorage 鍵值
 * @returns {[string[], (next: string[]) => void, boolean]}
 */
export function useCardOrderByMode(prefKey, mode, legacyKey) {
  const [stored, setStored, loaded] = useCardLayout(prefKey, {}, legacyKey);

  const isFlat = Array.isArray(stored);
  const byMode = isFlat ? { TYPE: stored } : (stored || {});
  const order = Array.isArray(byMode[mode]) ? byMode[mode] : [];

  const setOrder = useCallback(
    (next) => setStored({ ...(Array.isArray(stored) ? { TYPE: stored } : (stored || {})), [mode]: next }),
    [setStored, stored, mode]
  );

  return [order, setOrder, loaded];
}

export default useCardLayout;
