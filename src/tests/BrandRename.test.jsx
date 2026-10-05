import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InboundList from '../pages/InboundList';
import { queries } from '../../database/queries';
import { prepareQueryParams } from '../../server/queryParams.js';
import {
  normalizeBrand, validateBrandRename, buildBrandRenameSteps, buildSingleBrandRenameSteps, summarizeBrandUsage, auditModuleFor,
} from '../utils/brandRename';

/**
 * 廠牌更名
 *
 * 「元景資訊」打成「光景資訊」，用到它的品項有硬體 2 個、耗材 3 個。
 * 逐筆到各列表改不切實際，硬體編輯還會把共用主檔的資產拆成新卡片。
 * 進貨單明細的廠牌旁可以一次更名，用到這個廠牌的品項全部改正。
 */
describe('規則', () => {
  it('正規化與新增品項時一致', () => {
    expect(normalizeBrand('  supermicro   inc ')).toBe('SUPERMICRO INC');
    expect(normalizeBrand('元景資訊')).toBe('元景資訊');
  });

  it('沒輸入或跟原本一樣就不改', () => {
    expect(validateBrandRename('光景資訊', '  ')).toContain('請輸入');
    expect(validateBrandRename('Dell', ' DELL ')).toContain('相同');
    expect(validateBrandRename('光景資訊', '元景資訊')).toBeNull();
  });

  it('品項主檔要改到預期的張數，接著處理廠牌清單', () => {
    const steps = buildBrandRenameSteps('光景資訊', '元景資訊', 5);
    expect(steps.map((s) => s.queryName)).toEqual([
      'renameItemMasterBrand', 'mergeBrandModelsDropDuplicates', 'mergeBrandModelsAndTypes', 'deleteMergedBrands', 'renameItemBrands',
    ]);
    expect(steps[0]).toMatchObject({ params: ['光景資訊', '元景資訊'], expectRows: 5 });
  });

  it('依類別統計用到的品項、資產與進貨單', () => {
    const s = summarizeBrandUsage([
      { category_name: '硬體', asset_count: 10, inbound_orders: 'IN-20261001-02' },
      { category_name: '硬體', asset_count: 1, inbound_orders: 'IN-20261001-02' },
      { category_name: '耗材', asset_count: 0, inbound_orders: 'IN-20261001-02, IN-20261003-01' },
    ]);
    expect(s).toEqual({ masters: 3, byCategory: { 硬體: 2, 耗材: 1 }, assets: 11, orders: ['IN-20261001-02', 'IN-20261003-01'] });
  });

  it('事件紀錄依類別記到對應的模組', () => {
    expect(auditModuleFor('硬體')).toBe('HARDWARE');
    expect(auditModuleFor('耗材')).toBe('CONSUMABLE');
    expect(auditModuleFor('設備')).toBe('DEVICE');
  });

  it('查詢比對舊名稱忽略大小寫與空白；改名後撞到既有品項會被找出來', () => {
    expect(queries.renameItemMasterBrand).toContain('UPPER(TRIM(brand)) = UPPER(TRIM($1))');
    expect(queries.fetchBrandRenameConflicts).toContain('t.category_id = o.category_id');
    // 參數是一般字串，伺服器的前處理原樣交給 pg
    expect(prepareQueryParams(['光景資訊', '元景資訊'], queries.renameItemMasterBrand, 'renameItemMasterBrand')).toEqual(['光景資訊', '元景資訊']);
  });
});

const ORDER = {
  id: 31, order_no: 'IN-20261001-02', status: 'COMPLETED', order_date: '2026-10-01', effective_date: '2026-10-01',
  created_at: '2026-10-01T11:19:37.000Z', partner_id: 3, partner_name: '元景資訊股份有限公司', invoice_no: null,
  attachments: '[]', item_count: 2, creator_name: 'Rio',
};
const ITEMS = [
  { id: 1, item_id: 445, sn: '2413N29NVMS0090', quantity: 1, brand: '光景資訊', type: 'SSD STORAGE CAGE', model: 'N-29NVMS', specification: 'NVME', category_name: '硬體' },
  { id: 2, item_id: 456, sn: null, quantity: 10, brand: '光景資訊', type: 'SLIMSAS CABLE', model: 'C7 CABLE', specification: '', category_name: '耗材' },
  // 一張單不一定全是同一個廠牌
  { id: 3, item_id: 470, sn: 'SN-DELL-1', quantity: 1, brand: 'DELL', type: 'NIC', model: 'X710', specification: '', category_name: '硬體' },
];
const USAGE = [
  { id: 445, category_name: '硬體', type: 'SSD STORAGE CAGE', brand: '光景資訊', model: 'N-29NVMS', specification: 'NVME', asset_count: 10, inbound_orders: 'IN-20261001-02' },
  { id: 455, category_name: '硬體', type: 'SSD STORAGE CAGE', brand: '光景資訊', model: 'N-48SSR', specification: 'SATA', asset_count: 1, inbound_orders: 'IN-20261001-02' },
  { id: 456, category_name: '耗材', type: 'SLIMSAS CABLE', brand: '光景資訊', model: 'C7 CABLE', specification: '', asset_count: 0, inbound_orders: 'IN-20261001-02' },
];

describe('進貨單明細上更名', () => {
  let calls;
  let txSteps;
  let conflicts;
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    txSteps = [];
    conflicts = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    window.electronAPI = {
      namedQuery: vi.fn(async (query, params) => {
        calls.push({ query, params });
        if (query === 'fetchInboundList') return { success: true, rows: [ORDER] };
        if (query === 'fetchInboundItems') return { success: true, rows: ITEMS };
        if (query === 'fetchBrandUsage') return { success: true, rows: USAGE };
        if (query === 'fetchBrandRenameConflicts') return { success: true, rows: conflicts };
        if (query === 'fetchItemMasterUsage') return { success: true, rows: USAGE.filter((u) => u.id === params[0]) };
        if (query === 'fetchItemMasterBrandConflict') return { success: true, rows: conflicts };
        return { success: true, rows: [] };
      }),
      runTransaction: vi.fn(async (steps) => { txSteps.push(steps); return { success: true, results: {} }; }),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const openDetail = async () => {
    render(<MemoryRouter><InboundList /></MemoryRouter>);
    // 已進貨的單在「已進貨 (歷史紀錄)」
    await userEvent.click(screen.getByTestId('inbound-tab-history'));
    await userEvent.click(await screen.findByLabelText('查看進貨明細'));
    await screen.findByText('2413N29NVMS0090');
  };
  const openDialog = async (buttonLabel, dialogName) => {
    await openDetail();
    await userEvent.click(screen.getByLabelText(buttonLabel));
    const dialog = await screen.findByRole('dialog', { name: dialogName });
    await within(dialog).findByTestId('brand-rename-usage');
    return dialog;
  };
  const ALL = ['一次更正廠牌（全部品項）', '一次更正廠牌（全部品項）'];
  const ONE = ['更正廠牌 光景資訊 N-29NVMS', '更正這個品項的廠牌'];

  describe('表頭：一次改全部品項', () => {
    it('按鈕在「廠牌」表頭上', async () => {
      await openDetail();
      const th = screen.getByLabelText(ALL[0]).closest('th');
      expect(th).toHaveTextContent('廠牌');
    });

    it('這張單有好幾個廠牌時先選要改哪一個，列出所有用到它的品項', async () => {
      const dialog = await openDialog(...ALL);
      const select = within(dialog).getByLabelText('要更正的廠牌');
      expect([...select.options].map((o) => o.value)).toEqual(['光景資訊', 'DELL']);
      expect(within(dialog).getByTestId('brand-rename-usage')).toHaveTextContent('會一起改到 3 個品項');
      expect(within(dialog).getByTestId('brand-rename-usage')).toHaveTextContent('11 筆資產');
      await userEvent.selectOptions(select, 'DELL');
      await waitFor(() => expect(calls.filter((c) => c.query === 'fetchBrandUsage').at(-1).params).toEqual(['DELL']));
    });

    it('確定更正：一個交易改完，每個品項各記一筆事件紀錄', async () => {
      const dialog = await openDialog(...ALL);
      await userEvent.type(within(dialog).getByLabelText('正確的廠牌名稱'), '元景資訊');
      await userEvent.click(within(dialog).getByRole('button', { name: '確定更正' }));

      await waitFor(() => expect(txSteps).toHaveLength(1));
      expect(txSteps[0]).toEqual(buildBrandRenameSteps('光景資訊', '元景資訊', 3));
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('硬體 2 個、耗材 1 個'));
      const logs = calls.filter((c) => c.query === 'insertAuditLog');
      expect(logs).toHaveLength(3);
      expect(JSON.stringify(logs)).toContain('廠牌更正 [光景資訊] → [元景資訊]');
      await waitFor(() => expect(calls.filter((c) => c.query === 'fetchInboundItems').length).toBeGreaterThan(1));
      expect(screen.queryByRole('dialog', { name: ALL[1] })).not.toBeInTheDocument();
    });

    it('改名後會跟既有品項重複就擋下來', async () => {
      conflicts = [{ id: 445, category_name: '硬體', type: 'SSD STORAGE CAGE', model: 'N-29NVMS', specification: 'NVME', existing_id: 900 }];
      const dialog = await openDialog(...ALL);
      await userEvent.type(within(dialog).getByLabelText('正確的廠牌名稱'), '元景資訊');
      await userEvent.click(within(dialog).getByRole('button', { name: '確定更正' }));
      await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('無法更正')));
      expect(txSteps).toHaveLength(0);
    });

    it('沒有輸入新名稱時不能按', async () => {
      const dialog = await openDialog(...ALL);
      expect(within(dialog).getByRole('button', { name: '確定更正' })).toBeDisabled();
    });
  });

  describe('每一列：只改這個品項', () => {
    it('按鈕在每一列的廠牌旁', async () => {
      await openDetail();
      expect(screen.getByLabelText(ONE[0]).closest('td')).toHaveAttribute('data-testid', 'inbound-item-brand-1');
      expect(screen.getByLabelText('更正廠牌 DELL X710')).toBeInTheDocument();
    });

    it('只列出這一個品項', async () => {
      const dialog = await openDialog(...ONE);
      expect(within(dialog).getByTestId('brand-rename-current')).toHaveTextContent('光景資訊');
      expect(within(dialog).getByTestId('brand-rename-usage')).toHaveTextContent('要更正的品項');
      expect(within(dialog).getByText('N-29NVMS')).toBeInTheDocument();
      expect(within(dialog).queryByText('N-48SSR')).not.toBeInTheDocument();
      expect(calls.find((c) => c.query === 'fetchItemMasterUsage').params).toEqual([445]);
    });

    it('確定更正：只改這張品項主檔，同廠牌的其他品項不動', async () => {
      const dialog = await openDialog(...ONE);
      await userEvent.type(within(dialog).getByLabelText('正確的廠牌名稱'), '元景資訊');
      await userEvent.click(within(dialog).getByRole('button', { name: '確定更正' }));

      await waitFor(() => expect(txSteps).toHaveLength(1));
      expect(txSteps[0]).toEqual(buildSingleBrandRenameSteps(445, '光景資訊', '元景資訊'));
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('只改這一個品項'));
      const logs = calls.filter((c) => c.query === 'insertAuditLog');
      expect(logs).toHaveLength(1);
      expect(calls.some((c) => c.query === 'fetchBrandRenameConflicts')).toBe(false);
      expect(calls.find((c) => c.query === 'fetchItemMasterBrandConflict').params).toEqual([445, '元景資訊']);
    });

    it('改了會跟既有品項重複就擋下來', async () => {
      conflicts = [{ existing_id: 900, category_name: '硬體', type: 'SSD STORAGE CAGE', model: 'N-29NVMS', specification: 'NVME' }];
      const dialog = await openDialog(...ONE);
      await userEvent.type(within(dialog).getByLabelText('正確的廠牌名稱'), '元景資訊');
      await userEvent.click(within(dialog).getByRole('button', { name: '確定更正' }));
      await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('無法更正')));
      expect(txSteps).toHaveLength(0);
    });
  });
});

describe('單一品項的查詢', () => {
  it('帶上舊名稱當條件，並把新廠牌加進清單', () => {
    const steps = buildSingleBrandRenameSteps(445, '光景資訊', '元景資訊');
    expect(steps).toEqual([
      expect.objectContaining({ queryName: 'renameSingleItemMasterBrand', params: [445, '元景資訊', '光景資訊'], expectRows: 1 }),
      { queryName: 'ensureItemBrandForMaster', params: [445, '元景資訊'] },
    ]);
    expect(queries.renameSingleItemMasterBrand).toContain('WHERE id = $1::integer AND UPPER(TRIM(brand)) = UPPER(TRIM($3))');
    expect(queries.ensureItemBrandForMaster).toContain('ON CONFLICT (category_id, name) DO NOTHING');
  });
});
