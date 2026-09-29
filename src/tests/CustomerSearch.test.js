import { describe, it, expect } from 'vitest';
import { matchedContacts, belongsToContacts, expandedSpellings } from '../utils/customerSearch';

/**
 * 同一位客戶的多種寫法
 *
 * 匯入時同一個人被寫成好幾種：郭沛晴有 Niky／Yuanta Niky／Yuanta QFII／
 * 元大 郭沛晴 等六種寫法。搜「郭沛晴」找不到 Yuanta Niky 的設備，反之亦然。
 * contact_person 早就正規化了，拿它當對照表就不必另外維護別名。
 */
const ACC = {
  getClient: (i) => i.client,
  getEndUser: (i) => i.end_user,
  getContact: (i) => i.partner_contact,
};

const ITEMS = [
  { sn: 'A1', client: 'Yuanta Niky', end_user: 'QRT', partner_contact: '郭沛晴' },
  { sn: 'A2', client: '元大 郭沛晴', end_user: '', partner_contact: '郭沛晴' },
  { sn: 'A3', client: 'Yuanta QFII', end_user: '', partner_contact: '郭沛晴' },
  { sn: 'B1', client: 'Yuanta Ryan', end_user: '', partner_contact: '林耀群' },
  { sn: 'B2', client: '元大 林耀群', end_user: '', partner_contact: '林耀群' },
  { sn: 'C1', client: 'METECH', end_user: '', partner_contact: '' },
];

const expand = (terms) => {
  const contacts = matchedContacts(ITEMS, terms, ACC);
  return ITEMS.filter((i) => belongsToContacts(i, contacts, ACC)).map((i) => i.sn);
};

describe('依聯絡人展開客戶的各種寫法', () => {
  it('搜中文姓名，連英文代號那些列也找得到', () => {
    expect(expand(['郭沛晴'])).toEqual(['A1', 'A2', 'A3']);
  });

  /** 這是原本完全做不到的方向 */
  it('搜英文代號，中文那些列也找得到', () => {
    expect(expand(['niky'])).toEqual(['A1', 'A2', 'A3']);
    expect(expand(['qfii'])).toEqual(['A1', 'A2', 'A3']);
  });

  it('大小寫與前後空白都不影響', () => {
    expect(expand(['  NIKY  '])).toEqual(['A1', 'A2', 'A3']);
  });

  it('搜 End-user 一樣展開得到', () => {
    expect(expand(['qrt'])).toEqual(['A1', 'A2', 'A3']);
  });

  it('不同聯絡人不會混在一起', () => {
    expect(expand(['ryan'])).toEqual(['B1', 'B2']);
  });

  it('搜公司名時兩位聯絡人都算命中', () => {
    expect(expand(['元大'])).toEqual(['A1', 'A2', 'A3', 'B1', 'B2']);
  });

  it('多個關鍵字之間是 AND，與列表既有行為一致', () => {
    expect(expand(['yuanta', 'niky'])).toEqual(['A1', 'A2', 'A3']);
    expect(expand(['yuanta', '不存在'])).toEqual([]);
  });

  it('沒有聯絡人的資料不會被展開牽連', () => {
    expect(expand(['metech'])).toEqual([]);
  });

  it('沒有關鍵字就不展開', () => {
    expect(matchedContacts(ITEMS, [], ACC).size).toBe(0);
    expect(expand([])).toEqual([]);
  });

  /**
   * 只從客戶身分欄位取聯絡人。若序號也算，搜一組序號就會把那位客戶
   * 整批設備撈出來 —— 那不是使用者搜序號時想要的。
   */
  it('序號不參與展開', () => {
    expect(expand(['A1'])).toEqual([]);
  });
});

describe('說明多納進來的寫法', () => {
  it('列出關鍵字沒有直接命中的那些寫法', () => {
    const contacts = matchedContacts(ITEMS, ['niky'], ACC);
    expect(expandedSpellings(ITEMS, contacts, ['niky'], ACC)).toEqual(['Yuanta QFII', '元大 郭沛晴']);
  });

  it('直接命中的那個寫法不必解釋', () => {
    const contacts = matchedContacts(ITEMS, ['niky'], ACC);
    expect(expandedSpellings(ITEMS, contacts, ['niky'], ACC)).not.toContain('Yuanta Niky');
  });

  it('沒有展開就沒有要說明的', () => {
    expect(expandedSpellings(ITEMS, new Set(), ['x'], ACC)).toEqual([]);
  });
});
