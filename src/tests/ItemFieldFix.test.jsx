import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InboundList from '../pages/InboundList';
import { queries } from '../../database/queries';
import { prepareQueryParams } from '../../server/queryParams.js';
import { ITEM_FIX_FIELDS, validateFieldFix, distinctFieldValues } from '../utils/itemFieldFix';

/**
 * 進貨單明細：型號、規格比照廠牌，可以更正
 *
 * 表頭的鉛筆一次改全部用到這個值的品項，每一列的鉛筆只改那一個品項。
 * 規格是選填，空的也能在那一列補上，只改一個品項時也可以清空。
 */
describe('規則', () => {
  it('型號正規化與新增時相同，規格只去頭尾空白', () => {
    expect(ITEM_FIX_FIELDS.model.normalize('  n-29nvms ')).toBe('N-29NVMS');
    expect(ITEM_FIX_FIELDS.specification.normalize('  SlimSAS 8i  ')).toBe('SlimSAS 8i');
  });

  it('型號不能空白；規格只改一個品項時可以清空', () => {
    expect(validateFieldFix('model', 'N-29NVMS', ' ', true)).toContain('請輸入正確的型號');
    expect(validateFieldFix('specification', 'NVME', '', true)).toBeNull();
    expect(validateFieldFix('specification', 'NVME', '', false)).toContain('請輸入正確的規格');
    expect(validateFieldFix('model', 'N-29NVMS', 'n-29nvms', true)).toContain('相同');
  });

  it('這張單上出現過的值，去掉空值與重複', () => {
    expect(distinctFieldValues([{ specification: 'NVME' }, { specification: '' }, { specification: 'NVME ' }, { specification: 'SATA' }], 'specification'))
      .toEqual(['NVME', 'SATA']);
  });

  it('一次改全部要改到預期張數；只改一個時帶上舊值當條件', () => {
    expect(ITEM_FIX_FIELDS.model.buildAllSteps('N-29NVMS', 'N-29NVMX', 2)).toEqual([
      expect.objectContaining({ queryName: 'renameItemMasterModel', params: ['N-29NVMS', 'N-29NVMX'], expectRows: 2 }),
    ]);
    expect(ITEM_FIX_FIELDS.specification.buildSingleSteps(445, 'NVME', 'NVMe U.2')).toEqual([
      expect.objectContaining({ queryName: 'renameSingleItemMasterSpec', params: [445, 'NVMe U.2', 'NVME'], expectRows: 1 }),
    ]);
  });
});

describe('查詢', () => {
  it('型號與規格各自改自己的欄位', () => {
    expect(queries.renameItemMasterModel).toContain('SET model = UPPER(TRIM(');
    expect(queries.renameItemMasterSpec).toContain("SET specification = NULLIF(TRIM(COALESCE($2, '')), '')");
    expect(queries.renameSingleItemMasterModel).toContain('WHERE id = $1::integer AND UPPER(TRIM(model)) = UPPER(TRIM($3))');
    expect(queries.renameSingleItemMasterSpec).toContain("COALESCE(TRIM(specification), '') = TRIM(COALESCE($3, ''))");
  });

  it('重複檢查：改的那一欄用新值比，其餘用原本的值；耗材不比規格', () => {
    const q = queries.fetchItemMasterModelConflict;
    expect(q).toContain("UPPER(TRIM(COALESCE(t.model, ''))) = UPPER(TRIM(REGEXP_REPLACE(COALESCE($2, '')");
    expect(q).toContain("UPPER(TRIM(COALESCE(t.brand, ''))) = UPPER(TRIM(COALESCE(o.brand, '')))");
    expect(queries.fetchItemMasterSpecConflict).toContain("(c.name = '耗材' OR COALESCE(TRIM(t.specification), '') = TRIM(COALESCE($2, '')))");
  });

  it('參數是一般字串，伺服器的前處理原樣交給 pg', () => {
    expect(prepareQueryParams([445, 'NVMe', 'NVME'], queries.renameSingleItemMasterSpec, 'renameSingleItemMasterSpec')).toEqual([445, 'NVMe', 'NVME']);
  });
});

const ORDER = {
  id: 31, order_no: 'IN-20261001-02', status: 'COMPLETED', order_date: '2026-10-01', effective_date: '2026-10-01',
  created_at: '2026-10-01T11:19:37.000Z', partner_id: 3, partner_name: '元景資訊股份有限公司', invoice_no: null,
  attachments: '[]', item_count: 2, creator_name: 'Rio',
};
const ITEMS = [
  { id: 1, item_id: 445, sn: '2413N29NVMS0090', quantity: 1, brand: '元景資訊', type: 'SSD STORAGE CAGE', model: 'N-29NVMS', specification: 'NVME', category_name: '硬體' },
  { id: 2, item_id: 455, sn: 'N48-1', quantity: 1, brand: '元景資訊', type: 'SSD STORAGE CAGE', model: 'N-48SSR', specification: '', category_name: '硬體' },
];
const MASTERS = {
  445: { id: 445, category_name: '硬體', type: 'SSD STORAGE CAGE', brand: '元景資訊', model: 'N-29NVMS', specification: 'NVME', asset_count: 10, inbound_orders: 'IN-20261001-02' },
  455: { id: 455, category_name: '硬體', type: 'SSD STORAGE CAGE', brand: '元景資訊', model: 'N-48SSR', specification: '', asset_count: 1, inbound_orders: 'IN-20261001-02' },
};

describe('進貨單明細上更正型號、規格', () => {
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
        if (query === 'fetchItemMasterUsage') return { success: true, rows: [MASTERS[params[0]]] };
        if (query === 'fetchModelUsage') return { success: true, rows: Object.values(MASTERS).filter((m) => m.model === params[0]) };
        if (query === 'fetchSpecUsage') return { success: true, rows: Object.values(MASTERS).filter((m) => m.specification === params[0]) };
        if (/Conflict/.test(query)) return { success: true, rows: conflicts };
        return { success: true, rows: [] };
      }),
      runTransaction: vi.fn(async (steps) => { txSteps.push(steps); return { success: true, results: {} }; }),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const openEdit = async (label = '編輯進貨單') => {
    render(<MemoryRouter><InboundList /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('inbound-tab-history'));
    await userEvent.click(await screen.findByLabelText(label));
    await screen.findByText('2413N29NVMS0090');
  };
  const openDialog = async (buttonLabel, dialogName) => {
    await openEdit();
    await userEvent.click(screen.getByLabelText(buttonLabel));
    const dialog = await screen.findByRole('dialog', { name: dialogName });
    await within(dialog).findByTestId('field-fix-usage');
    return dialog;
  };
  const save = async (dialog, value) => {
    const input = within(dialog).getByLabelText(/正確的/);
    if (value) await userEvent.type(input, value);
    await userEvent.click(within(dialog).getByRole('button', { name: '確定更正' }));
  };

  it('型號、規格的表頭與每一列都有鉛筆，和廠牌一樣', async () => {
    await openEdit();
    expect(screen.getByLabelText('一次更正型號（全部品項）').closest('th')).toHaveTextContent('型號');
    expect(screen.getByLabelText('一次更正規格（全部品項）').closest('th')).toHaveTextContent('規格');
    expect(screen.getByLabelText('更正型號 元景資訊 N-29NVMS').closest('td')).toHaveAttribute('data-testid', 'inbound-item-model-1');
    expect(screen.getByLabelText('更正規格 元景資訊 N-29NVMS').closest('td')).toHaveAttribute('data-testid', 'inbound-item-spec-1');
  });

  it('規格空白的那一列也能補上', async () => {
    await openEdit();
    expect(screen.getByLabelText('更正規格 元景資訊 N-48SSR')).toBeInTheDocument();
  });

  it('查看時沒有這些鉛筆', async () => {
    await openEdit('查看進貨明細');
    expect(screen.queryByLabelText(/更正型號|更正規格|一次更正/)).not.toBeInTheDocument();
  });

  it('只改這個品項的型號', async () => {
    const dialog = await openDialog('更正型號 元景資訊 N-29NVMS', '更正這個品項的型號');
    expect(within(dialog).getByTestId('field-fix-current')).toHaveTextContent('N-29NVMS');
    await save(dialog, 'n-29nvmx');
    await waitFor(() => expect(txSteps).toHaveLength(1));
    expect(txSteps[0]).toEqual(ITEM_FIX_FIELDS.model.buildSingleSteps(445, 'N-29NVMS', 'N-29NVMX'));
    expect(calls.find((c) => c.query === 'fetchItemMasterModelConflict').params).toEqual([445, 'N-29NVMX']);
    const log = calls.find((c) => c.query === 'insertAuditLog');
    expect(JSON.stringify(log)).toContain('型號更正 [N-29NVMS] → [N-29NVMX]');
  });

  it('一次改全部品項的規格', async () => {
    const dialog = await openDialog('一次更正規格（全部品項）', '一次更正規格（全部品項）');
    // 這張單只有一個非空的規格，不需要選
    expect(within(dialog).getByTestId('field-fix-current')).toHaveTextContent('NVME');
    expect(within(dialog).getByTestId('field-fix-usage')).toHaveTextContent('會一起改到 1 個品項');
    await save(dialog, 'NVMe U.2');
    await waitFor(() => expect(txSteps).toHaveLength(1));
    expect(txSteps[0]).toEqual(ITEM_FIX_FIELDS.specification.buildAllSteps('NVME', 'NVMe U.2', 1));
  });

  it('只改一個品項時可以把規格清空', async () => {
    const dialog = await openDialog('更正規格 元景資訊 N-29NVMS', '更正這個品項的規格');
    await save(dialog, '');
    await waitFor(() => expect(txSteps).toHaveLength(1));
    expect(txSteps[0]).toEqual(ITEM_FIX_FIELDS.specification.buildSingleSteps(445, 'NVME', ''));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('改成「（空白）」'));
  });

  it('改了會和既有品項重複就擋下來', async () => {
    conflicts = [{ existing_id: 900, category_name: '硬體', type: 'SSD STORAGE CAGE', brand: '元景資訊', model: 'N-48SSR', specification: '' }];
    const dialog = await openDialog('更正型號 元景資訊 N-29NVMS', '更正這個品項的型號');
    await save(dialog, 'N-48SSR');
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('無法更正')));
    expect(txSteps).toHaveLength(0);
  });
});
