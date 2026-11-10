/**
 * 卡片區一列放幾張：依卡片區實際的寬度決定，最多 6 張
 *
 * 原本固定一列 6 張。筆電 1920×1200、縮放 150% 時畫面只有 1280 寬，扣掉左側選單，
 * 6 張卡片擠不下，卡片區就要左右捲動才看得到。改成量卡片區的寬度：
 * 每張至少 CARD_MIN_WIDTH 寬，放得下幾張就排幾張（2～6 張）。
 *
 * 排列存的是格位順序（第幾格放哪張，見 utils/cardSlots.js），一列的張數變了，
 * 格位只是依序換行，卡片的先後與中間的空格都不變。
 */
import { useCallback, useRef, useState } from 'react';

export const CARD_MIN_WIDTH = 190;
export const CARD_GAP = 12;
export const MIN_CARD_COLUMNS = 2;
export const MAX_CARD_COLUMNS = 6;

/** 這個寬度（不含內距）一列放得下幾張卡片 */
export function cardColumnsFor(width, { minWidth = CARD_MIN_WIDTH, gap = CARD_GAP, min = MIN_CARD_COLUMNS, max = MAX_CARD_COLUMNS } = {}) {
  if (!width || width <= 0) return max;
  return Math.max(min, Math.min(max, Math.floor((width + gap) / (minWidth + gap))));
}

/** 卡片區的內容寬度：扣掉左右內距 */
const contentWidth = (el) => {
  const style = window.getComputedStyle(el);
  return el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
};

/**
 * 掛在卡片區（grid 容器）上，回傳 [ref, 一列幾張]。
 * 視窗縮放、側邊欄收合、分割畫面都會即時重算。
 * 量不到寬度時（例如測試環境沒有 ResizeObserver）維持 6 張。
 */
export function useCardColumns() {
  const [columns, setColumns] = useState(MAX_CARD_COLUMNS);
  const observer = useRef(null);
  const ref = useCallback((el) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setColumns(cardColumnsFor(contentWidth(el)));
    update();
    observer.current = new ResizeObserver(update);
    observer.current.observe(el);
  }, []);
  return [ref, columns];
}
