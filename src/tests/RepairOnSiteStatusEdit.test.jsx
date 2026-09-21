import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RepairList from '../pages/RepairList';
import { queries } from '../../database/queries';

/**
 * 現場狀況／故障描述可以直接在列表上修改
 *
 * 這一欄先前只能在建單時填寫，之後就改不了 —— 打錯字、或現場回報有更新，
 * 都只能重建一張單。updateRepairOrderDetails 這支查詢雖然存在，
 * 但從來沒有任何畫面呼叫過它。
 */
const ORDER = {
  id: 7, repair_no: 'RMA-20260921-01', customer_name: '元大Yuanta',
  status: 'ON_SITE_HANDLING', on_site_status: '無法開機', no_oem_required: false,
  item_count: 1, items: [{ id: 1, sn: 'SRV-001' }], created_at: '2026-09-21T00:00:00.000Z',
};

describe('維修單列表：修改現場狀況', () => {
  const namedQuery = vi.fn();
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchRepairOrders') return Promise.resolve({ success: true, rows: [ORDER] });
      if (query === 'updateRepairOnSiteStatus') return Promise.resolve({ success: true, rows: [{ id: 7 }] });
      return Promise.resolve({ success: true, rows: [] });
    });
    window.electronAPI = {
      namedQuery, runTransaction: vi.fn(), saveFile: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const saved = () => calls.filter((c) => c.query === 'updateRepairOnSiteStatus');

  const startEditing = async () => {
    render(<MemoryRouter><RepairList /></MemoryRouter>);
    await screen.findByText('RMA-20260921-01');
    await userEvent.click(screen.getByRole('button', { name: /修改現場狀況/ }));
    return screen.findByRole('textbox', { name: /修改現場狀況/ });
  };

  it('點鉛筆可以編輯，帶入目前的描述', async () => {
    const box = await startEditing();
    expect(box).toHaveValue('無法開機');
  });

  it('儲存後寫回資料庫', async () => {
    const box = await startEditing();
    await userEvent.clear(box);
    await userEvent.type(box, '電源供應器故障，已更換');
    await userEvent.click(screen.getByRole('button', { name: '儲存現場狀況' }));

    await waitFor(() => expect(saved()).toHaveLength(1));
    expect(saved()[0].params).toEqual(['電源供應器故障，已更換', 7]);
  });

  it('沒有改動就不送出，避免留下無意義的異動紀錄', async () => {
    await startEditing();
    await userEvent.click(screen.getByRole('button', { name: '儲存現場狀況' }));

    await waitFor(() => expect(screen.queryByRole('textbox', { name: /修改現場狀況/ })).not.toBeInTheDocument());
    expect(saved()).toHaveLength(0);
  });

  it('取消不會寫入任何東西', async () => {
    const box = await startEditing();
    await userEvent.clear(box);
    await userEvent.type(box, '改到一半反悔');
    await userEvent.click(screen.getByRole('button', { name: '取消修改現場狀況' }));

    await screen.findByRole('button', { name: /修改現場狀況/ });
    expect(saved()).toHaveLength(0);
  });

  it('可以清空描述', async () => {
    const box = await startEditing();
    await userEvent.clear(box);
    await userEvent.click(screen.getByRole('button', { name: '儲存現場狀況' }));

    await waitFor(() => expect(saved()).toHaveLength(1));
    expect(saved()[0].params[0]).toBe('');
  });

  it('單據已被刪除時說明原因，不會假裝成功', async () => {
    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchRepairOrders') return Promise.resolve({ success: true, rows: [ORDER] });
      if (query === 'updateRepairOnSiteStatus') return Promise.resolve({ success: true, rows: [] });
      return Promise.resolve({ success: true, rows: [] });
    });
    const box = await startEditing();
    await userEvent.clear(box);
    await userEvent.type(box, '新描述');
    await userEvent.click(screen.getByRole('button', { name: '儲存現場狀況' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('找不到這張維修單')));
  });
});

describe('現場狀況的更新查詢', () => {
  const sql = queries.updateRepairOnSiteStatus;

  it('只動 on_site_status 一欄', () => {
    expect(sql).toContain('SET on_site_status');
    ['customer_name', 'send_oem_date', 'oem_return_date', 'results', 'completion_date']
      .forEach((col) => expect(sql).not.toContain(col));
  });

  it('清空存成 NULL，而不是空字串', () => {
    expect(sql).toContain("NULLIF(TRIM($1), '')");
  });

  it('回傳資料列，改不到時呼叫端才知道', () => {
    expect(sql).toContain('RETURNING');
  });

  it('不限制單據階段 —— 這是描述，不是流程狀態', () => {
    // 條件只有 id：不會因為單據已送修或已結案就不給改
    const oneLine = sql.split('\n').map((l) => l.trim()).join(' ');
    expect(oneLine).toContain('WHERE id = $2 RETURNING');
  });
});
