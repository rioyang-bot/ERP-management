import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InboundList from '../pages/InboundList';
import { buildSnRenameSteps, validateSnRename, isSameSn, summariseSnRename } from '../utils/snRename';

/**
 * 從進貨單上更正序號
 *
 * 進貨當下把序號打錯，先前只能到資產列表一筆一筆改，而且改了資產本身
 * 之後，進貨單、出貨單、維修單與設備的掛載清單都還留著舊序號 ——
 * 那些地方記的是序號字串，不是外來鍵。現在直接在進貨明細上更正，
 * 所有以序號記錄的地方在同一個交易裡一起改。
 */
const ORDERS = [{
  id: 11,
  order_no: 'IN-20260715-01',
  order_date: '2026-07-15',
  effective_date: '2026-07-15',
  created_at: '2026-09-18T10:30:00.000Z',
  partner_id: 7,
  partner_name: '元大Yuanta',
  invoice_no: 'INV-001',
  attachments: '[]',
}];

const ITEMS = [
  { id: 501, sn: 'U5M16V560125', quantity: 1, brand: 'DELL', model: 'R760', specification: '', category_name: '設備', po_order_no: null },
  { id: 502, sn: null, quantity: 3, brand: 'DELL', model: 'CABLE', specification: '', category_name: '耗材', po_order_no: null },
];

describe('進貨單明細：更正序號', () => {
  const namedQuery = vi.fn();
  const runTransaction = vi.fn();
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchInboundList') return Promise.resolve({ success: true, rows: ORDERS });
      if (query === 'fetchSuppliers') return Promise.resolve({ success: true, rows: [{ id: 7, name: '元大Yuanta' }] });
      if (query === 'fetchInboundItems') return Promise.resolve({ success: true, rows: ITEMS });
      return Promise.resolve({ success: true, rows: [] });
    });
    runTransaction.mockResolvedValue({ success: true, results: { asset: { rowCount: 1 }, inbound: { rowCount: 1 } } });
    window.electronAPI = {
      namedQuery,
      runTransaction,
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  /** 打開進貨明細，按下那一筆的更正序號 */
  const startEditingSn = async () => {
    render(<MemoryRouter><InboundList /></MemoryRouter>);
    await userEvent.click(await screen.findByLabelText('查看進貨明細'));
    await userEvent.click(await screen.findByRole('button', { name: '更正序號 U5M16V560125' }));
    return screen.findByRole('textbox', { name: '更正序號 U5M16V560125' });
  };

  const renameTo = async (newSn) => {
    const input = await startEditingSn();
    await userEvent.clear(input);
    await userEvent.type(input, newSn);
    await userEvent.click(screen.getByRole('button', { name: '儲存序號' }));
  };

  it('沒有序號的那一筆不會出現更正入口', async () => {
    render(<MemoryRouter><InboundList /></MemoryRouter>);
    await userEvent.click(await screen.findByLabelText('查看進貨明細'));
    await screen.findByText('U5M16V560125');

    expect(screen.getAllByRole('button', { name: /^更正序號/ })).toHaveLength(1);
  });

  it('更正後，資產與所有相關單據在同一個交易裡一起改', async () => {
    await renameTo('U5M16V560126');

    await waitFor(() => expect(runTransaction).toHaveBeenCalledTimes(1));
    const steps = runTransaction.mock.calls[0][0];
    expect(steps.map((s) => s.queryName)).toEqual([
      'assertAssetSnFree',
      'renameAssetSn',
      'updateMountedHardwareServerSn',
      'renameMountedHwSnOnDevices',
      'updateInboundItemsSn',
      'updateOutboundItemsSn',
      'updateRepairItemsSn',
    ]);
    steps.slice(1).forEach((s) => expect(s.params).toEqual(['U5M16V560126', 'U5M16V560125']));
  });

  it('告訴使用者實際改了哪些地方，不是只說成功', async () => {
    runTransaction.mockResolvedValue({ success: true, results: {
      asset: { rowCount: 1 }, devices: { rowCount: 1 }, inbound: { rowCount: 1 }, outbound: { rowCount: 2 },
    } });
    await renameTo('U5M16V560126');

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    const msg = window.alert.mock.calls.at(-1)[0];
    expect(msg).toContain('資產 1 筆');
    expect(msg).toContain('設備的硬體清單 1 筆');
    expect(msg).toContain('出貨明細 2 筆');
  });

  it('資產列表沒有這個序號時，單據照樣更正，並提醒去確認資產', async () => {
    runTransaction.mockResolvedValue({ success: true, results: { asset: { rowCount: 0 }, inbound: { rowCount: 1 } } });
    await renameTo('U5M16V560126');

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    const msg = window.alert.mock.calls.at(-1)[0];
    expect(msg).toContain('資產列表中沒有序號 [U5M16V560125]');
    expect(msg).toContain('進貨明細 1 筆');
  });

  it('交易失敗時把原因原樣告訴使用者', async () => {
    runTransaction.mockResolvedValue({ success: false, error: '序號 [X] 已經被其他資產使用，請改用別的序號；這次未做任何變更。' });
    await renameTo('U5M16V560126');

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining('已經被其他資產使用')));
    // 失敗就不要重抓明細，畫面維持原狀
    expect(calls.filter((c) => c.query === 'fetchInboundItems')).toHaveLength(1);
  });

  it('成功後重新讀取明細，畫面顯示新序號', async () => {
    await renameTo('U5M16V560126');
    await waitFor(() => expect(runTransaction).toHaveBeenCalled());

    // 存檔後會再抓一次明細（開啟詳情時一次、存檔後一次）
    await waitFor(() =>
      expect(calls.filter((c) => c.query === 'fetchInboundItems')).toHaveLength(2));
  });

  it('輸入不合法時不會送出交易', async () => {
    const input = await startEditingSn();
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: '儲存序號' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('請輸入新的序號'));
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('取消就回到唯讀狀態，什麼都不做', async () => {
    await startEditingSn();
    await userEvent.click(screen.getByRole('button', { name: '取消更正序號' }));

    await screen.findByRole('button', { name: '更正序號 U5M16V560125' });
    expect(runTransaction).not.toHaveBeenCalled();
  });
});

describe('序號更正的輸入檢查', () => {
  it.each([
    ['原本就沒有序號', '', 'A2', /無法更正/],
    ['沒填新序號', 'A1', '', /請輸入/],
    ['新舊相同', 'A1', 'a1', /相同/],
    ['含空白', 'A1', 'A 2', /空白或逗號/],
    ['含逗號', 'A1', 'A,2', /空白或逗號/],
  ])('%s 會被擋下', (_label, from, to, pattern) => {
    expect(validateSnRename(from, to)).toMatch(pattern);
  });

  it('正常的更正會放行', () => {
    expect(validateSnRename(' U5M16V560125 ', 'U5M16V560126')).toBe('');
  });

  it('大小寫與前後空白不影響是否算同一個序號', () => {
    expect(isSameSn(' u5m16v ', 'U5M16V')).toBe(true);
    expect(isSameSn('U5M16V', 'U5M16V0')).toBe(false);
  });

  it('送進交易的序號已去掉前後空白', () => {
    const steps = buildSnRenameSteps('  OLD  ', '  NEW  ');
    expect(steps.find((x) => x.id === 'asset').params).toEqual(['NEW', 'OLD']);
    expect(steps.find((x) => x.id === 'guard').params).toEqual(['NEW']);
  });
});

describe('更正結果的回報', () => {
  it('把每一步的異動筆數整理成一句話', () => {
    const { text, assetChanged } = summariseSnRename({
      asset: { rowCount: 1 }, mountedHw: { rowCount: 3 }, inbound: { rowCount: 1 },
      outbound: { rowCount: 0 }, repair: { rowCount: 0 },
    });
    expect(text).toBe('資產 1 筆、底下掛載的硬體 3 筆、進貨明細 1 筆');
    expect(assetChanged).toBe(true);
  });

  it('資產沒有異動時會標示出來', () => {
    expect(summariseSnRename({ inbound: { rowCount: 1 } }).assetChanged).toBe(false);
  });

  it('結果缺漏也不會出錯', () => {
    expect(summariseSnRename(undefined).text).toBe('沒有任何資料符合');
  });
});

describe('更正序號的護欄', () => {
  const steps = buildSnRenameSteps('OLD-1', 'NEW-1');
  const byId = (id) => steps.find((s) => s.id === id);

  it('新序號被別的資產用走時整批退回', () => {
    expect(byId('guard').queryName).toBe('assertAssetSnFree');
    expect(byId('guard').expectRows).toBe(1);
    expect(byId('guard').errorMessage).toMatch(/未做任何變更/);
  });

  it('這張單據上沒有該序號時整批退回', () => {
    expect(byId('inbound').expectRows).toBe(1);
    expect(byId('inbound').errorMessage).toMatch(/未做任何變更/);
  });

  it('資產列表沒有該序號不算失敗 —— 單據本身仍需更正', () => {
    expect(byId('asset').expectRows).toBeUndefined();
  });

  it('每一步都有 id，結果才留得住供回報', () => {
    expect(steps.every((s) => typeof s.id === 'string' && s.id)).toBe(true);
  });
});
