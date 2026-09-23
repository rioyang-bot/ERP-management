import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RepairList from '../pages/RepairList';

/**
 * 維修單列表的欄位
 *
 * 現場處理日和送修與完工資訊原本分成兩欄，日期被拆在表格兩端，
 * 一張單走到哪一步還要左右對照。兩欄併成「維修時程」，四個階段的日期排在一起。
 *
 * 維修結果不放進這一欄：它原本是截斷成一行的摘要，幫不上忙，詳情裡有完整內容。
 * 故障描述仍然是獨立的一欄，但只顯示 —— 四段說明都集中在「檢視」的詳情裡修改。
 *
 * 維修時程排在當前狀態後面：先看單子在哪一階段，再往右看走過的日期。
 *
 * 單號不再是連結 —— 同一列右邊就有「檢視」，兩個一樣的入口只是噪音，
 * 而且 RMA-20260923-01 斷成兩行會把整列撐高。
 */
const ORDERS = [
  {
    id: 7, repair_no: 'RMA-20260923-01', customer_name: '元大Yuanta',
    status: 'COMPLETED', on_site_status: '主機板錯誤碼 552',
    on_site_date: '2026-09-17', send_oem_date: '2026-09-18',
    oem_return_date: '2026-09-20', completion_date: '2026-09-23',
    results: 'call Advanced RMA 換機 X0344311',
    item_count: 1, items: [{ id: 1, sn: 'SRV-001' }], created_at: '2026-09-23T00:00:00.000Z',
  },
];

describe('維修單列表的欄位', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn((query) => (query === 'fetchRepairOrders'
        ? Promise.resolve({ success: true, rows: ORDERS })
        : Promise.resolve({ success: true, rows: [] }))),
      runTransaction: vi.fn(),
      saveFile: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const open = async () => {
    render(<MemoryRouter><RepairList /></MemoryRouter>);
    await screen.findByText('RMA-20260923-01');
  };

  const headers = () => [...document.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  const cells = () => [...screen.getByText('RMA-20260923-01').closest('tr').querySelectorAll('td')];
  /** 依欄位標題取該列的格子，不寫死索引 */
  const cellOf = (header) => {
    const i = headers().indexOf(header);
    if (i < 0) throw new Error(`找不到欄位：${header}`);
    return cells()[i];
  };

  it('欄位順序：維修時程排在當前狀態後面', async () => {
    await open();
    expect(headers()).toEqual([
      '維修單號 (Repair No.)',
      '客戶 (Customer)',
      '設備明細 (Device / SN)',
      '現場狀況 / 故障描述',
      '當前狀態',
      '維修時程 (Maint. Timeline)',
      '操作流程',
    ]);
  });

  it('現場處理日與送修完工資訊併成「維修時程」', async () => {
    await open();
    expect(headers()).toContain('維修時程 (Maint. Timeline)');
    expect(headers()).not.toContain('現場處理日 (On-site)');
    expect(headers()).not.toContain('送修與完工資訊 (OEM & Shipping)');
  });

  it('故障描述仍然是獨立的一欄', async () => {
    await open();
    expect(headers()).toContain('現場狀況 / 故障描述');
    expect(screen.getByText('主機板錯誤碼 552')).toBeInTheDocument();
  });

  /** 四段說明集中在詳情裡改，列表只顯示 —— 不必記得哪一段要去哪裡找 */
  it('列表上不能編輯，該欄沒有任何按鈕', async () => {
    await open();
    const cell = cellOf('現場狀況 / 故障描述');
    expect(cell.querySelectorAll('button, textarea, input')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /修改現場狀況/ })).not.toBeInTheDocument();
  });

  it('表頭與內容的欄位數一致', async () => {
    await open();
    expect(cells()).toHaveLength(headers().length);
  });

  it('維修時程放四個階段的日期', async () => {
    await open();
    const timeline = cellOf('維修時程 (Maint. Timeline)');
    for (const [label, date] of [['現場', '2026-09-17'], ['送修', '2026-09-18'], ['返還', '2026-09-20'], ['完工', '2026-09-23']]) {
      expect(timeline, label).toHaveTextContent(label);
      expect(timeline, date).toHaveTextContent(date);
    }
  });

  /** 打叉的就是這一行：截成一行的維修結果 */
  it('維修時程裡不放維修結果，也不放故障描述', async () => {
    await open();
    const timeline = cellOf('維修時程 (Maint. Timeline)');
    expect(timeline).not.toHaveTextContent('call Advanced RMA');
    expect(timeline).not.toHaveTextContent('主機板錯誤碼');
    expect(screen.queryByText(/call Advanced RMA/)).not.toBeInTheDocument();
  });

  it('單號不換行，也不再是連結', async () => {
    await open();
    const cell = screen.getByText('RMA-20260923-01').closest('td');
    expect(cell.style.whiteSpace).toBe('nowrap');
    expect(cell.querySelectorAll('a, button')).toHaveLength(0);
    // 開詳情的入口只有右邊那顆「檢視」
    expect(screen.getAllByRole('button', { name: /檢視/ })).toHaveLength(1);
  });
});
