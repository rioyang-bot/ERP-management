import { describe, it, expect } from 'vitest';
import { getActiveSnTerm, filterMountableHw } from '../utils/mountedHwFilter';

const HW = [
  { id: 1, sn: 'STG10005Y26', brand: 'V-COLOR', model: 'DDR5-5800', type: 'RAM' },
  { id: 2, sn: 'STG10015Y26', brand: 'V-COLOR', model: 'PC5-46400 UDIMM', type: 'RAM' },
  { id: 3, sn: 'U5M16V5601255', brand: 'INTEL', model: 'ULTRA9 285K', type: 'CPU' },
  { id: 4, sn: 'NIC-0001', brand: 'MELLANOX', model: 'CX556A', type: 'NIC' },
];

describe('取出正在輸入的序號片段', () => {
  it('只有一筆時就是整串', () => {
    expect(getActiveSnTerm('STG100')).toBe('STG100');
  });

  it('前面已經選過幾筆時，只取最後正在打的那一段', () => {
    expect(getActiveSnTerm('U5M16V5601255, STG100')).toBe('STG100');
  });

  it('以逗號結尾代表上一筆打完了，不篩選', () => {
    // 這正是畫面上「已設定一筆、準備挑下一筆」的狀態，此時應顯示全部
    expect(getActiveSnTerm('U5M16V5601255,')).toBe('');
    expect(getActiveSnTerm('U5M16V5601255, ')).toBe('');
  });

  it('全形逗號與空白也算分隔', () => {
    expect(getActiveSnTerm('A，B')).toBe('B');
    expect(getActiveSnTerm('A B')).toBe('B');
    expect(getActiveSnTerm('A，')).toBe('');
  });

  it('空內容回傳空字串', () => {
    expect(getActiveSnTerm('')).toBe('');
    expect(getActiveSnTerm(null)).toBe('');
    expect(getActiveSnTerm(undefined)).toBe('');
  });
});

describe('依關鍵字篩選可掛載硬體', () => {
  it('沒有關鍵字時回傳全部', () => {
    expect(filterMountableHw(HW, '')).toHaveLength(4);
    expect(filterMountableHw(HW, '   ')).toHaveLength(4);
  });

  it('比對序號的一部分，常常只記得後幾碼', () => {
    expect(filterMountableHw(HW, '10015').map((h) => h.sn)).toEqual(['STG10015Y26']);
  });

  it('不分大小寫', () => {
    expect(filterMountableHw(HW, 'stg100')).toHaveLength(2);
  });

  it('也可以用廠牌縮小範圍', () => {
    expect(filterMountableHw(HW, 'v-color')).toHaveLength(2);
  });

  it('也比對型號與類型', () => {
    expect(filterMountableHw(HW, 'udimm').map((h) => h.sn)).toEqual(['STG10015Y26']);
    expect(filterMountableHw(HW, 'cpu').map((h) => h.sn)).toEqual(['U5M16V5601255']);
  });

  it('沒有符合的就回傳空陣列', () => {
    expect(filterMountableHw(HW, 'ZZZZ')).toEqual([]);
  });

  it('缺欄位或非陣列都不會出錯', () => {
    expect(filterMountableHw(null, 'x')).toEqual([]);
    expect(filterMountableHw([{ sn: 'A' }], 'a')).toHaveLength(1);
    expect(filterMountableHw([{}], 'a')).toEqual([]);
  });
});
