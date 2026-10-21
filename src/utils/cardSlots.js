/**
 * 卡片格位排列（每列 6 格，可以拖到任何一格，包括空格）
 *
 * 排列存成「格位 → 卡片鍵值」的對照表，例如 { 0: 'GBIC', 1: 'DAC CABLE', 7: 'FIBER' }。
 * 設備、硬體列表一直是這種排法；耗材原本只能互換順序（不能放到空格），改成同一套。
 */

export const SLOT_COLUMNS = 6;

/**
 * 整理排列：拿掉已經不存在的卡片，新出現的卡片補到第一個空位。
 * 新卡片優先照 seedOrder 的順序擺（耗材舊版存的是順序陣列，第一次換成格位時沿用）。
 *
 * @param {Record<string, string>} layout 目前的排列
 * @param {string[]} activeKeys 這次要顯示的卡片
 * @param {string[]} [seedOrder] 舊的排列順序
 * @returns {{ layout: Record<string, string>, changed: boolean }}
 */
export function normalizeSlotLayout(layout = {}, activeKeys = [], seedOrder = []) {
  const active = new Set(activeKeys);
  const next = {};
  for (const [idx, key] of Object.entries(layout || {})) {
    if (active.has(key)) next[idx] = key;
  }
  const placed = new Set(Object.values(next));
  const missing = [
    ...(seedOrder || []).filter((k) => active.has(k) && !placed.has(k)),
    ...activeKeys.filter((k) => !placed.has(k) && !(seedOrder || []).includes(k)),
  ];
  let idx = 0;
  for (const key of missing) {
    while (next[idx] !== undefined) idx += 1;
    next[idx] = key;
    idx += 1;
  }
  const changed = missing.length > 0 || Object.keys(next).length !== Object.keys(layout || {}).length;
  return { layout: next, changed };
}

/**
 * 把卡片拖到某一格：那格有卡片就跟它互換位置，是空格就直接放過去。
 */
export function moveCardToSlot(layout = {}, key, targetIdx) {
  const next = { ...layout };
  const from = Object.keys(next).find((k) => next[k] === key);
  if (from !== undefined && String(from) === String(targetIdx)) return next;
  if (from !== undefined) delete next[from];
  const occupant = next[targetIdx];
  if (occupant !== undefined && from !== undefined) next[from] = occupant;
  next[targetIdx] = key;
  return next;
}

/** 要畫幾格：排到的最後一格所在的列為止；拖曳中多一列空位可以往下放 */
export function slotCount(layout = {}, dragging = false, cols = SLOT_COLUMNS) {
  const maxIdx = Object.keys(layout || {}).reduce((m, k) => Math.max(m, Number(k)), -1);
  const rows = Math.max(1, Math.ceil((maxIdx + 1) / cols) + (dragging ? 1 : 0));
  return rows * cols;
}
