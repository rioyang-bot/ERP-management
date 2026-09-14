import { describe, it, expect } from 'vitest';
import { getActiveSnTerm, filterMountableHw, getCommittedSns, toggleMountedSn } from '../utils/mountedHwFilter';

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

describe('取出已確定的序號（不含正在輸入的關鍵字）', () => {
  it('正在輸入的那一段不算一筆序號', () => {
    expect(getCommittedSns('U5M')).toEqual([]);
    expect(getCommittedSns('SN001, U5M')).toEqual(['SN001']);
  });

  it('以分隔符號結尾時全部都算已確定', () => {
    expect(getCommittedSns('SN001, ')).toEqual(['SN001']);
    expect(getCommittedSns('SN001, SN002,')).toEqual(['SN001', 'SN002']);
  });

  it('空內容回傳空陣列', () => {
    expect(getCommittedSns('')).toEqual([]);
    expect(getCommittedSns(null)).toEqual([]);
  });
});

describe('從清單點選後欄位應該變成什麼', () => {
  it('打了關鍵字再點選，關鍵字被換掉而不是留下來', () => {
    // 這正是原本的問題：打 U5M 點選後變成「U5M, U5M16V5601255」兩筆
    expect(toggleMountedSn('U5M', 'U5M16V5601255')).toBe('U5M16V5601255');
  });

  it('前面已選的保留，只換掉正在輸入的那一段', () => {
    expect(toggleMountedSn('SN001, U5M', 'U5M16V5601255')).toBe('SN001, U5M16V5601255');
  });

  it('沒有在輸入時就是單純加入', () => {
    expect(toggleMountedSn('SN001, ', 'SN002')).toBe('SN001, SN002');
    expect(toggleMountedSn('', 'SN002')).toBe('SN002');
  });

  it('已經在清單中就移除', () => {
    expect(toggleMountedSn('SN001, SN002,', 'SN001')).toBe('SN002');
  });

  it('移除時不分大小寫', () => {
    expect(toggleMountedSn('sn001, SN002,', 'SN001')).toBe('SN002');
  });

  it('不會加入重複的序號', () => {
    expect(toggleMountedSn('SN001, SN002,', 'SN002')).toBe('SN001');
  });

  it('點選空序號時原樣返回，不會弄壞欄位', () => {
    expect(toggleMountedSn('SN001, U5M', '')).toBe('SN001, U5M');
  });
});
