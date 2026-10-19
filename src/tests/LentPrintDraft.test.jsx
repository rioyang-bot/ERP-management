import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LentOrderPrintModal from '../components/LentOrderPrintModal';
import { toDraft, fromDraft, sameForm, changedFields } from '../utils/lentPrintDraft';
import { prepareQueryParams } from '../../server/queryParams';
import { queries } from '../../database/queries';

/**
 * 借貨申請單預覽：修改後儲存
 *
 * 先前預覽裡改完沒有地方存，關閉再打開就恢復原樣。
 * 現在存回這張借用單（outbound_requests.print_draft），打開時套用在預設內容之上。
 */

const DN = {
  id: 101, request_no: 'DN-20260829-01', customer: '富邦證券', location: '台北市仁愛路',
  contact_info: 'David Chen (0918-600-800)', shipping_date: '2026-08-29', expected_return_date: '2026-09-05', request_type: 'LEND',
};
const ITEMS = [{ brand: 'Supermicro', model: 'SYS-1029P', sn: 'SMC001', quantity: 1, specification: '1U' }];

describe('lentPrintDraft', () => {
  it('只存指定的欄位，讀回來一樣', () => {
    const draft = toDraft({ custPerson: '王小明', termsList: ['a'], junk: 1 });
    expect(draft.version).toBe(1);
    expect(draft.form).toEqual({ custPerson: '王小明', termsList: ['a'] });
    expect(fromDraft(draft)).toEqual({ custPerson: '王小明', termsList: ['a'] });
    expect(fromDraft(JSON.stringify(draft))).toEqual({ custPerson: '王小明', termsList: ['a'] });
  });
  it('格式不對就當沒存過', () => {
    expect(fromDraft(null)).toBeNull();
    expect(fromDraft('not json')).toBeNull();
    expect(fromDraft({ form: { tableRows: 'x', custPerson: 'A' } })).toEqual({ custPerson: 'A' });
  });
  it('太大的 LOGO 不存', () => {
    expect(toDraft({ customLogo: 'x'.repeat(2 * 1024 * 1024) }).form.customLogo).toBeNull();
  });
  it('比較與變更欄位', () => {
    expect(sameForm({ a: 1, custPerson: 'A' }, { custPerson: 'A' })).toBe(true);
    expect(changedFields({ custPerson: 'A', termsList: ['x'] }, { custPerson: 'B', termsList: ['x'] })).toEqual(['custPerson']);
  });
  it('以物件傳給伺服器：注意事項裡的括號、驚嘆號不會被參數過濾刪掉', () => {
    const draft = toDraft({ termsList: ['借貨人及收貨人務必蓋公司章 (不接受收發章)!!'] });
    const [json] = prepareQueryParams([draft, 101], queries.saveLentPrintDraft, 'saveLentPrintDraft');
    expect(JSON.parse(json).form.termsList[0]).toBe('借貨人及收貨人務必蓋公司章 (不接受收發章)!!');
    expect(queries.saveLentPrintDraft).toContain('print_draft = $1::jsonb');
  });
});

describe('借貨申請單預覽：儲存修改', () => {
  let saved;
  beforeEach(() => {
    vi.clearAllMocks();
    saved = null;
    window.confirm = vi.fn(() => true);
    window.alert = vi.fn();
    window.electronAPI.namedQuery.mockImplementation(async (q, p) => {
      if (q === 'fetchLentPrintDraft') return { success: true, rows: [{ print_draft: saved }] };
      if (q === 'saveLentPrintDraft') { saved = p[0]; return { success: true, rows: [{ id: p[1] }] }; }
      if (q === 'clearLentPrintDraft') { saved = null; return { success: true, rows: [{ id: p[0] }] }; }
      return { success: true, rows: [] };
    });
  });

  const calls = (q) => window.electronAPI.namedQuery.mock.calls.filter(([n]) => n === q).map(([, p]) => p);
  const auditLogs = () => calls('insertAuditLog').map((p) => ({ module: p[4], target: p[6], summary: p[8], details: p[9] }));

  const open = async () => {
    const onClose = vi.fn();
    const before = calls('fetchLentPrintDraft').length;
    const utils = render(<LentOrderPrintModal isOpen onClose={onClose} dnData={DN} items={ITEMS} />);
    await waitFor(() => expect(calls('fetchLentPrintDraft').slice(before)).toEqual([[101]]));
    return { ...utils, onClose };
  };

  const editContactPerson = async (container, value) => {
    await userEvent.click(screen.getByText('✏️ 進入即時編輯模式'));
    const input = [...container.querySelectorAll('.loan-edit-input')].find((el) => el.value === 'David Chen');
    await userEvent.clear(input);
    await userEvent.type(input, value);
  };

  it('沒改過：儲存鈕不能按', async () => {
    await open();
    await waitFor(() => expect(screen.getByRole('button', { name: /儲存/ })).toBeDisabled());
  });

  it('改過就能儲存：存回這張借用單、寫事件紀錄，關閉再打開仍保留', async () => {
    const { container, unmount } = await open();
    await editContactPerson(container, '王小明');
    expect(screen.getByText('● 有未儲存的修改')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^儲存$/ }));
    await waitFor(() => expect(calls('saveLentPrintDraft')).toHaveLength(1));
    const [draft, id] = calls('saveLentPrintDraft')[0];
    expect(id).toBe(101);
    expect(draft.form.custPerson).toBe('王小明');
    expect(await screen.findByText('已儲存')).toBeInTheDocument();
    // 存完回到鎖定狀態
    expect(screen.getByText('✏️ 進入即時編輯模式')).toBeInTheDocument();

    const log = auditLogs().find((l) => l.module === 'LENT');
    expect(log).toMatchObject({ target: 'DN-20260829-01', summary: '儲存借貨申請單 [DN-20260829-01] 的修改：客戶聯絡人' });
    expect(log.details).toMatchObject({ dnId: 101, changed: ['custPerson'] });

    // 關閉再打開：照存過的顯示
    unmount();
    await open();
    expect(await screen.findByText('王小明')).toBeInTheDocument();
    expect(screen.queryByText('David Chen')).not.toBeInTheDocument();
    expect(screen.getByText('已儲存')).toBeInTheDocument();
  });

  it('存過的內容以它為準，不會被客戶主檔蓋掉', async () => {
    saved = toDraft({ custPerson: '王小明', custPhone: '02-1234', dealerName: '經銷商甲' });
    window.electronAPI.namedQuery.mockImplementation(async (q) => {
      if (q === 'fetchCustomers') return { success: true, rows: [{ id: 1, name: '富邦證券', contact: '主檔聯絡人', phone: '0999', address: '主檔地址' }] };
      if (q === 'fetchLentPrintDraft') return { success: true, rows: [{ print_draft: saved }] };
      return { success: true, rows: [] };
    });
    await open();
    expect(await screen.findByText('王小明')).toBeInTheDocument();
    expect(screen.getByText('02-1234')).toBeInTheDocument();
    expect(screen.getByText('經銷商甲')).toBeInTheDocument();
    // 沒存的欄位照主檔補
    expect(screen.getByText('主檔地址')).toBeInTheDocument();
    expect(screen.queryByText('主檔聯絡人')).not.toBeInTheDocument();
  });

  it('有未儲存的修改，關閉前先問；取消就不關', async () => {
    const { container, onClose } = await open();
    await editContactPerson(container, '王小明');
    window.confirm = vi.fn(() => false);
    await userEvent.click(screen.getByRole('button', { name: /關閉/ }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('未儲存的修改'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('沒有修改就直接關閉，不問', async () => {
    const { onClose } = await open();
    window.confirm = vi.fn(() => true);
    await userEvent.click(screen.getByRole('button', { name: /關閉/ }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('還原預設：清掉存過的、回到依借用單產生的內容，並寫事件紀錄', async () => {
    saved = toDraft({ custPerson: '王小明' });
    await open();
    expect(await screen.findByText('王小明')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /還原預設/ }));
    await waitFor(() => expect(calls('clearLentPrintDraft')).toEqual([[101]]));
    expect(await screen.findByText('David Chen')).toBeInTheDocument();
    expect(auditLogs().find((l) => l.module === 'LENT').summary).toBe('借貨申請單 [DN-20260829-01] 還原為預設內容');
    const toolbar = screen.getByText('借貨申請單預覽').closest('.loan-toolbar-row');
    expect(within(toolbar).getByRole('button', { name: /還原預設/ })).toBeDisabled();
  });
});
