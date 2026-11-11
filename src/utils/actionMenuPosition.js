/**
 * 列表「…」功能選單的位置：依按鈕上下實際剩下的空間決定往上或往下開，
 * 並把選單高度限制在那一側放得下的範圍，放不下就在選單裡捲動。
 *
 * 原本假設選單固定高 360（耗材 220），往下放不下且上面夠 360 才往上開，
 * 高度上限是 80vh。設備的選單其實有十幾項、比 360 高，筆電解析度小或縮放 150% 時：
 *   - 往下開：底下剩的空間不夠，後面的項目被畫面下緣切掉
 *   - 往上開：上面剩的空間不夠，前面的項目被畫面上緣切掉
 */
export const MENU_GAP = 4; // 選單與按鈕的間距
export const MENU_MARGIN = 8; // 選單與畫面邊緣至少留的距離
export const MENU_MIN_HEIGHT = 120;

/**
 * @param {DOMRect} rect 按鈕的位置
 * @param {object} opts preferredHeight：選單完整展開大約多高
 * @returns {{ isUpward: boolean, top: number, right: number, maxHeight: number }}
 *   top：往下開時是選單上緣、往上開時是選單下緣（與原本的 menuPosition 相同）
 */
export function actionMenuPosition(rect, {
  preferredHeight = 360,
  viewportHeight = window.innerHeight,
  viewportWidth = window.innerWidth,
} = {}) {
  const below = viewportHeight - rect.bottom - MENU_GAP - MENU_MARGIN;
  const above = rect.top - MENU_GAP - MENU_MARGIN;
  // 底下放得下就往下；放不下時哪邊空間大就往哪邊
  const isUpward = below < preferredHeight && above > below;
  return {
    isUpward,
    top: isUpward ? rect.top - MENU_GAP : rect.bottom + MENU_GAP,
    right: viewportWidth - rect.right,
    maxHeight: Math.max(MENU_MIN_HEIGHT, Math.floor(isUpward ? above : below)),
  };
}

/** 捲動的是選單本身（選單太長、在裡面捲）時不要把選單關掉 */
export const isScrollInsideMenu = (e) => !!e?.target?.closest?.('.dropdown-action-menu');
