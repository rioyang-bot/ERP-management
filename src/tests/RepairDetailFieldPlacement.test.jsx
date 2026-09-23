import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RepairOrderDetailModal from '../components/RepairOrderDetailModal';

/**
 * 維修結果與備註要放在「填它的那一步」旁邊
 *
 * 原本這兩塊排在四張日期卡片下面，單獨成區。看的人分不出哪一段是何時記錄的 ——
 * 維修結果其實是原廠返還時填的，備註則是完工出貨那一步帶進來的。
 * 擺回各自的階段卡片裡，時間點自己就說清楚了。
 */

const ORDER = {
  id: 1,
  repair_no: 'RMA-20260918-01',
  status: 'COMPLETED',
  customer_name: '元大證券股份有限公司',
  on_site_date: '2026-09-18',
  on_site_status: '客戶反映 當機無法連線',
  send_oem_date: '2026-09-18',
  oem_return_date: '2026-09-18',
  completion_date: '2026-09-23',
  results: 'call Advanced RMA 換機 X0344311',
  remarks: 'X0344311 上架 QRT 取回 BC025722',
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

describe('維修結果與備註的位置', () => {
  it('維修結果放在原廠返還卡片裡', () => {
    open(ORDER);
    const card = cardWith('原廠返還日 (OEM Return)');
    expect(card).toHaveTextContent('維修與檢測結果 (Results)');
    expect(card).toHaveTextContent('call Advanced RMA 換機 X0344311');
  });

  it('備註放在完工出貨卡片裡', () => {
    open(ORDER);
    const card = cardWith('完工出貨日 (Completion)');
    expect(card).toHaveTextContent('出貨備註 (Remarks)');
    expect(card).toHaveTextContent('X0344311 上架 QRT 取回 BC025722');
  });

  it('維修結果不會同時出現在完工出貨卡片', () => {
    open(ORDER);
    expect(cardWith('完工出貨日 (Completion)')).not.toHaveTextContent('維修與檢測結果');
    expect(screen.getAllByText(/維修與檢測結果/)).toHaveLength(1);
  });

  it('還沒返還時留著提示，看得出來這欄是等原廠返還才填', () => {
    open({ ...ORDER, status: 'SENT_OEM', oem_return_date: null, results: null, remarks: null });
    const card = cardWith('原廠返還日 (OEM Return)');
    expect(card).toHaveTextContent('待原廠返還時記錄');
  });

  it('沒有備註就不佔版面', () => {
    open({ ...ORDER, remarks: null });
    expect(screen.queryByText(/出貨備註/)).not.toBeInTheDocument();
  });

  /**
   * 備註只有一欄，每一步都會整個覆寫它，所以它屬於「最後走到的那一步」。
   * 單子還在半路上時把備註掛在完工出貨底下，那張卡片連日期都還沒有，
   * 反而比原本擺在最下面更難懂。
   */
  it('單子還沒完工時，備註掛在最後走到的那一步', () => {
    open({
      ...ORDER,
      status: 'SENT_OEM',
      oem_return_date: null,
      completion_date: null,
      results: null,
      remarks: '黑貓單號 123456789',
    });
    const card = cardWith('送修原廠日 (Send OEM)');
    expect(card).toHaveTextContent('備註 (Remarks)');
    expect(card).toHaveTextContent('黑貓單號 123456789');
    expect(cardWith('完工出貨日 (Completion)')).not.toHaveTextContent('備註');
  });

  it('只走到現場處理時，備註掛在現場處理那一步', () => {
    open({
      ...ORDER,
      status: 'ON_SITE_HANDLING',
      send_oem_date: null,
      oem_return_date: null,
      completion_date: null,
      results: null,
      remarks: '客戶約 9/25 到場',
    });
    expect(cardWith('現場狀況 / 故障描述')).toHaveTextContent('客戶約 9/25 到場');
  });

  it('備註只出現一次，不會四張卡片都印', () => {
    open(ORDER);
    expect(screen.getAllByText(/備註 \(Remarks\)/)).toHaveLength(1);
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
