import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 各列表的「自訂顯示欄位」設定。
 *
 * 設定存放在伺服器端，且以登入身分為範圍，因此同一位使用者換裝置登入仍會沿用；
 * 同一台電腦由不同人登入也不會互相覆蓋（放在 localStorage 兩者都做不到）。
 *
 * 尚未設定過、或載入失敗時，一律回到「全部顯示」，確保不會因為設定問題而看不到資料。
 *
 * @param {string} prefKey  設定鍵值，例如 deviceListColumns
 * @param {Array<{id: string, label: string, always?: boolean}>} columns
 *        always 為 true 的欄位不可隱藏（例如操作按鈕），也不會出現在勾選清單中
 */
export function useColumnPreferences(prefKey, columns) {
  const [hidden, setHidden] = useState(() => new Set());
  const [loaded, setLoaded] = useState(false);
  // 避免初次載入時把預設值又寫回伺服器
  const skipNextSave = useRef(true);
  // 使用者在伺服器回應前就先勾選時，不要被回來的舊值蓋掉
  const userChanged = useRef(false);

  const hideable = columns.filter((c) => !c.always);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.electronAPI?.getUserPreference?.(prefKey);
        if (cancelled) return;
        if (userChanged.current) return;
        const list = res?.success && Array.isArray(res.value) ? res.value : [];
        // 只採用目前確實存在、且允許隱藏的欄位，避免舊設定殘留造成欄位憑空消失
        const valid = list.filter((id) => hideable.some((c) => c.id === id));
        setHidden(new Set(valid));
      } catch {
        // 讀取失敗就維持全部顯示
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefKey]);

  // 設定變動後寫回伺服器（初次載入不寫）
  useEffect(() => {
    if (!loaded) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    window.electronAPI?.setUserPreference?.(prefKey, [...hidden]);
  }, [hidden, loaded, prefKey]);

  const isVisible = useCallback((id) => !hidden.has(id), [hidden]);

  const toggle = useCallback((id) => {
    userChanged.current = true;
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const showAll = useCallback(() => { userChanged.current = true; setHidden(new Set()); }, []);

  return { isVisible, toggle, showAll, hiddenCount: hidden.size, loaded };
}

export default useColumnPreferences;
