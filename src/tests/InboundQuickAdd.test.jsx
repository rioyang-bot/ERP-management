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
    await userEvent.click(await screen.findByTestId('open-inbound-item-modal-btn'));
    await userEvent.click(await screen.findByRole('button', { name: /快速新增品項/i }));
    return screen.findByText('快速建檔品項範本');
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
    await userEvent.click(await screen.findByTestId('open-inbound-item-modal-btn'));
    await userEvent.click(await screen.findByRole('button', { name: /快速新增品項/i }));

    await waitFor(() => expect(called('fetchExistingCards')[0].params).toEqual(['設備']));
    await waitFor(() => {
      const brands = [...container.querySelectorAll('#quickadd-brands option')].map((o) => o.value);
      expect(brands).toEqual(['SUPERMICRO', 'DELL']);
    });
  });

  it('型號建議會依已輸入的廠牌縮小範圍', async () => {
    const { container } = render(<Inbound />);
    await userEvent.click(await screen.findByTestId('open-inbound-item-modal-btn'));
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

    await waitFor(() => expect(called('insertItemMaster')).toHaveLength(1));
    // 參數順序：規格、類型、廠牌、型號、單位、類別
    expect(called('insertItemMaster')[0].params).toEqual(['', 'SERVER', 'SUPERMICRO', 'SYS-1029P', '台', '設備']);
  });

  it('四個欄位都寫進品項主檔，型號不會遺失', async () => {
    await openQuickAdd();

    await userEvent.type(screen.getByPlaceholderText('例如：SUPERMICRO'), 'SUPERMICRO');
    await userEvent.type(screen.getByPlaceholderText('例如：SERVER'), 'SERVER');
    await userEvent.type(screen.getByPlaceholderText('例如：SYS-1029P'), 'SYS-1029P');
    await userEvent.type(screen.getByPlaceholderText(/26C \/ 256G/), '26C / 256G');
    await userEvent.click(screen.getByRole('button', { name: /儲存並帶入單據/ }));

    await waitFor(() => expect(called('insertItemMaster')).toHaveLength(1));
    const [spec, type, brand, model] = called('insertItemMaster')[0].params;
    expect({ spec, type, brand, model })
      .toEqual({ spec: '26C / 256G', type: 'SERVER', brand: 'SUPERMICRO', model: 'SYS-1029P' });
  });

  it('切換類別會改讀該類別的既有值，單位也跟著換', async () => {
    await openQuickAdd();

    await userEvent.click(screen.getByRole('radio', { name: /耗材/ }));

    await waitFor(() => expect(called('fetchExistingCards').some((c) => c.params[0] === '耗材')).toBe(true));
    expect(screen.getByPlaceholderText('台 / 個 / 條').value).toBe('個');
  });
});
