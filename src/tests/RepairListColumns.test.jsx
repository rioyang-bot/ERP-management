import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RepairList from '../pages/RepairList';

/**
 * 維修單列表的欄位
 *
 * 原本現場處理日、現場狀況／故障描述、送修與完工資訊各佔一欄，表格橫向被撐得很寬，
 * 描述又長到把整列的高度拉高。三欄併成一欄「維修時程」，只放四個階段的日期；
 * 描述與維修結果留在「檢視」的詳情裡。
 *
 * 單號也不再是連結 —— 同一列右邊就有「檢視」，兩個一樣的入口只是噪音，
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

  it('三個欄位併成「維修時程」', async () => {
    await open();
    expect(headers()).toContain('維修時程 (Maint. Timeline)');
    expect(headers()).not.toContain('現場處理日 (On-site)');
    expect(headers()).not.toContain('現場狀況 / 故障描述');
    expect(headers()).not.toContain('送修與完工資訊 (OEM & Shipping)');
  });

  it('表頭與內容的欄位數一致', async () => {
    await open();
    const cells = screen.getByText('RMA-20260923-01').closest('tr').querySelectorAll('td');
    expect(cells).toHaveLength(headers().length);
  });

  it('維修時程放四個階段的日期', async () => {
    await open();
    const cell = [...screen.getByText('RMA-20260923-01').closest('tr').querySelectorAll('td')][3];
    for (const [label, date] of [['現場', '2026-09-17'], ['送修', '2026-09-18'], ['返還', '2026-09-20'], ['完工', '2026-09-23']]) {
      expect(cell, label).toHaveTextContent(label);
      expect(cell, date).toHaveTextContent(date);
    }
  });

  it('表格上不再印故障描述與維修結果', async () => {
    await open();
    expect(screen.queryByText(/主機板錯誤碼 552/)).not.toBeInTheDocument();
    expect(screen.queryByText(/call Advanced RMA/)).not.toBeInTheDocument();
  });

  /** 內容不顯示了，但先前做的「列表上直接改」不能跟著消失 */
  it('故障描述仍然改得動', async () => {
    await open();
    expect(screen.getByRole('button', { name: /修改現場狀況/ })).toBeInTheDocument();
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
