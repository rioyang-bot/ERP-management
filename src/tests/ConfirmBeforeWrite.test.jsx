import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDictionaryEntry } from '../utils/masterDictionary';
import { deleteItemType } from '../utils/deleteItemType';
import Partners from '../pages/Partners';
import PurchaseItemSelectModal from '../components/PurchaseItemSelectModal';
import InboundItemSelectModal from '../components/InboundItemSelectModal';
import DNList from '../pages/DNList';
import { MemoryRouter } from 'react-router-dom';

/**
 * 點一下就寫進資料庫的動作，一律要先問過
 *
 * 盤點時找出九組「按下去當下就生效」的動作：切換鈕、離開欄位、選完檔案、按 ＋。
 * 它們的共同問題是使用者按錯了也回不來，而畫面上看起來只是點了一下。
 */

describe('新增廠牌／類型／型號要先問過', () => {
  const api = { namedQuery: vi.fn(async () => ({ success: true, rows: [{ id: 1 }] })) };

  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = { namedQuery: vi.fn(async () => ({ success: true, rows: [] })) };
  });

  it('沒有按下確定就不寫進資料庫', async () => {
    const res = await addDictionaryEntry(api, {
      kind: 'BRAND', category: '設備', name: 'SUPERMICRO', confirm: () => false,
    });

    expect(res.cancelled).toBe(true);
    expect(api.namedQuery).not.toHaveBeenCalled();
  });

  it('確定之後才寫入，並留下事件紀錄', async () => {
    const res = await addDictionaryEntry(api, {
      kind: 'TYPE', category: '硬體', name: 'NIC', confirm: () => true,
    });

    expect(res.ok).toBe(true);
    expect(api.namedQuery).toHaveBeenCalledWith('insertDeviceType', ['硬體', 'NIC']);

    // 選單裡多出一個名字，要查得到是誰加的
    const audit = window.electronAPI.namedQuery.mock.calls.find(([q]) => q === 'insertAuditLog');
    expect(audit).toBeTruthy();
    expect(audit[1][3]).toBe('CREATE');
    expect(audit[1][4]).toBe('HARDWARE');
    expect(audit[1][8]).toContain('NIC');
  });

  it('型號會連同它掛在哪個廠牌一起問、一起記', async () => {
    const asked = [];
    await addDictionaryEntry(api, {
      kind: 'MODEL', category: '耗材', name: 'LC-LC-OM4-3M', brand: 'METECH',
      confirm: (msg) => { asked.push(msg); return true; },
    });

    expect(asked[0]).toContain('METECH');
    expect(api.namedQuery).toHaveBeenCalledWith('insertDeviceModel', ['METECH', 'LC-LC-OM4-3M', '耗材']);
    const audit = window.electronAPI.namedQuery.mock.calls.find(([q]) => q === 'insertAuditLog');
    expect(audit[1][8]).toContain('METECH');
  });

  it('沒有廠牌就不能新增型號', async () => {
    const res = await addDictionaryEntry(api, { kind: 'MODEL', category: '設備', name: 'R750', confirm: () => true });
    expect(res.ok).toBe(false);
    expect(api.namedQuery).not.toHaveBeenCalled();
  });
});

describe('移除類型要留下紀錄', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = { namedQuery: vi.fn(async () => ({ success: true, rows: [] })) };
  });

  const api = (deleted = true) => ({
    namedQuery: vi.fn(async (query) => {
      if (query === 'countItemMasterByType') return { success: true, rows: [{ used: 0 }] };
      if (query === 'deleteItemTypeIfUnused') return { success: true, rows: deleted ? [{ id: 3 }] : [] };
      return { success: true, rows: [] };
    }),
  });

  it('移除成功會寫一筆事件紀錄', async () => {
    const res = await deleteItemType(api(true), 'RARITAN', '設備');
    expect(res.ok).toBe(true);

    const audit = window.electronAPI.namedQuery.mock.calls.find(([q]) => q === 'insertAuditLog');
    expect(audit).toBeTruthy();
    expect(audit[1][3]).toBe('DELETE');
    expect(audit[1][8]).toContain('RARITAN');
  });

  it('沒有真的移除就不記', async () => {
    const res = await deleteItemType(api(false), 'RARITAN', '設備');
    expect(res.ok).toBe(false);
    expect(window.electronAPI.namedQuery.mock.calls.find(([q]) => q === 'insertAuditLog')).toBeUndefined();
  });
});

describe('夥伴啟用／停用要先問過', () => {
  const PARTNERS = [
    { id: 1, type: 'CUSTOMER', name: '富邦綜合證券', contact: 'David', phone: '0918', address: '台北', is_active: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn(async (query) => {
        if (query === 'fetchPartners') return { success: true, rows: PARTNERS };
        return { success: true, rows: [] };
      }),
    };
  });

  const clickToggle = async () => {
    render(<Partners />);
    await userEvent.click(await screen.findByRole('button', { name: '使用中' }));
  };

  it('按下取消就不會停用', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await clickToggle();

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('停用'));
    expect(window.electronAPI.namedQuery).not.toHaveBeenCalledWith('updatePartnerActive', expect.anything());
  });

  it('確定之後才停用', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await clickToggle();

    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('updatePartnerActive', [false, 1]);
    });
  });

  it('確認訊息會說清楚停用之後會怎樣', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await clickToggle();

    const msg = window.confirm.mock.calls[0][0];
    expect(msg).toContain('富邦綜合證券');
    expect(msg).toContain('選不到');
  });
});

describe('從品項挑選視窗刪除主檔要留下紀錄', () => {
  const ORPHAN = {
    id: 999, category_id: 2, cat_name: '硬體', brand: 'AMD', type: 'NIC',
    model: 'Solarflare X2522', specification: '', unit: '個', current_stock: 0, safety_stock: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.alert = vi.fn();
    window.electronAPI = { namedQuery: vi.fn(async () => ({ success: true, rows: [{ id: 999 }] })) };
  });

  const auditCall = () => window.electronAPI.namedQuery.mock.calls.find(([q]) => q === 'insertAuditLog');

  it('採購單的品項挑選：刪掉之後查得到是誰刪的', async () => {
    render(<PurchaseItemSelectModal isOpen onClose={vi.fn()} items={[ORPHAN]} onItemDeleted={vi.fn()} />);
    await userEvent.click(screen.getByTestId('delete-orphan-btn-999'));

    await waitFor(() => expect(auditCall()).toBeTruthy());
    const [, params] = auditCall();
    expect(params[3]).toBe('DELETE');
    expect(params[4]).toBe('HARDWARE');
    expect(params[8]).toContain('Solarflare X2522');
  });

  it('進貨單的品項挑選：同樣會記', async () => {
    render(<InboundItemSelectModal isOpen onClose={vi.fn()} items={[ORPHAN]} onItemDeleted={vi.fn()} />);
    await userEvent.click(screen.getByTestId('delete-orphan-btn-999'));

    await waitFor(() => expect(auditCall()).toBeTruthy());
    expect(auditCall()[1][3]).toBe('DELETE');
  });

  it('刪不掉就不會留下一筆假的紀錄', async () => {
    window.electronAPI.namedQuery = vi.fn(async () => ({ success: true, rows: [] }));
    render(<PurchaseItemSelectModal isOpen onClose={vi.fn()} items={[ORPHAN]} onItemDeleted={vi.fn()} />);
    await userEvent.click(screen.getByTestId('delete-orphan-btn-999'));

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(auditCall()).toBeUndefined();
  });
});

describe('上傳客戶簽收單要先問過', () => {
  const DN = {
    id: 5, request_no: 'DN-20260930-01', request_type: 'SALE', customer: '富邦',
    status: 'SHIPPED', shipping_date: '2026-09-30', item_count: 1, creator_name: 'Admin',
    signed_doc_url: null, signed_doc_name: null,
  };

  /** 從列表打開簽收單視窗，回傳那個藏起來的檔案輸入框 */
  const openDocModal = async (dn) => {
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn(async (query) => {
        if (query === 'fetchDNList') return { success: true, rows: [dn] };
        return { success: true, rows: [] };
      }),
      saveFile: vi.fn(async () => ({ success: true, fileName: 'stored.pdf' })),
      getUserPreference: vi.fn(async () => ({ success: true, value: null })),
      setUserPreference: vi.fn(async () => ({ success: true })),
    };
    render(<MemoryRouter><DNList /></MemoryRouter>);
    await screen.findByText('DN-20260930-01');
    await userEvent.click(screen.getByTitle(/簽收單|上傳客戶簽收單據/));
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    return input;
  };

  /**
   * 選完檔案就直接上傳、而且會蓋掉原本那份。舊的不會留備份。
   */
  it('已經有簽收單時會先說清楚要蓋掉哪一份', async () => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const input = await openDocModal({ ...DN, signed_doc_url: 'old.pdf', signed_doc_name: '舊簽收單.pdf' });

    await userEvent.upload(input, new File(['x'], '新簽收單.pdf', { type: 'application/pdf' }));

    const msg = window.confirm.mock.calls.at(-1)[0];
    expect(msg).toContain('舊簽收單.pdf');
    expect(msg).toContain('不會保留');
    // 按下取消就什麼都不做
    expect(window.electronAPI.saveFile).not.toHaveBeenCalled();
    expect(window.electronAPI.namedQuery).not.toHaveBeenCalledWith('updateOutboundSignedDoc', expect.anything());
  });

  it('確定之後才上傳', async () => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const input = await openDocModal(DN);

    await userEvent.upload(input, new File(['x'], '簽收單.pdf', { type: 'application/pdf' }));

    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'updateOutboundSignedDoc', ['stored.pdf', '簽收單.pdf', 5]);
    });
  });
});
