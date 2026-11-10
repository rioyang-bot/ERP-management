/**
 * 設備的「搭載硬體 SN」已設定清單：依硬體類型分組
 *
 * 原本所有序號擠成一排小標籤，一台伺服器掛了好幾張網卡、記憶體、硬碟時
 * 看不出各類型有幾個。改成一個類型一行，類型寫在最前面。
 *
 * 排序：有類型的依類型名稱排列；已建檔但沒有類型的放在「未分類」；
 * 找不到建檔資料的序號放在最後「未建檔硬體」，提醒要先建檔。
 * 同一類型裡維持輸入的順序。
 */

export const UNTYPED = '未分類';
export const UNREGISTERED = '未建檔硬體';

/**
 * @param {string[]} sns 已設定的序號（已去重）
 * @param {(sn: string) => object|string|null|undefined} findHw 依序號找到的硬體資料；
 *        找到的是字串（只知道序號）也算已建檔、但沒有類型
 * @returns {{ type: string, items: { sn: string, hw: object|null }[] }[]}
 */
export function groupMountedHwByType(sns = [], findHw = () => null) {
  const groups = new Map();
  for (const sn of sns) {
    const found = findHw(sn);
    const hw = found && typeof found === 'object' ? found : null;
    const type = !found ? UNREGISTERED : (String(hw?.type || '').trim() || UNTYPED);
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push({ sn, hw, registered: !!found });
  }
  const rank = (t) => (t === UNREGISTERED ? 2 : t === UNTYPED ? 1 : 0);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'zh-Hant'))
    .map(([type, items]) => ({ type, items }));
}

/**
 * 設備列表的「搭載硬體/耗材」：掛載耗材也跟搭載硬體一樣依類型分組，一個類型一行。
 * 同類型的數量加總寫在類型後面，底下一種耗材一行（廠牌 型號 ×數量）。
 * 排序與搭載硬體相同：依類型名稱，沒有類型的放「未分類」。
 *
 * @param {{ type?: string, brand?: string, model?: string, quantity?: number }[]} consumables
 * @returns {{ type: string, total: number, items: object[] }[]}
 */
export function groupMountedConsumablesByType(consumables = []) {
  const groups = new Map();
  for (const mc of consumables || []) {
    const type = String(mc?.type || '').trim() || UNTYPED;
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(mc);
  }
  const rank = (t) => (t === UNTYPED ? 1 : 0);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'zh-Hant'))
    .map(([type, items]) => ({ type, total: items.reduce((sum, mc) => sum + (Number(mc.quantity) || 0), 0), items }));
}
