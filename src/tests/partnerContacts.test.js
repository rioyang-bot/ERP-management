import { describe, it, expect } from 'vitest';
import { getCustomerNames, getContactsForCustomer, findContactPhone } from '../utils/partnerContacts';

/**
 * partners 是「一位聯絡人一列」，同一家公司有幾位聯絡人就有幾列。
 * 直接丟進選單會看到同一個公司名重複好幾次、分不出誰是誰。
 */
const PARTNERS = [
  { id: 1, name: '元大Yuanta', contact: 'Niky', phone: '02-1111-1111' },
  { id: 2, name: '元大Yuanta', contact: 'Ryan', phone: '02-2222-2222' },
  { id: 3, name: '元大Yuanta', contact: '宏訊', phone: '' },
  { id: 4, name: '凱基', contact: '吳沛恆', phone: '02-3333-3333' },
  { id: 5, name: '沒有聯絡人的公司', contact: '', phone: '' },
];

describe('公司名稱清單', () => {
  it('同一家公司只列一次', () => {
    expect(getCustomerNames(PARTNERS)).toEqual(['元大Yuanta', '凱基', '沒有聯絡人的公司']);
  });

  it('不分大小寫視為同一家', () => {
    const names = getCustomerNames([{ name: 'ACME' }, { name: 'acme' }, { name: ' Acme ' }]);
    expect(names).toEqual(['ACME']);
  });

  it('空名稱不列入', () => {
    expect(getCustomerNames([{ name: '' }, { name: '  ' }, { name: 'A' }])).toEqual(['A']);
  });

  it('空輸入不會出錯', () => {
    expect(getCustomerNames(null)).toEqual([]);
  });
});

describe('某一家公司底下的聯絡人', () => {
  it('列出這家公司的每一位聯絡人', () => {
    expect(getContactsForCustomer(PARTNERS, '元大Yuanta').map((c) => c.contact))
      .toEqual(['Niky', 'Ryan', '宏訊']);
  });

  it('一併帶出電話', () => {
    expect(getContactsForCustomer(PARTNERS, '元大Yuanta')[0])
      .toEqual({ contact: 'Niky', phone: '02-1111-1111' });
  });

  it('不會混到別家公司的聯絡人', () => {
    expect(getContactsForCustomer(PARTNERS, '凱基').map((c) => c.contact)).toEqual(['吳沛恆']);
  });

  it('大小寫與前後空白不影響比對（使用者是用打字的）', () => {
    expect(getContactsForCustomer(PARTNERS, '  元大yuanta  ')).toHaveLength(3);
  });

  it('沒有建檔聯絡人的公司回傳空陣列', () => {
    expect(getContactsForCustomer(PARTNERS, '沒有聯絡人的公司')).toEqual([]);
  });

  it('同名聯絡人只留一筆', () => {
    const dup = [
      { name: 'A', contact: '王先生', phone: '1' },
      { name: 'A', contact: ' 王先生 ', phone: '2' },
    ];
    expect(getContactsForCustomer(dup, 'A')).toHaveLength(1);
  });

  it('也吃 contact_person 這個欄位名', () => {
    expect(getContactsForCustomer([{ name: 'A', contact_person: '李小姐' }], 'A')[0].contact)
      .toBe('李小姐');
  });

  it('沒有客戶名稱時回傳空陣列，不會列出全部', () => {
    expect(getContactsForCustomer(PARTNERS, '')).toEqual([]);
    expect(getContactsForCustomer(PARTNERS, null)).toEqual([]);
  });
});

describe('依聯絡人找電話', () => {
  it('找得到就回傳', () => {
    expect(findContactPhone(PARTNERS, '元大Yuanta', 'Ryan')).toBe('02-2222-2222');
  });

  it('聯絡人沒有電話時回空字串', () => {
    expect(findContactPhone(PARTNERS, '元大Yuanta', '宏訊')).toBe('');
  });

  it('找不到的聯絡人回空字串', () => {
    expect(findContactPhone(PARTNERS, '元大Yuanta', '不存在')).toBe('');
  });
});
