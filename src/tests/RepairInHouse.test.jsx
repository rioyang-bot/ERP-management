import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RepairActionModal from '../components/RepairActionModal';
import { queries } from '../../database/queries';

/**
 * 不需送回原廠：由 IT 自行修復後結案
 *
 * 維修流程原本固定是 現場處理 → 送修原廠 → 原廠返還 → 完工出貨，
 * IT 自行排除故障的單沒有路可走，只能卡在第一階段。
 * 現在可以把單標記為「不需送回原廠」，填寫維修結果後一步結案出貨。
 */
const ORDER = {
  id: 7,
  repair_no: 'RMA-20260918-01',
  customer_name: '元大Yuanta',
  status: 'ON_SITE_HANDLING',
  no_oem_required: true,
  items: [{ id: 1, sn: 'SRV-001', brand: 'DELL', model: 'R760' }],
};

describe('自行維修完工彈窗', () => {
  const namedQuery = vi.fn();
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'updateRepairCompletedInHouse') {
        return Promise.resolve({ success: true, rows: [{ id: 7, status: 'COMPLETED' }] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
    window.electronAPI = { namedQuery, runTransaction: vi.fn(), saveFile: vi.fn() };
  });

  const called = (name) => calls.filter((c) => c.query === name);
  const open = (order = ORDER) => render(
    <RepairActionModal isOpen onClose={() => {}} repairOrder={order}
      actionType="IN_HOUSE_COMPLETE" onSuccess={() => {}} />
  );
  const submit = () => userEvent.click(screen.getByRole('button', { name: /確認自行維修完工/ }));

  it('標題與送出按鈕講明這是不送原廠的結案', async () => {
    open();
    expect(await screen.findByText(/自行維修完工結案/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /設為出庫/ })).toBeInTheDocument();
  });

  it('沒填維修結果不讓結案 —— 自行維修沒有原廠報告，這是唯一的處理紀錄', async () => {
    open();
    const results = await screen.findByPlaceholderText(/重新插拔記憶體/);
    // 欄位本身是必填，表單驗證就會擋下，送不出去
    expect(results).toBeRequired();

    await submit();
    expect(called('updateRepairCompletedInHouse')).toHaveLength(0);
    expect(called('updateAssetStatusBySn')).toHaveLength(0);
  });

  it('只填空白也不算數', async () => {
    open();
    await userEvent.type(await screen.findByPlaceholderText(/重新插拔記憶體/), '   ');
    await submit();

    expect(await screen.findByText(/請填寫維修結果/)).toBeInTheDocument();
    expect(called('updateRepairCompletedInHouse')).toHaveLength(0);
  });

  it('填寫維修結果後一步結案，並把設備設為出庫', async () => {
    open();
    await userEvent.type(await screen.findByPlaceholderText(/重新插拔記憶體/), '更換記憶體模組後正常');
    await submit();

    await waitFor(() => expect(called('updateRepairCompletedInHouse')).toHaveLength(1));
    const [date, results, , id] = called('updateRepairCompletedInHouse')[0].params;
    expect(results).toBe('更換記憶體模組後正常');
    expect(id).toBe(7);
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await waitFor(() => expect(called('updateAssetStatusBySn')).toHaveLength(1));
    expect(called('updateAssetStatusBySn')[0].params).toEqual(['SHIPPED', 'SRV-001']);
  });

  it('不會經過送修原廠與原廠返還', async () => {
    open();
    await userEvent.type(await screen.findByPlaceholderText(/重新插拔記憶體/), '設定調整');
    await submit();

    await waitFor(() => expect(called('updateRepairCompletedInHouse')).toHaveLength(1));
    expect(called('updateRepairSendOEM')).toHaveLength(0);
    expect(called('updateRepairOEMReturn')).toHaveLength(0);
  });

  it('單據狀態已被別人改過時明確擋下，不會動到設備狀態', async () => {
    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      // 條件不成立，資料庫回 0 筆
      if (query === 'updateRepairCompletedInHouse') return Promise.resolve({ success: true, rows: [] });
      return Promise.resolve({ success: true, rows: [] });
    });
    open();
    await userEvent.type(await screen.findByPlaceholderText(/重新插拔記憶體/), '測試');
    await submit();

    expect(await screen.findByText(/已不在「現場處理」階段/)).toBeInTheDocument();
    expect(called('updateAssetStatusBySn')).toHaveLength(0);
  });

  it('常用結果是 IT 自行維修的敘述，不是原廠的', async () => {
    open();
    expect(await screen.findByRole('button', { name: /重新插拔/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /原廠修復寄回/ })).not.toBeInTheDocument();
  });
});

describe('自行維修結案的資料庫護欄', () => {
  it('只有還在現場處理階段才能改送修方式', () => {
    expect(queries.setRepairNoOemRequired).toContain("status = 'ON_SITE_HANDLING'");
    expect(queries.setRepairNoOemRequired).toContain('RETURNING');
  });

  it('結案時同時檢查階段與標記，重複送出不會再結一次', () => {
    const sql = queries.updateRepairCompletedInHouse;
    expect(sql).toContain("status = 'ON_SITE_HANDLING'");
    expect(sql).toContain('no_oem_required = TRUE');
    expect(sql).toContain('RETURNING');
  });

  it('一步結案不會寫入原廠日期', () => {
    const sql = queries.updateRepairCompletedInHouse;
    expect(sql).not.toContain('send_oem_date');
    expect(sql).not.toContain('oem_return_date');
  });
});

/**
 * 操作欄的按鈕排版
 *
 * 按鈕沒有 nowrap，「不需送回原廠」六個字被折成三行，整列高度被撐開，
 * 每顆按鈕高度還不一樣。加上「自行維修完工」之後這一欄更擠。
 */
describe('維修單列表的操作按鈕', () => {
  const ORDERS = [{
    id: 7, repair_no: 'RMA-20260921-01', customer_name: '元大Yuanta',
    status: 'ON_SITE_HANDLING', no_oem_required: false, item_count: 1,
    items: [{ id: 1, sn: 'SRV-001' }], created_at: '2026-09-21T00:00:00.000Z',
  }];

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn((query) =>
        Promise.resolve({ success: true, rows: query === 'fetchRepairOrders' ? ORDERS : [] })),
      runTransaction: vi.fn(),
      saveFile: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const showList = async () => {
    const { default: RepairList } = await import('../pages/RepairList');
    const { MemoryRouter } = await import('react-router-dom');
    render(<MemoryRouter><RepairList /></MemoryRouter>);
    await screen.findByText('RMA-20260921-01');
  };

  /** 操作欄是該列的最後一格；其他欄位也有按鈕（例如現場狀況的編輯鈕） */
  const actionCell = () => {
    const cells = screen.getByText('RMA-20260921-01').closest('tr').querySelectorAll('td');
    return cells[cells.length - 1];
  };

  it('每一顆操作按鈕都不折行', async () => {
    await showList();
    const buttons = [...actionCell().querySelectorAll('button')];

    expect(buttons.length).toBeGreaterThan(2);
    buttons.forEach((b) => expect(b).toHaveStyle({ whiteSpace: 'nowrap' }));
  });

  it('按鈕文字縮短，完整說明留在 title', async () => {
    await showList();
    const btn = screen.getByRole('button', { name: /免送原廠/ });

    expect(btn.textContent.trim()).toBe('免送原廠');
    expect(btn.getAttribute('title')).toMatch(/不需送回原廠/);
  });

  it('標記之後文字改為恢復送原廠', async () => {
    window.electronAPI.namedQuery = vi.fn((query) =>
      Promise.resolve({
        success: true,
        rows: query === 'fetchRepairOrders' ? [{ ...ORDERS[0], no_oem_required: true }] : [],
      }));
    await showList();

    expect(screen.getByRole('button', { name: /恢復送原廠/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /送修原廠$/ })).not.toBeInTheDocument();
  });

  it('空間不足時整顆按鈕換行，不會把字拆開', async () => {
    await showList();
    const container = actionCell().querySelector('button').parentElement;

    expect(container).toHaveStyle({ flexWrap: 'wrap' });
  });
});
