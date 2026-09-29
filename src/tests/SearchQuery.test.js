import { describe, it, expect } from 'vitest';
import { parseSearchQuery, matchesSearchQuery } from '../utils/searchQuery';

/**
 * 多組關鍵字搜尋
 *
 * 同一位客戶被寫成好幾種（郭沛晴 = Niky / Yuanta QFII / 元大 郭沛晴…）。
 * 先前試過依聯絡人自動展開，但範圍會失控：搜「QRT」這個 End-user 時，
 * 會先命中聯絡人再把那位聯絡人名下所有設備撈出來，遠超過使用者要的。
 *
 * 改成使用者自己指定：逗號分組，組間是「或」，組內維持原本以空白分隔的「且」。
 */
describe('查詢字串的解析', () => {
  it('逗號分組，組內以空白分隔', () => {
    expect(parseSearchQuery('niky,郭沛晴')).toEqual([['niky'], ['郭沛晴']]);
    expect(parseSearchQuery('yuanta niky,郭沛晴')).toEqual([['yuanta', 'niky'], ['郭沛晴']]);
  });

  it('全形逗號一樣可以 —— 中文輸入法打出來常常是全形', () => {
    expect(parseSearchQuery('niky，郭沛晴')).toEqual([['niky'], ['郭沛晴']]);
  });

  it('一律轉小寫，比對時不分大小寫', () => {
    expect(parseSearchQuery('NIKY,Ryan')).toEqual([['niky'], ['ryan']]);
  });

  it('多餘的逗號與空白不會產生空群組', () => {
    expect(parseSearchQuery(' niky , , 郭沛晴 ,')).toEqual([['niky'], ['郭沛晴']]);
    expect(parseSearchQuery('  ')).toEqual([]);
    expect(parseSearchQuery('')).toEqual([]);
    expect(parseSearchQuery(null)).toEqual([]);
  });
});

describe('比對規則', () => {
  const ROWS = [
    { sn: 'A1', client: 'Yuanta Niky', end_user: 'QRT' },
    { sn: 'A2', client: '元大 郭沛晴', end_user: '' },
    { sn: 'A3', client: 'Yuanta QFII', end_user: 'QRT' },
    { sn: 'B1', client: 'Yuanta Ryan', end_user: '' },
  ];
  const find = (q) => ROWS.filter((r) => matchesSearchQuery(
    parseSearchQuery(q),
    (term) => `${r.client} ${r.end_user} ${r.sn}`.toLowerCase().includes(term),
  )).map((r) => r.sn);

  it('單一關鍵字維持原本行為', () => {
    expect(find('niky')).toEqual(['A1']);
  });

  /** 這是這次要解決的：使用者自己把兩種寫法都列出來 */
  it('逗號把多種寫法併在一起', () => {
    expect(find('niky,郭沛晴')).toEqual(['A1', 'A2']);
    expect(find('niky,郭沛晴,qfii')).toEqual(['A1', 'A2', 'A3']);
  });

  it('組內仍然是「且」', () => {
    expect(find('yuanta niky')).toEqual(['A1']);
    expect(find('yuanta 郭沛晴')).toEqual([]);
    expect(find('yuanta niky,元大 郭沛晴')).toEqual(['A1', 'A2']);
  });

  /**
   * 先前自動展開最大的毛病：搜 QRT 會把同一位聯絡人名下全部設備撈出來。
   * 現在 QRT 就只有 QRT 那幾台。
   */
  it('搜 End-user 只會得到該 End-user 的那幾台', () => {
    expect(find('qrt')).toEqual(['A1', 'A3']);
  });

  it('沒有關鍵字就全部通過', () => {
    expect(find('')).toEqual(['A1', 'A2', 'A3', 'B1']);
    expect(matchesSearchQuery([], () => false)).toBe(true);
  });
});
