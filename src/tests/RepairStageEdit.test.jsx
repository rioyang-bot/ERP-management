import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RepairOrderDetailModal from '../components/RepairOrderDetailModal';
import { queries } from '../../database/queries';

/**
 * 四個階段的說明都在「檢視」的詳情裡就地修改
 *
 * 原本只有現場狀況能改，而且是在列表上改；另外三段只能重跑那一步的動作彈窗。
 * 現在四段集中在詳情的階段卡片裡，各自一顆鉛筆 —— 不必記得哪一段要去哪裡找。
 * 列表那一欄改回純顯示。
 *
 * 四段都是描述而不是流程狀態，因此任何階段都允許更正。
 */
const ORDER = {
  id: 7,
  repair_no: 'RMA-20260921-01',
  customer_name: '元大Yuanta',
  status: 'COMPLETED',
  on_site_date: '2026-09-18',
  on_site_status: '無法開機',
  send_oem_date: '2026-09-19',
  send_oem_remarks: '黑貓單號 123456789',
  oem_return_date: '2026-09-20',
  results: '更換主機板',
  completion_date: '2026-09-21',
  completion_remarks: '已送回客戶機房',
  items: [],
};

const STAGES = [
  { name: '現場狀況／故障描述', field: 'on_site_status', query: 'updateRepairOnSiteStatus', current: '無法開機' },
  { name: '送修備註', field: 'send_oem_remarks', query: 'updateRepairSendOemRemarks', current: '黑貓單號 123456789' },
  { name: '維修與檢測結果', field: 'results', query: 'updateRepairResults', current: '更換主機板' },
  { name: '出貨備註', field: 'completion_remarks', query: 'updateRepairCompletionRemarks', current: '已送回客戶機房' },
];

describe('詳情裡修改四個階段的說明', () => {
  let calls;
  let onUpdated;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    onUpdated = vi.fn();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn((query, params) => {
        calls.push({ query, params });
        return Promise.resolve({ success: true, rows: [{ id: 7 }] });
      }),
    };
  });

  const open = (order = ORDER) => render(
    <RepairOrderDetailModal isOpen repairOrder={order} onClose={() => {}} onUpdated={onUpdated} />
  );

  const saved = (query) => calls.filter((c) => c.query === query);

  const startEditing = async (name) => {
    await userEvent.click(screen.getByRole('button', { name: `修改${name}` }));
    return screen.findByRole('textbox', { name: `修改${name}` });
  };

  it.each(STAGES)('$name 可以就地修改，帶入目前的內容', async ({ name, current }) => {
    open();
    expect(await startEditing(name)).toHaveValue(current);
  });

  it.each(STAGES)('$name 儲存後寫回自己的欄位', async ({ name, field, query }) => {
    open();
    const box = await startEditing(name);
    await userEvent.clear(box);
    await userEvent.type(box, '改過的內容');
    await userEvent.click(screen.getByRole('button', { name: `儲存${name}` }));

    await waitFor(() => expect(saved(query)).toHaveLength(1));
    expect(saved(query)[0].params).toEqual(['改過的內容', 7]);
    // 其他三個欄位一個都沒被碰到
    for (const other of STAGES.filter((st) => st.query !== query)) {
      expect(saved(other.query), other.name).toHaveLength(0);
    }
    expect(onUpdated).toHaveBeenCalledWith({ [field]: '改過的內容' });
  });

  it('沒有改動就不送出，避免留下無意義的異動紀錄', async () => {
    open();
    await startEditing('送修備註');
    await userEvent.click(screen.getByRole('button', { name: '儲存送修備註' }));

    await waitFor(() => expect(screen.queryByRole('textbox', { name: /修改送修備註/ })).not.toBeInTheDocument());
    expect(saved('updateRepairSendOemRemarks')).toHaveLength(0);
  });

  it('取消不會寫入任何東西', async () => {
    open();
    const box = await startEditing('維修與檢測結果');
    await userEvent.clear(box);
    await userEvent.type(box, '改到一半反悔');
    await userEvent.click(screen.getByRole('button', { name: '取消修改維修與檢測結果' }));

    await screen.findByRole('button', { name: '修改維修與檢測結果' });
    expect(saved('updateRepairResults')).toHaveLength(0);
  });

  it('可以清空內容', async () => {
    open();
    const box = await startEditing('出貨備註');
    await userEvent.clear(box);
    await userEvent.click(screen.getByRole('button', { name: '儲存出貨備註' }));

    await waitFor(() => expect(saved('updateRepairCompletionRemarks')).toHaveLength(1));
    expect(saved('updateRepairCompletionRemarks')[0].params[0]).toBe('');
    expect(onUpdated).toHaveBeenCalledWith({ completion_remarks: null });
  });

  it('單據已被刪除時說明原因，不會假裝成功', async () => {
    window.electronAPI.namedQuery = vi.fn((query, params) => {
      calls.push({ query, params });
      return Promise.resolve({ success: true, rows: [] });
    });
    open();
    const box = await startEditing('送修備註');
    await userEvent.clear(box);
    await userEvent.type(box, '新內容');
    await userEvent.click(screen.getByRole('button', { name: '儲存送修備註' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('找不到這張維修單')));
    expect(onUpdated).not.toHaveBeenCalled();
  });

  /** 還沒填的階段也要能先寫進去，不必等走到那一步 */
  it('還沒填的欄位一樣點得開', async () => {
    open({ ...ORDER, completion_remarks: null });
    expect(screen.getByText('尚未填寫')).toBeInTheDocument();
    expect(await startEditing('出貨備註')).toHaveValue('');
  });
});

describe('四支更新查詢都只動自己那一欄', () => {
  const OTHER_COLUMNS = ['customer_name', 'send_oem_date', 'oem_return_date', 'completion_date', 'status'];

  /** 是否有「指派給這一欄」的寫法。用賦值而非單純包含字串比對，
   *  否則 on_site_status 會被當成 status 而誤判。 */
  const assigns = (sql, col) => new RegExp(`(^|[\\s,])${col}\\s*=`, 'm').test(sql);

  it.each(STAGES)('$name：$query', ({ field, query }) => {
    const sql = queries[query];
    expect(assigns(sql, field), field).toBe(true);
    for (const col of OTHER_COLUMNS) expect(assigns(sql, col), col).toBe(false);
    // 其他三個說明欄位也不能被順手寫掉
    for (const other of STAGES.filter((st) => st.field !== field)) {
      expect(assigns(sql, other.field), other.field).toBe(false);
    }
  });

  it.each(STAGES)('$name：清空存成 NULL 而不是空字串', ({ query }) => {
    expect(queries[query]).toContain("NULLIF(TRIM($1), '')");
  });

  it.each(STAGES)('$name：回傳資料列，改不到時呼叫端才知道', ({ query }) => {
    expect(queries[query]).toContain('RETURNING');
  });

  it.each(STAGES)('$name：不限制單據階段 —— 這是描述，不是流程狀態', ({ query }) => {
    const oneLine = queries[query].split('\n').map((l) => l.trim()).join(' ');
    expect(oneLine).toContain('WHERE id = $2 RETURNING');
  });
});
