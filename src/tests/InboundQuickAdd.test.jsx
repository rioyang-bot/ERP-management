import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Inbound from '../pages/Inbound';

/**
 * 進貨單的「快速建檔品項範本」
 *
 * 先前這個視窗只有一個「品項名稱」，而它其實被寫進規格欄位；
 * 廠牌與類型永遠存成空字串、型號根本沒被寫入，建出來的品項在設備／硬體列表上
 * 會變成「未知／未分類／未設定型號」。品項主檔是以廠牌＋類型＋型號＋規格
 * 識別的，欄位就該照這個結構收。
 */
const EXISTING_CARDS = [
  { brand: 'SUPERMICRO', type: 'SERVER', model: 'SYS-1029P', specification: '1U' },
  { brand: 'SUPERMICRO', type: 'SERVER', model: 'SYS-2029P', specification: '2U' },
  { brand: 'DELL', type: 'SERVER', model: 'R750', specification: '' },
];

describe('進貨單：快速建檔品項', () => {
  const namedQuery = vi.fn();
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'countInboundOrders') return Promise.resolve({ success: true, rows: [{ count: 1 }] });
      if (query === 'fetchExistingCards') return Promise.resolve({ success: true, rows: EXISTING_CARDS });
      if (query === 'insertItemMaster') return Promise.resolve({ success: true, rows: [{ id: 999 }] });
      return Promise.resolve({ success: true, rows: [] });
    });
    window.electronAPI = {
      namedQuery,
      runTransaction: vi.fn().mockResolvedValue({ success: true, results: {} }),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const called = (name) => calls.filter((c) => c.query === name);

  /** 開啟「快速建檔品項範本」視窗 */
  const openQuickAdd = async () => {
    render(<Inbound />);
    await userEvent.click(await screen.findByTestId('open-item-select-btn-1'));
    await userEvent.click(await screen.findByRole('button', { name: /快速新增品項/i }));
    return screen.findByText('快速建檔品項範本');
  };

  /**
   * 快速新增的品項改為送出整張進貨單時才建立（先前是按下「儲存並帶入單據」
   * 當下就寫進資料庫，使用者若沒送出，那筆品項仍會留在品項庫裡，
   * 庫存 0、沒有任何單據用過）。因此欄位改從送出的交易步驟檢查。
   */
  const submitAndFindMasterStep = async () => {
    await userEvent.click(screen.getByRole('button', { name: /建立進貨單/ }));
    await waitFor(() => expect(window.electronAPI.runTransaction).toHaveBeenCalled());
    const steps = window.electronAPI.runTransaction.mock.calls.at(-1)[0];
    return steps.find((st) => st.queryName === 'insertItemMaster');
  };

  it('收的是廠牌、類型、型號、規格，不是一個籠統的品項名稱', async () => {
    await openQuickAdd();

    expect(screen.getByText(/廠牌 \(Brand\)/)).toBeInTheDocument();
    expect(screen.getByText(/類型 \(Type\)/)).toBeInTheDocument();
    expect(screen.getByText(/型號 \(Model\)/)).toBeInTheDocument();
    expect(screen.getByText(/規格 \(Spec\)/)).toBeInTheDocument();
    // 原本那個意義不明的欄位已經不在了
    expect(screen.queryByText('品項名稱 *')).not.toBeInTheDocument();
  });

  it('說明品項是以四個欄位一起識別的', async () => {
    await openQuickAdd();
    expect(screen.getByText(/廠牌＋類型＋型號＋規格/)).toBeInTheDocument();
  });

  it('載入該類別既有的值當作輸入建議', async () => {
    const { container } = render(<Inbound />);
    await userEvent.click(await screen.findByTestId('open-item-select-btn-1'));
    await userEvent.click(await screen.findByRole('button', { name: /快速新增品項/i }));

    await waitFor(() => expect(called('fetchExistingCards')[0].params).toEqual(['設備']));
    await waitFor(() => {
      const brands = [...container.querySelectorAll('#quickadd-brands option')].map((o) => o.value);
      expect(brands).toEqual(['SUPERMICRO', 'DELL']);
    });
  });

  it('型號建議會依已輸入的廠牌縮小範圍', async () => {
    const { container } = render(<Inbound />);
    await userEvent.click(await screen.findByTestId('open-item-select-btn-1'));
    await userEvent.click(await screen.findByRole('button', { name: /快速新增品項/i }));
    await screen.findByText('快速建檔品項範本');

    await userEvent.type(screen.getByPlaceholderText('例如：SUPERMICRO'), 'DELL');

    await waitFor(() => {
      const models = [...container.querySelectorAll('#quickadd-models option')].map((o) => o.value);
      expect(models).toEqual(['R750']);
    });
  });

  it('廠牌、類型、型號缺一就不建立', async () => {
    await openQuickAdd();

    await userEvent.click(screen.getByRole('button', { name: /儲存並帶入單據/ }));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('廠牌'));
    expect(called('insertItemMaster')).toHaveLength(0);

    await userEvent.type(screen.getByPlaceholderText('例如：SUPERMICRO'), 'SUPERMICRO');
    await userEvent.click(screen.getByRole('button', { name: /儲存並帶入單據/ }));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('類型'));

    await userEvent.type(screen.getByPlaceholderText('例如：SERVER'), 'SERVER');
    await userEvent.click(screen.getByRole('button', { name: /儲存並帶入單據/ }));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('型號'));
    expect(called('insertItemMaster')).toHaveLength(0);
  });

  it('規格是選填，不填也建得起來', async () => {
    await openQuickAdd();

    await userEvent.type(screen.getByPlaceholderText('例如：SUPERMICRO'), 'SUPERMICRO');
    await userEvent.type(screen.getByPlaceholderText('例如：SERVER'), 'SERVER');
    await userEvent.type(screen.getByPlaceholderText('例如：SYS-1029P'), 'SYS-1029P');
    await userEvent.click(screen.getByRole('button', { name: /儲存並帶入單據/ }));

    // 按下「儲存並帶入單據」的當下不該碰資料庫
    expect(called('insertItemMaster')).toHaveLength(0);

    const step = await submitAndFindMasterStep();
    // 參數順序：規格、類型、廠牌、型號、單位、類別
    expect(step.params).toEqual(['', 'SERVER', 'SUPERMICRO', 'SYS-1029P', '台', '設備']);
  });

  /**
   * 列上要看得到類型、廠牌、型號、規格，才能確認打得對不對。
   * 先前只顯示廠牌＋型號；快速新增的暫存品項規格存在 spec、畫面讀 specification，
   * 規格永遠空白，「送出後才建立」的標籤擠到第二行，看起來就像把規格蓋掉了。
   */
  it('快速新增後，列上看得到類型、廠牌、型號與規格，標籤另起一行', async () => {
    await openQuickAdd();
    await userEvent.type(screen.getByPlaceholderText('例如：SUPERMICRO'), '光景資訊');
    await userEvent.type(screen.getByPlaceholderText('例如：SERVER'), 'NVMe SSD');
    await userEvent.type(screen.getByPlaceholderText('例如：SYS-1029P'), 'N-29NVMS');
    await userEvent.type(screen.getByPlaceholderText(/26C \/ 256G/), '2TB U.2');
    await userEvent.click(screen.getByRole('button', { name: /儲存並帶入單據/ }));

    const cell = await screen.findByTestId('inbound-item-1');
    const lines = [...cell.children].map((el) => el.textContent);
    expect(lines[0]).toContain('NVMe SSD');
    expect(lines[0]).toContain('光景資訊 N-29NVMS');
    expect(lines[1]).toBe('2TB U.2');
    expect(lines[2]).toContain('送出後才建立');
    expect(cell.title).toBe('NVMe SSD / 光景資訊 / N-29NVMS / 2TB U.2');
  });

  it('沒填規格時明講「未填規格」，不留白', async () => {
    await openQuickAdd();
    await userEvent.type(screen.getByPlaceholderText('例如：SUPERMICRO'), 'SUPERMICRO');
    await userEvent.type(screen.getByPlaceholderText('例如：SERVER'), 'SERVER');
    await userEvent.type(screen.getByPlaceholderText('例如：SYS-1029P'), 'SYS-1029P');
    await userEvent.click(screen.getByRole('button', { name: /儲存並帶入單據/ }));

    const cell = await screen.findByTestId('inbound-item-1');
    expect(cell.children[1].textContent).toBe('未填規格');
  });

  it('四個欄位都寫進品項主檔，型號不會遺失', async () => {
    await openQuickAdd();

    await userEvent.type(screen.getByPlaceholderText('例如：SUPERMICRO'), 'SUPERMICRO');
    await userEvent.type(screen.getByPlaceholderText('例如：SERVER'), 'SERVER');
    await userEvent.type(screen.getByPlaceholderText('例如：SYS-1029P'), 'SYS-1029P');
    await userEvent.type(screen.getByPlaceholderText(/26C \/ 256G/), '26C / 256G');
    await userEvent.click(screen.getByRole('button', { name: /儲存並帶入單據/ }));

    expect(called('insertItemMaster')).toHaveLength(0);

    const step = await submitAndFindMasterStep();
    const [spec, type, brand, model] = step.params;
    expect({ spec, type, brand, model })
      .toEqual({ spec: '26C / 256G', type: 'SERVER', brand: 'SUPERMICRO', model: 'SYS-1029P' });
  });

  /**
   * 這正是要修掉的狀況：使用者快速新增了品項，然後改變主意關掉頁面。
   * 舊行為會在品項庫留下一筆沒人用過的幽靈主檔。
   */
  it('快速新增後放棄送出，資料庫不會多出品項', async () => {
    await openQuickAdd();

    await userEvent.type(screen.getByPlaceholderText('例如：SUPERMICRO'), 'SUPERMICRO');
    await userEvent.type(screen.getByPlaceholderText('例如：SERVER'), 'SERVER');
    await userEvent.type(screen.getByPlaceholderText('例如：SYS-1029P'), 'SYS-1029P');
    await userEvent.click(screen.getByRole('button', { name: /儲存並帶入單據/ }));

    await waitFor(() => expect(screen.queryByText('快速建檔品項範本')).not.toBeInTheDocument());
    expect(called('insertItemMaster')).toHaveLength(0);
    expect(window.electronAPI.runTransaction).not.toHaveBeenCalled();
  });

  /**
   * 從「從品項庫挑選」進來時沒有指定是哪一列。舊行為靠的是建檔後品項庫會多出
   * 這筆、使用者再挑一次；不先建檔以後就得直接把它放到單據上，否則使用者
   * 填完欄位按下儲存，畫面上卻什麼都沒發生。
   */
  it('沒有指定列時，快速新增的品項會落在單據的明細列上', async () => {
    await openQuickAdd();

    await userEvent.type(screen.getByPlaceholderText('例如：SUPERMICRO'), 'SUPERMICRO');
    await userEvent.type(screen.getByPlaceholderText('例如：SERVER'), 'SERVER');
    await userEvent.type(screen.getByPlaceholderText('例如：SYS-1029P'), 'SYS-1029P');
    await userEvent.click(screen.getByRole('button', { name: /儲存並帶入單據/ }));

    // 明細列上看得到它，並標明還沒建立
    expect(await screen.findByText(/送出後才建立/)).toBeInTheDocument();
    expect(screen.getByText(/SYS-1029P/)).toBeInTheDocument();

    const step = await submitAndFindMasterStep();
    expect(step).toBeTruthy();
  });

  it('切換類別會改讀該類別的既有值', async () => {
    await openQuickAdd();

    await userEvent.click(screen.getByRole('radio', { name: /耗材/ }));

    await waitFor(() => expect(called('fetchExistingCards').some((c) => c.params[0] === '耗材')).toBe(true));
  });

  it('不必填單位，依類別自動帶入', async () => {
    await openQuickAdd();
    // 單位由類別決定，畫面上不出現這個欄位
    expect(screen.queryByText(/單位 (Unit)/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /耗材/ }));
    await userEvent.type(screen.getByPlaceholderText('例如：SUPERMICRO'), 'METECH');
    await userEvent.type(screen.getByPlaceholderText('例如：SERVER'), '光纖線');
    await userEvent.type(screen.getByPlaceholderText('例如：SYS-1029P'), 'LC-LC-OM4-3M');
    await userEvent.click(screen.getByRole('button', { name: /儲存並帶入單據/ }));

    const step = await submitAndFindMasterStep();
    // 耗材論個、設備論台
    expect(step.params[4]).toBe('個');
  });
});
