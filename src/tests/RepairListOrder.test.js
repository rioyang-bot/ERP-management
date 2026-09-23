import { describe, it, expect } from 'vitest';
import { queries } from '../../database/queries';

/**
 * 維修單列表的排序
 *
 * 原本只依建立日期排，結案很久的單照樣卡在最上面，還在跑的單反而被擠到
 * 第二頁去。列表是拿來盯進度的，已結案的只是備查，應該排到最後。
 *
 * 排序在 SQL 做，不在畫面做：列表直接把查詢結果切頁，
 * 在前端排只會排到「當頁的那幾筆」，換頁就露餡。
 */
describe('維修單列表排序', () => {
  const sql = queries.fetchRepairOrders;

  it('先把已結案的排到後面，再依建立時間新到舊', () => {
    const orderBy = sql.slice(sql.lastIndexOf('ORDER BY'));
    expect(orderBy).toContain("(ro.status = 'COMPLETED') ASC");
    // 結案與否是第一順位，建立時間只在同一組之內才作用
    expect(orderBy.indexOf("'COMPLETED'")).toBeLessThan(orderBy.indexOf('created_at'));
    expect(orderBy).toContain('ro.created_at DESC');
  });

  it('同一批資料仍以 id 收尾，避免同時間建立的單每次順序都不一樣', () => {
    expect(sql.slice(sql.lastIndexOf('ORDER BY'))).toContain('ro.id DESC');
  });

  /**
   * 布林值在 PostgreSQL 的排序是 false < true，所以 ASC 才是
   * 「未結案在前、已結案在後」。寫成 DESC 會剛好相反。
   */
  it('用 ASC 而不是 DESC，才是未結案在前', () => {
    const orderBy = sql.slice(sql.lastIndexOf('ORDER BY'));
    expect(orderBy).not.toContain("(ro.status = 'COMPLETED') DESC");
  });

  it('排序寫在查詢裡，畫面只負責切頁', () => {
    expect(sql).toContain('ORDER BY');
  });
});
