import { describe, it, expect } from 'vitest';
import { parseSnLines, validateSnBatch } from '../utils/snBatch';

describe('批次序號清單：解析', () => {
  it('一行一個，前後空白會被去掉', () => {
    expect(parseSnLines('  SN-A \n SN-B  ')).toEqual(['SN-A', 'SN-B']);
  });

  it('空行與只有空白的行會被忽略，不算成一筆', () => {
    expect(parseSnLines('SN-A\n\n   \nSN-B\n')).toEqual(['SN-A', 'SN-B']);
  });

  it('Windows 的換行也要能正確切開', () => {
    expect(parseSnLines('SN-A\r\nSN-B')).toEqual(['SN-A', 'SN-B']);
  });

  it('空內容回傳空陣列', () => {
    expect(parseSnLines('')).toEqual([]);
    expect(parseSnLines(null)).toEqual([]);
    expect(parseSnLines(undefined)).toEqual([]);
  });
});

describe('批次序號清單：檢查', () => {
  it('行數與數量相符即通過', () => {
    const r = validateSnBatch('SN-A\nSN-B\nSN-C', 3);
    expect(r.ok).toBe(true);
    expect(r.sns).toEqual(['SN-A', 'SN-B', 'SN-C']);
  });

  it('行數少於數量不通過，訊息要說出實際與需要的筆數', () => {
    const r = validateSnBatch('SN-A\nSN-B', 3);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('2 行');
    expect(r.message).toContain('3 筆');
  });

  it('行數多於數量同樣不通過', () => {
    const r = validateSnBatch('SN-A\nSN-B\nSN-C', 2);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('序號行數與數量不符');
  });

  it('完全沒貼東西不通過', () => {
    expect(validateSnBatch('', 3).ok).toBe(false);
    expect(validateSnBatch('   \n  ', 3).ok).toBe(false);
  });

  it('清單內重複不通過，且大小寫不同仍視為重複', () => {
    const r = validateSnBatch('SN-A\nSN-B\nsn-a', 3);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('重複');
    expect(r.message).toContain('sn-a');
  });

  it('與本單其他明細重複時不通過', () => {
    const r = validateSnBatch('SN-A\nSN-B', 2, ['SN-B', 'SN-Z']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('本單其他明細');
    expect(r.message).toContain('SN-B');
  });

  it('與其他明細比對時同樣忽略大小寫與前後空白', () => {
    expect(validateSnBatch('sn-b', 1, ['  SN-B  ']).ok).toBe(false);
  });

  it('其他明細的空序號不會被誤判為衝突', () => {
    expect(validateSnBatch('SN-A', 1, ['', '   ', null]).ok).toBe(true);
  });

  it('數量為 1 時也適用同一套規則', () => {
    expect(validateSnBatch('SN-A', 1).ok).toBe(true);
    expect(validateSnBatch('SN-A\nSN-B', 1).ok).toBe(false);
  });
});
