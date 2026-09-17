import { describe, it, expect } from 'vitest';
import { moveItem, buildOrderParam } from '../utils/reorderList';
import { queries } from '../../database/queries';

const list = (...ids) => ids.map((id) => ({ id }));
const ids = (arr) => arr.map((i) => i.id);

/**
 * 拖曳排序的規則
 *
 * 往下拖是最容易寫錯的方向：先把來源從陣列移除會讓後面的索引整體前移一格，
 * 若用移除後的索引去放，永遠會少一格 —— 拖到最後一項時停在倒數第二。
 */
describe('把項目移到另一筆的位置', () => {
  it('往下拖時落在目標原本的位置', () => {
    expect(ids(moveItem(list('A', 'B', 'C'), 'A', 'C'))).toEqual(['B', 'C', 'A']);
  });

  it('往上拖時同樣落在目標原本的位置', () => {
    expect(ids(moveItem(list('A', 'B', 'C'), 'C', 'A'))).toEqual(['C', 'A', 'B']);
  });

  it('拖到相鄰的下一筆只是互換', () => {
    expect(ids(moveItem(list('A', 'B', 'C'), 'A', 'B'))).toEqual(['B', 'A', 'C']);
  });

  it('拖到相鄰的上一筆也只是互換', () => {
    expect(ids(moveItem(list('A', 'B', 'C'), 'B', 'A'))).toEqual(['B', 'A', 'C']);
  });

  it('拖到最後一筆真的會排到最後', () => {
    expect(ids(moveItem(list('A', 'B', 'C', 'D'), 'A', 'D'))).toEqual(['B', 'C', 'D', 'A']);
  });

  it('拖到自己身上不動', () => {
    expect(ids(moveItem(list('A', 'B'), 'A', 'A'))).toEqual(['A', 'B']);
  });

  it('來源或目標不存在時原樣返回，不會把項目吃掉', () => {
    expect(ids(moveItem(list('A', 'B'), 'X', 'A'))).toEqual(['A', 'B']);
    expect(ids(moveItem(list('A', 'B'), 'A', 'X'))).toEqual(['A', 'B']);
  });

  it('不會改動傳進來的陣列', () => {
    const original = list('A', 'B', 'C');
    moveItem(original, 'A', 'C');
    expect(ids(original)).toEqual(['A', 'B', 'C']);
  });

  it('空陣列或非陣列都不會出錯', () => {
    expect(moveItem([], 'A', 'B')).toEqual([]);
    expect(moveItem(null, 'A', 'B')).toEqual([]);
  });
});

describe('組出排序用的參數', () => {
  it('依順序串成逗號分隔的 id', () => {
    expect(buildOrderParam(list(3, 1, 2))).toBe('3,1,2');
  });

  it('沒有 id 的項目會被略過，不會產生空白的位置', () => {
    expect(buildOrderParam([{ id: 1 }, {}, { id: null }, { id: 2 }])).toBe('1,2');
  });

  it('空清單回傳空字串', () => {
    expect(buildOrderParam([])).toBe('');
    expect(buildOrderParam(null)).toBe('');
  });

  it('查詢以逗號拆解字串，與組參數的方式一致', () => {
    // 陣列參數到不了資料庫：具名查詢的前處理會把它轉成 JSON 字串
    expect(queries.reorderChecklistItems).toContain("string_to_array($1, ',')");
    expect(queries.reorderChecklistItems).toContain('WITH ORDINALITY');
  });
});

describe('排序同步到設備', () => {
  const sql = queries.syncAssetChecklistOrderBySource;

  it('只動仍連著範本的項目', () => {
    expect(sql).toContain('a.source_item_id = i.id');
  });

  it('順序沒變的不重寫，避免無謂的異動時間', () => {
    expect(sql).toContain('IS DISTINCT FROM');
  });
});
