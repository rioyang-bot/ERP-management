import { describe, it, expect } from 'vitest';
import { formatSpec } from '../utils/format';

describe('格式化工具測試 (formatSpec)', () => {
  
  it('有值時應回傳原始值並去除空白', () => {
    expect(formatSpec('  i7-12700  ')).toBe('i7-12700');
  });

  it('空字串或 null 應回傳 --', () => {
    expect(formatSpec('')).toBe('--');
    expect(formatSpec(null)).toBe('--');
    expect(formatSpec(undefined)).toBe('--');
  });

  it('僅有空白時應回傳 --', () => {
    expect(formatSpec('   ')).toBe('--');
  });

});
