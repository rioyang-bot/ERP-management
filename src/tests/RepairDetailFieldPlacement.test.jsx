import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RepairOrderDetailModal from '../components/RepairOrderDetailModal';

/**
 * 每個階段各有自己的說明欄位
 *
 * 原本整張單共用一個 remarks，四個階段的動作彈窗都寫它，而且是
 * remarks = COALESCE($n, remarks) —— 送修時填的物流單號，到完工出貨那一步
 * 重打就被蓋掉，也查不出哪一筆是在哪一步填的。
 *
 *   現場處理／取回   on_site_status      現場狀況／故障描述
 *   送修原廠         send_oem_remarks    送修備註
 *   原廠返還／修復   results             維修與檢測結果
 *   客戶完工出貨     completion_remarks  出貨備註
 *
 * remarks 留給「建單備註」：建單表單寫的是聯絡窗口、派工工程師這類
 * 單據層級的事，不屬於任何一個階段，因此顯示在表頭而不是階段卡片。
 */

const ORDER = {
  id: 1,
  repair_no: 'RMA-20260918-01',
  status: 'COMPLETED',
  customer_name: '元大證券股份有限公司',
  on_site_date: '2026-09-18',
  on_site_status: '客戶反映 當機無法連線',
  send_oem_date: '2026-09-18',
  send_oem_remarks: '黑貓單號 123456789',
  oem_return_date: '2026-09-18',
  results: 'call Advanced RMA 換機 X0344311',
  completion_date: '2026-09-23',
  completion_remarks: 'X0344311 上架 QRT 取回 BC025722',
  remarks: '派工工程師 林耀群',
  items: [],
};

/** 找到含有這段標題的那張階段卡片 */
const cardWith = (heading) => {
  const label = screen.getByText(heading);
  return label.closest('div[style]').parentElement;
};

const open = (order) => render(
  <RepairOrderDetailModal isOpen repairOrder={order} onClose={() => {}} />
);

describe('四個階段各自的說明欄位', () => {
  it('現場處理放故障描述', () => {
    const card = () => cardWith('現場處理日 (On Site)');
    open(ORDER);
    expect(card()).toHaveTextContent('現場狀況 / 故障描述');
    expect(card()).toHaveTextContent('客戶反映 當機無法連線');
  });

  it('送修原廠放送修備註', () => {
    open(ORDER);
    const card = cardWith('送修原廠日 (Send OEM)');
    expect(card).toHaveTextContent('送修備註 (Remarks)');
    expect(card).toHaveTextContent('黑貓單號 123456789');
  });

  it('原廠返還放維修與檢測結果', () => {
    open(ORDER);
    const card = cardWith('原廠返還日 (OEM Return)');
    expect(card).toHaveTextContent('維修與檢測結果 (Results)');
    expect(card).toHaveTextContent('call Advanced RMA 換機 X0344311');
  });

  it('完工出貨放出貨備註', () => {
    open(ORDER);
    const card = cardWith('完工出貨日 (Completion)');
    expect(card).toHaveTextContent('出貨備註 (Remarks)');
    expect(card).toHaveTextContent('X0344311 上架 QRT 取回 BC025722');
  });

  /** 共用一欄時最大的毛病：後面的步驟會蓋掉前面的，兩筆不可能同時看得到 */
  it('送修備註與出貨備註同時存在，各自待在自己的卡片', () => {
    open(ORDER);
    const sendOem = cardWith('送修原廠日 (Send OEM)');
    const done = cardWith('完工出貨日 (Completion)');
    expect(sendOem).not.toHaveTextContent('X0344311 上架 QRT');
    expect(done).not.toHaveTextContent('黑貓單號');
  });

  it('建單備註放在表頭，不落在任何一張階段卡片', () => {
    open(ORDER);
    expect(screen.getByText('建單備註')).toBeInTheDocument();
    expect(screen.getByText('派工工程師 林耀群')).toBeInTheDocument();
    for (const head of ['現場處理日 (On Site)', '送修原廠日 (Send OEM)', '原廠返還日 (OEM Return)', '完工出貨日 (Completion)']) {
      expect(cardWith(head), head).not.toHaveTextContent('派工工程師');
    }
  });

  /**
   * 階段說明就算還沒填也要留著欄位 —— 它們在詳情裡可以就地修改，
   * 藏起來就沒有地方可以填進去。建單備註不是階段說明，沒填就不佔版面。
   */
  it('階段說明沒填也留著位置，建單備註沒填就不顯示', () => {
    open({ ...ORDER, send_oem_remarks: null, completion_remarks: null, remarks: null });
    expect(cardWith('送修原廠日 (Send OEM)')).toHaveTextContent('送修備註 (Remarks)');
    expect(cardWith('完工出貨日 (Completion)')).toHaveTextContent('出貨備註 (Remarks)');
    expect(screen.getAllByText('尚未填寫')).toHaveLength(2);
    expect(screen.queryByText('建單備註')).not.toBeInTheDocument();
  });

  it('還沒返還時留著提示，看得出來這欄是等原廠返還才填', () => {
    open({ ...ORDER, status: 'SENT_OEM', oem_return_date: null, results: null });
    expect(cardWith('原廠返還日 (OEM Return)')).toHaveTextContent('待原廠返還時記錄');
  });

  /**
   * 不送原廠的單沒走過原廠返還那一步，維修結果是在自行維修完工時
   * 跟完工日期一起填的，因此要跟著搬到完工出貨那張卡片。
   */
  it('不送原廠的單，維修結果跟著完工出貨', () => {
    open({ ...ORDER, no_oem_required: true, oem_return_date: null });
    expect(cardWith('完工出貨日 (Completion)')).toHaveTextContent('維修與檢測結果 (Results)');
    expect(cardWith('原廠返還日 (OEM Return)')).not.toHaveTextContent('維修與檢測結果');
  });
});

/**
 * 四張階段卡片要長得一樣
 *
 * 原本第一張的形狀跟其他三張不同：值的位置放的是一段紅色故障描述，日期被擠到
 * 底下的小字；另外三張放的是日期。四張並排時字級從 11 到 13 混用，看起來不整齊。
 * 現在統一成「標題 / 日期 / 狀態 / 附註」，字級只有 11、12、15 三種。
 */
describe('四張階段卡片的形狀一致', () => {
  const CARD_HEADS = [
    '現場處理日 (On Site)',
    '送修原廠日 (Send OEM)',
    '原廠返還日 (OEM Return)',
    '完工出貨日 (Completion)',
  ];

  it('每張卡片都是標題、日期、狀態這個順序', () => {
    open(ORDER);
    for (const head of CARD_HEADS) {
      const card = cardWith(head);
      const lines = [...card.children].filter((c) => c.tagName === 'DIV');
      expect(lines[0], head).toHaveTextContent(head);
      expect(lines[1].style.fontSize, head).toBe('15px');
      expect(lines[2].textContent, head).toMatch(/^狀態：/);
    }
  });

  it('日期用等寬數字，四張卡片才會切齊', () => {
    open(ORDER);
    for (const head of CARD_HEADS) {
      const date = [...cardWith(head).children][1];
      expect(date.style.fontVariantNumeric, head).toBe('tabular-nums');
    }
  });

  it('字級只用 11 / 12 / 15 三種', () => {
    open(ORDER);
    const sizes = new Set();
    for (const head of CARD_HEADS) {
      cardWith(head).querySelectorAll('div').forEach((d) => {
        if (d.style.fontSize) sizes.add(d.style.fontSize);
      });
    }
    expect([...sizes].sort()).toEqual(['11px', '12px', '15px']);
  });

  it('直接送原廠的單，現場那張標為不適用且不留空的故障描述', () => {
    open({ ...ORDER, on_site_date: null, on_site_status: null });
    const card = cardWith('現場處理日 (On Site)');
    expect(card).toHaveTextContent('不適用');
    expect(card).not.toHaveTextContent('故障描述');
  });
});
