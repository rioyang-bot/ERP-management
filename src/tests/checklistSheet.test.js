import { describe, it, expect } from 'vitest';
import {
  buildChecklistSheet,
  formatMountedHardware,
  getContactName,
  groupChecklistItems,
  pairFields,
  escapeHtml,
  SHEET_FIELDS,
} from '../utils/checklistSheet';

/**
 * 出機檢查表的列印內容
 *
 * 表頭要印哪些欄位是需求裡明確列出的，因此逐欄驗證 ——
 * 少印一欄現場就得回頭查系統，這張表就失去意義了。
 */
const DEVICE = {
  id: 1,
  type: 'SERVER',
  brand: 'BLACKCORE',
  model: '3122-SM',
  specification: '26C / 256G',
  sn: 'DFE322328070001',
  hostname: 'NeoTap',
  client: '凱基',
  partner_contact: '吳沛恆',
  location: 'UAT DC',
  remarks: '客戶指定機櫃 B13',
  components: [
    { brand: 'INTEL', model: 'ULTRA9 285K', sn: 'U5M16V5601255' },
    { brand: 'V-COLOR', model: 'PC5-46400', sn: 'STG10005Y26' },
  ],
};

const ITEMS = [
  { id: 1, group_name: 'BLACKCORE 出機檢查', kind: 'MAIN', item_name: 'BIOS 設定', is_checked: true },
  { id: 2, group_name: 'BLACKCORE 出機檢查', kind: 'MAIN', item_name: '網路設定', is_checked: false },
  { id: 3, group_name: 'BLACKCORE 出機檢查', kind: 'DETAIL', item_name: '開機順序', is_checked: true },
  { id: 4, group_name: '共通檢查', kind: 'MAIN', item_name: '外觀檢查', is_checked: false },
];

describe('列印內容一定要有的欄位', () => {
  const { body } = buildChecklistSheet(DEVICE, ITEMS);

  it.each([
    ['類型', 'SERVER'],
    ['廠牌', 'BLACKCORE'],
    ['型號', '3122-SM'],
    ['規格', '26C / 256G'],
    ['設備序號', 'DFE322328070001'],
    ['主機名稱', 'NeoTap'],
    ['客戶名稱', '凱基'],
    ['聯絡人', '吳沛恆'],
    ['放置位置', 'UAT DC'],
    ['備註', '客戶指定機櫃 B13'],
  ])('印出 %s 與其內容', (label, value) => {
    expect(body).toContain(label);
    expect(body).toContain(value);
  });

  it('搭載硬體連同序號一起印出來', () => {
    expect(body).toContain('搭載硬體');
    expect(body).toContain('U5M16V5601255');
    expect(body).toContain('STG10005Y26');
    expect(body).toContain('INTEL ULTRA9 285K');
  });

  it('檢查項目與完成狀態都印得出來', () => {
    expect(body).toContain('BIOS 設定');
    expect(body).toContain('網路設定');
    expect(body).toContain('開機順序');
    // 已勾選用實心方框、未勾選用空框
    expect(body).toContain('☑');
    expect(body).toContain('☐');
  });

  it('依主項目分段，看得出哪些項目屬於哪一組', () => {
    expect(body).toContain('BLACKCORE 出機檢查');
    expect(body).toContain('共通檢查');
  });

  it('標示總項數與完成數', () => {
    expect(body).toContain('共 4 項');
    expect(body).toContain('已完成 2 項');
  });

  it('留下檢查人員與日期的簽核欄位', () => {
    expect(body).toContain('檢查人員');
    expect(body).toContain('檢查日期');
  });

  it('欄位定義與實際印出的順序一致', () => {
    const positions = SHEET_FIELDS.map((f) => body.indexOf(f.label));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

/**
 * 版面是整張表格。先前預覽只是把內容塞進畫面、樣式卻只存在列印文件裡，
 * 看到的是沒有框線的純文字，與印出來的完全是兩回事。
 */
describe('表格版面', () => {
  const { body, html } = buildChecklistSheet(DEVICE, ITEMS);

  it('設備資訊是「標題｜內容」兩組併排，一列放兩個欄位', () => {
    // 類型與廠牌在同一列
    expect(body).toMatch(/<tr><th>類型<\/th><td>SERVER<\/td><th>廠牌<\/th><td>BLACKCORE<\/td><\/tr>/);
  });

  it('搭載硬體獨佔一整列', () => {
    expect(body).toContain('<th>搭載硬體</th>');
    expect(body).toContain('colspan="3"');
  });

  it('檢查項目表有項次、類別、項目、結果與備註欄', () => {
    ['項次', '類別', '檢查項目', '檢查結果', '備註'].forEach((h) => expect(body).toContain(h));
  });

  it('項次連號，跨主項目也不重來', () => {
    const seqCells = [...body.matchAll(/<td class="col-seq">(\d+)<\/td>/g)].map((m) => Number(m[1]));
    expect(seqCells).toEqual([1, 2, 3, 4]);
  });

  it('主項目在表格中以整列標題呈現', () => {
    expect(body).toContain('<tr class="group-row">');
    expect(body).toContain('BLACKCORE 出機檢查');
  });

  it('每一項都留一格空白備註供現場手寫', () => {
    expect(body).toContain('<td class="col-note"></td>');
  });

  it('樣式與內容放在同一份文件，預覽與列印看到的一致', () => {
    expect(html).toContain('<style>');
    expect(html).toContain('border-collapse: collapse');
    expect(html).toContain('@page');
  });

  it('表頭在跨頁時會重複，長清單第二頁才看得懂欄位', () => {
    expect(html).toContain('thead { display: table-header-group; }');
  });
});

describe('欄位兩兩成對', () => {
  it('偶數個欄位剛好配對', () => {
    expect(pairFields(['a', 'b', 'c', 'd'])).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('奇數個時最後一個落單，另一半補 null', () => {
    expect(pairFields(['a', 'b', 'c'])).toEqual([['a', 'b'], ['c', null]]);
  });

  it('空清單不會出錯', () => {
    expect(pairFields([])).toEqual([]);
  });

  it('落單時把內容欄拉滿，不會留下半截的格子', () => {
    const odd = buildChecklistSheet({ type: 'A' }, []);
    // 目前欄位數是偶數，這裡直接驗證落單時用的樣式存在
    expect(odd.html).toContain('td.blank');
  });
});

describe('沒有資料時不會印出破碎的表格', () => {
  it('空欄位以破折號代替，不會留下空白格', () => {
    const { body } = buildChecklistSheet({ sn: 'SN-1' }, []);
    expect(body).toContain('—');
    expect(body).toContain('尚未套用任何檢查項目');
  });

  it('沒有搭載硬體時不會出錯', () => {
    expect(formatMountedHardware({ components: null })).toEqual([]);
    expect(formatMountedHardware({})).toEqual([]);
  });

  it('缺少設備資料也能產生內容', () => {
    const { body, html } = buildChecklistSheet(null, null);
    expect(body).toContain('出機檢查表');
    expect(html).toContain('<!DOCTYPE html>');
  });
});

describe('搭載硬體的呈現', () => {
  it('廠牌型號與序號併成一行', () => {
    expect(formatMountedHardware(DEVICE)[0]).toBe('INTEL ULTRA9 285K（SN: U5M16V5601255）');
  });

  it('只有序號時仍列得出來', () => {
    expect(formatMountedHardware({ components: [{ sn: 'ONLY-SN' }] })).toEqual(['SN: ONLY-SN']);
  });

  it('整筆都是空的就跳過，不會印出空行', () => {
    expect(formatMountedHardware({ components: [{}, null, { sn: 'A' }] })).toEqual(['SN: A']);
  });
});

describe('聯絡人的來源', () => {
  it('優先用資產上帶出來的聯絡人', () => {
    expect(getContactName({ partner_contact: 'A', custom_attributes: { contact_person: 'B' } })).toBe('A');
  });

  it('沒有時退回自訂屬性裡的聯絡人', () => {
    expect(getContactName({ custom_attributes: { contact_person: 'B' } })).toBe('B');
  });

  it('都沒有就是空字串', () => {
    expect(getContactName({})).toBe('');
    expect(getContactName(null)).toBe('');
  });
});

describe('檢查項目分組', () => {
  it('依主項目分組並保留原本順序', () => {
    const groups = groupChecklistItems(ITEMS);
    expect(groups.map((g) => g.name)).toEqual(['BLACKCORE 出機檢查', '共通檢查']);
    expect(groups[0].rows).toHaveLength(3);
  });

  it('沒有主項目名稱的歸到未分類', () => {
    expect(groupChecklistItems([{ item_name: 'X' }])[0].name).toBe('未分類');
  });

  it('空輸入回傳空陣列', () => {
    expect(groupChecklistItems(null)).toEqual([]);
  });
});

describe('內容逸出', () => {
  it('設備欄位裡的角括號不會變成標籤', () => {
    const { body } = buildChecklistSheet({ ...DEVICE, remarks: '<script>alert(1)</script>' }, []);
    expect(body).not.toContain('<script>');
    expect(body).toContain('&lt;script&gt;');
  });

  it('檢查項目名稱同樣逸出', () => {
    const { body } = buildChecklistSheet(DEVICE, [{ group_name: 'G', kind: 'MAIN', item_name: '<b>X</b>' }]);
    expect(body).toContain('&lt;b&gt;X&lt;/b&gt;');
  });

  it('逸出函式處理所有需要的字元', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
    expect(escapeHtml(null)).toBe('');
  });
});
