import { describe, it, expect } from 'vitest';
import { matchPartnerContact, getTokens, normalizeStr } from '../utils/partnerMatcher';

describe('PartnerMatcher Utility', () => {
  const mockPartners = [
    {
      id: 5,
      name: '元大Yuanta',
      contact: 'Ryan',
      phone: '02-27001234',
      type: 'CUSTOMER'
    },
    {
      id: 6,
      name: '元大Yuanta',
      contact: 'Niky',
      phone: '0912-345678',
      project_info: '國法、IMC',
      type: 'CUSTOMER'
    },
    {
      id: 17,
      name: '富邦綜合證券股份有限公司',
      contact: 'David Chen',
      phone: '0918600800',
      type: 'CUSTOMER'
    },
    {
      id: 12,
      name: 'LDA Tech',
      contact: 'Jack',
      phone: '02-88889999',
      type: 'SUPPLIER'
    }
  ];

  it('應正確將字串轉為分詞 (getTokens)', () => {
    expect(getTokens('Niky imc')).toEqual(['niky', 'imc']);
    expect(getTokens('Niky (IMC)')).toEqual(['niky', 'imc']);
    expect(getTokens('元大-Niky/宏訊')).toEqual(['元大', 'niky', '宏訊']);
  });

  it('能精確匹配完全相同的聯絡人 (Exact Match)', () => {
    const res = matchPartnerContact('Niky', '元大Yuanta', mockPartners);
    expect(res.matched).toBe(true);
    expect(res.contact_person).toBe('Niky');
    expect(res.contact_phone).toBe('0912-345678');
    expect(res.isFuzzy).toBe(false);
  });

  it('能成功透過「Niky imc」模糊分詞匹配到管理中的「Niky」並帶入電話', () => {
    const res = matchPartnerContact('Niky imc', '', mockPartners);
    expect(res.matched).toBe(true);
    expect(res.contact_person).toBe('Niky');
    expect(res.contact_phone).toBe('0912-345678');
    expect(res.client).toBe('元大Yuanta'); // 自動補齊所屬客戶
    expect(res.isFuzzy).toBe(true);
    expect(res.raw_contact).toBe('Niky imc');
  });

  it('能支援跨欄位與大小寫混用 (如 niky IMC)', () => {
    const res = matchPartnerContact('niky IMC', '元大', mockPartners);
    expect(res.matched).toBe(true);
    expect(res.contact_person).toBe('Niky');
    expect(res.contact_phone).toBe('0912-345678');
    expect(res.client).toBe('元大');
  });

  it('在多位聯絡人時能依客戶名稱精準鎖定 (元大底下有 Ryan 與 Niky)', () => {
    const resRyan = matchPartnerContact('Ryan', '元大Yuanta', mockPartners);
    expect(resRyan.matched).toBe(true);
    expect(resRyan.contact_person).toBe('Ryan');
    expect(resRyan.contact_phone).toBe('02-27001234');

    const resNiky = matchPartnerContact('Niky', '元大Yuanta', mockPartners);
    expect(resNiky.matched).toBe(true);
    expect(resNiky.contact_person).toBe('Niky');
    expect(resNiky.contact_phone).toBe('0912-345678');
  });

  it('輸入未建檔之聯絡人時應回傳未匹配並保留原值', () => {
    const res = matchPartnerContact('Unknown Person', '未知公司', mockPartners);
    expect(res.matched).toBe(false);
    expect(res.contact_person).toBe('Unknown Person');
    expect(res.contact_phone).toBe('');
    expect(res.client).toBe('未知公司');
  });

  it('無聯絡人但客戶名稱完全相符且有聯絡人時應可自動補正', () => {
    const res = matchPartnerContact('', '富邦綜合證券股份有限公司', mockPartners);
    expect(res.matched).toBe(true);
    expect(res.contact_person).toBe('David Chen');
    expect(res.contact_phone).toBe('0918600800');
  });

  it('無獨立聯絡人欄位但客戶欄位包含「公司+聯絡人」（如 Yuanta Ryan）時應能自動識別並帶入聯絡人與電話', () => {
    const resRyan = matchPartnerContact('', 'Yuanta Ryan', mockPartners);
    expect(resRyan.matched).toBe(true);
    expect(resRyan.contact_person).toBe('Ryan');
    expect(resRyan.contact_phone).toBe('02-27001234');
    expect(resRyan.isFuzzy).toBe(true);

    const resNiky = matchPartnerContact('', '元大-Niky', mockPartners);
    expect(resNiky.matched).toBe(true);
    expect(resNiky.contact_person).toBe('Niky');
    expect(resNiky.contact_phone).toBe('0912-345678');
    expect(resNiky.isFuzzy).toBe(true);
  });

  it('當匯入聯絡人寫「Yuanta imc」（無Niky名字）時，應能透過專案關鍵字 IMC 自動定位並帶入 Niky 的聯絡人資訊與電話，且回傳 matched_project 與 matched_relation 為 IMC', () => {
    const res = matchPartnerContact('Yuanta imc', '', mockPartners);
    expect(res.matched).toBe(true);
    expect(res.contact_person).toBe('Niky');
    expect(res.contact_phone).toBe('0912-345678');
    expect(res.client).toBe('元大Yuanta');
    expect(res.isFuzzy).toBe(true);
    expect(res.matched_project).toBe('IMC');
    expect(res.matched_relation).toBe('IMC');
  });

  it('當客戶名稱為 Niky 且專案資訊為「國法、IMC」時，匯入「Yuanta imc」能自動將 imc 帶入 Niky 的聯絡人資訊並回傳 matched_project 與 matched_relation 為 IMC', () => {
    const customPartners = [
      {
        id: 99,
        name: 'Niky',
        contact: 'Niky',
        phone: '0988-111222',
        project_info: '國法、IMC',
        type: 'CUSTOMER'
      }
    ];
    const res = matchPartnerContact('Yuanta imc', '', customPartners);
    expect(res.matched).toBe(true);
    expect(res.contact_person).toBe('Niky');
    expect(res.contact_phone).toBe('0988-111222');
    expect(res.matched_project).toBe('IMC');
    expect(res.matched_relation).toBe('IMC');
  });

  it('當匯入聯絡人為「IMC」時，應直接對應到 Niky 且 matched_relation 為「IMC」，以便在設備列表中明確顯示', () => {
    const res = matchPartnerContact('IMC', '', mockPartners);
    expect(res.matched).toBe(true);
    expect(res.contact_person).toBe('Niky');
    expect(res.contact_phone).toBe('0912-345678');
    expect(res.client).toBe('元大Yuanta');
    expect(res.matched_project).toBe('IMC');
    expect(res.matched_relation).toBe('IMC');
  });
});
