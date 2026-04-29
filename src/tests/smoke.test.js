import { describe, it, expect } from 'vitest';

describe('基礎環境測試 (Smoke Test)', () => {
  it('應能正確執行基本的數學運算', () => {
    expect(1 + 1).toBe(2);
  });

  it('應能正確處理字串操作', () => {
    const greeting = 'Hello METECH';
    expect(greeting).toContain('METECH');
  });
});
