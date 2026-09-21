import { describe, it, expect } from 'vitest';
import { getMatchingSpecs } from '../utils/matchingSpecs';

/**
 * 「套用既有規格」只列出相關的
 *
 * 原本是把所有既有卡片的規格去重後全部列出來，不管使用者選了什麼。
 * 實際資料上是 12 種規格全列，而選定類型／廠牌／型號之後其實只剩 1~2 種 ——
 * 要找的那一個反而淹沒在不相干的選項裡。
 */
const CARDS = [
  { type: 'SERVER', brand: 'DELL', model: 'R760', specification: '56C 512G' },
  { type: 'SERVER', brand: 'DELL', model: 'R760', specification: '64C 1T' },
  { type: 'SERVER', brand: 'DELL', model: 'R660', specification: '32C 256G' },
  { type: 'SERVER', brand: 'HPE', model: 'DL380', specification: '48C 384G' },
  { type: 'SWITCH', brand: 'ARISTA', model: '7050SX3', specification: '48 Port' },
  { type: 'SERVER', brand: 'DELL', model: 'R760', specification: '' },   // 空規格不列
  { type: 'SERVER', brand: 'DELL', model: 'R760', specification: '56C 512G' }, // 重複只算一次
];

describe('依選取條件取出既有規格', () => {
  it('三個都選時只剩該組合用過的', () => {
    expect(getMatchingSpecs(CARDS, { type: 'SERVER', brand: 'DELL', model: 'R760' }))
      .toEqual(['56C 512G', '64C 1T']);
  });

  it('只選廠牌時列出該廠牌的全部', () => {
    expect(getMatchingSpecs(CARDS, { brand: 'DELL' }))
      .toEqual(['32C 256G', '56C 512G', '64C 1T']);
  });

  it('只選類型時列出該類型的全部', () => {
    expect(getMatchingSpecs(CARDS, { type: 'SWITCH' })).toEqual(['48 Port']);
  });

  it('選得越細，候選越少', () => {
    const byType = getMatchingSpecs(CARDS, { type: 'SERVER' });
    const byBrand = getMatchingSpecs(CARDS, { type: 'SERVER', brand: 'DELL' });
    const byModel = getMatchingSpecs(CARDS, { type: 'SERVER', brand: 'DELL', model: 'R760' });

    expect(byModel.length).toBeLessThanOrEqual(byBrand.length);
    expect(byBrand.length).toBeLessThanOrEqual(byType.length);
  });

  it('三個都沒選時不給建議 —— 全部列出等於沒有過濾', () => {
    expect(getMatchingSpecs(CARDS, {})).toEqual([]);
    expect(getMatchingSpecs(CARDS, { type: '', brand: '', model: '' })).toEqual([]);
    expect(getMatchingSpecs(CARDS)).toEqual([]);
  });

  it('沒有相符的組合回空陣列，讓使用者自己填新規格', () => {
    expect(getMatchingSpecs(CARDS, { brand: 'LENOVO' })).toEqual([]);
    expect(getMatchingSpecs(CARDS, { type: 'SERVER', brand: 'DELL', model: '不存在' })).toEqual([]);
  });

  it('空白規格不列入，重複的只出現一次', () => {
    const specs = getMatchingSpecs(CARDS, { type: 'SERVER', brand: 'DELL', model: 'R760' });
    expect(specs).not.toContain('');
    expect(specs.filter((s) => s === '56C 512G')).toHaveLength(1);
  });

  it('比對忽略大小寫與前後空白', () => {
    expect(getMatchingSpecs(CARDS, { brand: '  dell  ' }))
      .toEqual(getMatchingSpecs(CARDS, { brand: 'DELL' }));
  });

  it('依字母排序，方便在下拉裡找', () => {
    const specs = getMatchingSpecs(CARDS, { type: 'SERVER' });
    expect(specs).toEqual([...specs].sort((a, b) => a.localeCompare(b)));
  });

  it('沒有卡片或資料型別不對時不會爆掉', () => {
    expect(getMatchingSpecs(undefined, { brand: 'DELL' })).toEqual([]);
    expect(getMatchingSpecs(null, { brand: 'DELL' })).toEqual([]);
    expect(getMatchingSpecs([], { brand: 'DELL' })).toEqual([]);
  });
});
