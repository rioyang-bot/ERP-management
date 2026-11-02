import React, { useState } from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { queries } from '../../database/queries';
import {
  addYears, resolveWarrantyExpire, finalizeWarrantyFields, warrantyInfoParams,
  diffWarrantyFields, describeWarrantyChanges, pickWarrantyFields,
} from '../utils/warranty';
import WarrantyFields from '../components/common/WarrantyFields';
import { buildInboundConfirmSteps } from '../utils/inboundEdit';
import { renderInboundHistory } from './helpers/renderInboundList';

/**
 * 設備／硬體：進貨日期、原廠保固(年)、客戶保固(年)
 *
 *   原廠保固到期 = 進貨日期 + 原廠保固(年)
 *   客戶保固到期 = 安裝日期 + 客戶保固(年)
 *
 * 進貨日期在確認進貨時寫入（可再編輯），安裝日期在出貨時寫入。
 * 年數 1~5 年用下拉選；沒選年數的維持原本手動填到期日的做法。
 */

const calls = (name) => window.electronAPI.namedQuery.mock.calls.filter(([q]) => q === name);
const auditLogs = () => calls('insertAuditLog').map(([, p]) => ({ actionType: p[3], module: p[4], targetId: p[6], summary: p[8], details: p[9] }));

const setup = (extra = {}) => {
  window.electronAPI = {
    namedQuery: vi.fn((query) => {
      if (extra[query]) return Promise.resolve(typeof extra[query] === 'function' ? extra[query]() : extra[query]);
      return Promise.resolve({ success: true, rows: [] });
    }),
    runTransaction: vi.fn().mockResolvedValue({ success: true, results: [] }),
    saveFile: vi.fn(), getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
  vi.spyOn(window, 'confirm').mockImplementation(() => true);
});

describe('到期日計算', () => {
  it('日期加整數年', () => {
    expect(addYears('2026-10-01', 3)).toBe('2029-10-01');
    expect(addYears('2026-10-01', '1')).toBe('2027-10-01');
  });

  it('2/29 加到平年落在 2/28，與資料庫 make_interval 相同', () => {
    expect(addYears('2024-02-29', 3)).toBe('2027-02-28');
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
  });

  it('沒有基準日期或沒選年數就不算', () => {
    expect(addYears('', 3)).toBeNull();
    expect(addYears(null, 3)).toBeNull();
    expect(addYears('2026-10-01', '')).toBeNull();
    expect(addYears('2026-10-01', null)).toBeNull();
  });

  it('能算就用算的，否則沿用手動填的到期日', () => {
    expect(resolveWarrantyExpire('2026-10-01', '2', '2030-01-01')).toBe('2028-10-01');
    expect(resolveWarrantyExpire('2026-10-01', '', '2030-01-01')).toBe('2030-01-01');
    expect(resolveWarrantyExpire('', '2', '2030-01-01')).toBe('2030-01-01');
    expect(resolveWarrantyExpire('', '', '')).toBeNull();
  });

  it('存檔參數：年數轉數字、空白轉 null', () => {
    const f = finalizeWarrantyFields({
      stock_date: '2026-10-01', installed_date: '2026-10-20',
      warranty_years: '3', warranty_expire: '2000-01-01',
      customer_warranty_years: '', customer_warranty_expire: '2030-05-05',
    });
    expect(warrantyInfoParams(f, '7')).toEqual(['2026-10-01', '2026-10-20', 3, '2029-10-01', null, '2030-05-05', 7]);
  });

  it('異動寫成一句話', () => {
    const changes = diffWarrantyFields(
      { stock_date: '2026-10-01', warranty_years: null, warranty_expire: null },
      { stock_date: '2026-10-01', warranty_years: '3', warranty_expire: '2029-10-01' },
    );
    expect(changes.map((c) => c.field)).toEqual(['warranty_years', 'warranty_expire']);
    expect(describeWarrantyChanges(changes)).toBe('原廠保固（年）「--」→「3 年」、原廠保固到期「--」→「2029-10-01」');
  });

  it('資料庫回傳的年數是數字、日期可能帶時間，比對前統一格式', () => {
    expect(pickWarrantyFields({ warranty_years: 3, stock_date: '2026-10-01T00:00:00.000Z' }))
      .toMatchObject({ warranty_years: '3', stock_date: '2026-10-01', installed_date: '' });
  });
});

describe('編輯欄位', () => {
  const Harness = ({ initial }) => {
    const [v, setV] = useState(initial);
    return <WarrantyFields value={v} onChange={(patch) => setV((p) => ({ ...p, ...patch }))} />;
  };

  it('年數下拉 1~5 年，預設未設定', () => {
    render(<Harness initial={{}} />);
    const select = screen.getByLabelText('原廠保固(年)');
    expect(select.value).toBe('');
    expect(within(select).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['未設定（到期日手動填）', '1 年', '2 年', '3 年', '4 年', '5 年']);
    expect(screen.getByLabelText('客戶保固(年)')).toBeInTheDocument();
  });

  it('選了年數：到期日自動算出、不能手改；改基準日期跟著變', () => {
    render(<Harness initial={{ stock_date: '2026-10-01', installed_date: '2026-10-20', warranty_expire: '2030-01-01' }} />);
    fireEvent.change(screen.getByLabelText('原廠保固(年)'), { target: { value: '3' } });
    const w = screen.getByLabelText(/原廠保固到期/);
    expect(w.value).toBe('2029-10-01');
    expect(w.readOnly).toBe(true);
    expect(screen.getByText('自動計算：進貨日期 + 3 年')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/進貨日期/), { target: { value: '2026-11-15' } });
    expect(screen.getByLabelText(/原廠保固到期/).value).toBe('2029-11-15');

    fireEvent.change(screen.getByLabelText('客戶保固(年)'), { target: { value: '2' } });
    expect(screen.getByLabelText(/客戶保固到期/).value).toBe('2028-10-20');
  });

  it('沒選年數：照舊手動填到期日', () => {
    render(<Harness initial={{ stock_date: '2026-10-01', warranty_expire: '2030-01-01' }} />);
    const w = screen.getByLabelText(/原廠保固到期/);
    expect(w.value).toBe('2030-01-01');
    expect(w.readOnly).toBe(false);
    fireEvent.change(w, { target: { value: '2031-02-02' } });
    expect(screen.getByLabelText(/原廠保固到期/).value).toBe('2031-02-02');
  });

  it('選了年數但沒有安裝日期：提示先填，到期日仍可手填', () => {
    render(<Harness initial={{ customer_warranty_years: '2' }} />);
    expect(screen.getByText('請先填安裝日期，才會自動計算')).toBeInTheDocument();
    expect(screen.getByLabelText(/客戶保固到期/).readOnly).toBe(false);
  });
});

describe('資料庫查詢', () => {
  it('編輯存檔：有年數時到期日由資料庫依基準日期算', () => {
    const sql = queries.updateAssetWarrantyInfo;
    expect(sql).toContain('stock_date = $1::date');
    expect(sql).toContain('warranty_years = $3::smallint');
    expect(sql).toContain("($1::date + make_interval(years => $3::smallint::int))::date ELSE $4::date");
    expect(sql).toContain("($2::date + make_interval(years => $5::smallint::int))::date ELSE $6::date");
  });

  it.each([
    'updateAssetStatusLocationAndInstalledDateBySn',
    'updateMountedHardwareInstalledAndShippingDate',
    'exchangeShipAsset',
    'exchangeShipMounted',
    'swapShipMountedOnReplacement',
  ])('%s：寫入安裝日期時，有選年數的客戶保固到期跟著重算', (name) => {
    expect(queries[name]).toMatch(/customer_warranty_expire = CASE WHEN (\w+\.)?customer_warranty_years IS NOT NULL/);
  });

  it('確認進貨：資產的進貨日期取進貨單的日期', () => {
    const steps = buildInboundConfirmSteps({
      orderId: 31,
      items: [{ item_id: 5, quantity: 1, sn: 'SN-1', category_name: '設備' }],
    });
    expect(steps.find((s) => s.queryName === 'insertInboundAssets').params[5]).toBe(31);
    expect(queries.insertInboundAssets).toContain('(SELECT COALESCE(order_date, created_at::date) FROM inbound_orders WHERE id = $6::integer)');
  });

  it('改進貨單日期：只同步進貨日期仍是舊日期（或空白）的資產', () => {
    const sql = queries.syncAssetStockDateByInboundOrder;
    expect(sql).toContain('AND (a.stock_date IS NULL OR a.stock_date = $3::date)');
    expect(sql).toContain('UPPER(TRIM(a.sn)) = UPPER(TRIM(ii.sn))');
  });
});

describe('設備列表', () => {
  const DEVICE = {
    id: 1, item_master_id: 5, sn: 'DEV-W-001', brand: 'DELL', type: 'Server', model: 'R760',
    specification: '', ownership: 'FOR_SALE', status: 'SHIPPED', custom_attributes: {}, components: [],
    stock_date: '2026-10-01', installed_date: '2026-10-20', system_date: null,
    warranty_years: null, warranty_expire: null, customer_warranty_years: 2, customer_warranty_expire: '2028-10-20',
  };

  const show = async () => {
    setup({
      fetchAssetsList: { success: true, rows: [DEVICE] },
      fetchAssetsListByBrand: { success: true, rows: [DEVICE] },
      updateAssetDetails: { success: true, rows: [] },
      updateAssetWarrantyInfo: { success: true, rows: [{ id: 1 }] },
    });
    const { default: DeviceList } = await import('../pages/DeviceList');
    render(<MemoryRouter initialEntries={['/devices?brand=DELL']}><DeviceList /></MemoryRouter>);
    await screen.findByText('DEV-W-001');
  };

  const openEdit = async () => {
    await show();
    fireEvent.click(screen.getByText('DEV-W-001').closest('tr').querySelector('td:last-child button'));
    fireEvent.click(await screen.findByText(/編輯詳細資訊/));
    await screen.findByText('修改詳細設備資訊');
  };

  it('列表保固資訊多了進貨日期 (I)，到期日後標出保固年數', async () => {
    await show();
    expect(screen.getByText('保固資訊 (I/P/S/W/C)')).toBeInTheDocument();
    const row = screen.getByText('DEV-W-001').closest('tr');
    expect(within(row).getByText('I:')).toBeInTheDocument();
    expect(within(row).getByText('(2年)')).toBeInTheDocument();
  });

  it('編輯：選原廠保固 3 年 → 到期日 = 進貨日期 + 3 年，存檔並記事件', async () => {
    await openEdit();
    expect(screen.getByLabelText(/進貨日期/).value).toBe('2026-10-01');
    expect(screen.getByLabelText('客戶保固(年)').value).toBe('2');
    fireEvent.change(screen.getByLabelText('原廠保固(年)'), { target: { value: '3' } });
    expect(screen.getByLabelText(/原廠保固到期/).value).toBe('2029-10-01');
    fireEvent.click(screen.getByText(/儲存變更/));

    await waitFor(() => expect(calls('updateAssetWarrantyInfo')).toHaveLength(1));
    expect(calls('updateAssetWarrantyInfo')[0][1]).toEqual(['2026-10-01', '2026-10-20', 3, '2029-10-01', 2, '2028-10-20', 1]);
    // updateAssetDetails 的安裝日期、客戶保固、原廠保固也是算好的值
    const p = calls('updateAssetDetails')[0][1];
    expect([p[4], p[5], p[7]]).toEqual(['2026-10-20', '2028-10-20', '2029-10-01']);

    await waitFor(() => expect(auditLogs().some((l) => l.summary.startsWith('編輯設備詳細資訊'))).toBe(true));
    const log = auditLogs().find((l) => l.summary.startsWith('編輯設備詳細資訊'));
    expect(log).toMatchObject({ module: 'DEVICE', targetId: 'DEV-W-001' });
    expect(log.summary).toBe('編輯設備詳細資訊 [DEV-W-001]：原廠保固（年）「--」→「3 年」、原廠保固到期「--」→「2029-10-01」');
    expect(log.details).toMatchObject({ warranty_years: '3', warranty_expire: '2029-10-01', stock_date: '2026-10-01' });
  });

  it('日期與保固沒改：敘述照舊，不帶異動', async () => {
    await openEdit();
    fireEvent.click(screen.getByText(/儲存變更/));
    await waitFor(() => expect(auditLogs().some((l) => l.summary.startsWith('編輯設備詳細資訊'))).toBe(true));
    const log = auditLogs().find((l) => l.summary.startsWith('編輯設備詳細資訊'));
    expect(log.summary).toBe('編輯設備詳細資訊 [DEV-W-001]');
    expect(log.details.warrantyChanges).toBeUndefined();
  });
});

describe('硬體列表', () => {
  const HW = {
    id: 88, item_master_id: 2, sn: 'HW-W-888', brand: 'Mellanox', model: 'CX4121A', type: '網卡',
    status: 'ACTIVE', ownership: 'FOR_SALE', custom_attributes: {},
    stock_date: '2026-09-01', installed_date: null,
    warranty_years: 1, warranty_expire: '2027-09-01', customer_warranty_years: null, customer_warranty_expire: null,
  };

  const openEdit = async () => {
    setup({
      fetchNicList: { success: true, rows: [HW] },
      fetchNicListByType: { success: true, rows: [HW] },
      updateNicDetails: { success: true, rows: [] },
      updateAssetWarrantyInfo: { success: true, rows: [{ id: 88 }] },
    });
    const { default: HwList } = await import('../pages/HwList');
    render(<MemoryRouter initialEntries={['/hardware']}><HwList /></MemoryRouter>);
    fireEvent.change(await screen.findByPlaceholderText(/搜尋/), { target: { value: 'HW-W' } });
    const row = (await screen.findByText('HW-W-888')).closest('tr');
    return row;
  };

  it('列表補上保固資訊欄 (I/P/W/C)', async () => {
    const row = await openEdit();
    expect(screen.getByText('保固資訊 (I/P/W/C)')).toBeInTheDocument();
    expect(within(row).getByText('I:')).toBeInTheDocument();
    expect(within(row).getByText('(1年)')).toBeInTheDocument();
  });

  it('編輯視窗補上進貨日期、安裝日期與兩種保固；存檔並記事件', async () => {
    const row = await openEdit();
    fireEvent.click(row.querySelector('td:last-child button'));
    fireEvent.click(await screen.findByText(/編輯詳細資訊/));
    await screen.findByText('修改硬體資訊');

    expect(screen.getByLabelText(/進貨日期/).value).toBe('2026-09-01');
    expect(screen.getByLabelText('原廠保固(年)').value).toBe('1');
    expect(screen.getByLabelText(/原廠保固到期/).value).toBe('2027-09-01');

    fireEvent.change(screen.getByLabelText(/安裝日期/), { target: { value: '2026-10-05' } });
    fireEvent.change(screen.getByLabelText('客戶保固(年)'), { target: { value: '5' } });
    expect(screen.getByLabelText(/客戶保固到期/).value).toBe('2031-10-05');
    await userEvent.click(screen.getByRole('button', { name: '儲存變更' }));

    await waitFor(() => expect(calls('updateAssetWarrantyInfo')).toHaveLength(1));
    expect(calls('updateAssetWarrantyInfo')[0][1]).toEqual(['2026-09-01', '2026-10-05', 1, '2027-09-01', 5, '2031-10-05', 88]);

    await waitFor(() => expect(auditLogs().some((l) => l.summary.startsWith('編輯硬體詳細資訊'))).toBe(true));
    const log = auditLogs().find((l) => l.summary.startsWith('編輯硬體詳細資訊'));
    expect(log).toMatchObject({ module: 'HARDWARE', targetId: 'HW-W-888' });
    expect(log.summary).toBe('編輯硬體詳細資訊 [HW-W-888]：安裝日期「--」→「2026-10-05」、客戶保固（年）「--」→「5 年」、客戶保固到期「--」→「2031-10-05」');
  });

  it('保固資訊存不進去要說出來，事件紀錄不寫沒存成的異動', async () => {
    const row = await openEdit();
    window.electronAPI.namedQuery.mockImplementation((query) => {
      if (query === 'updateAssetWarrantyInfo') return Promise.resolve({ success: false, error: 'column "stock_date" does not exist' });
      if (query === 'fetchNicList' || query === 'fetchNicListByType') return Promise.resolve({ success: true, rows: [HW] });
      return Promise.resolve({ success: true, rows: [] });
    });
    fireEvent.click(row.querySelector('td:last-child button'));
    fireEvent.click(await screen.findByText(/編輯詳細資訊/));
    await screen.findByText('修改硬體資訊');
    fireEvent.change(screen.getByLabelText('客戶保固(年)'), { target: { value: '5' } });
    await userEvent.click(screen.getByRole('button', { name: '儲存變更' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('進貨日期／保固資訊儲存失敗')));
    await waitFor(() => expect(auditLogs().some((l) => l.summary.startsWith('編輯硬體詳細資訊'))).toBe(true));
    expect(auditLogs().find((l) => l.summary.startsWith('編輯硬體詳細資訊')).summary).toBe('編輯硬體詳細資訊 [HW-W-888]');
  });
});

describe('進貨單改日期：設備／硬體的進貨日期跟著改', () => {
  const ORDER = {
    id: 11, order_no: 'IN-20260715-01', status: 'COMPLETED',
    order_date: '2026-07-15', effective_date: '2026-07-15', created_at: '2026-07-15T02:00:00.000Z',
    partner_id: 7, partner_name: '元大Yuanta', invoice_no: 'INV-001', attachments: '[]',
  };
  const SYNCED = [
    { id: 1, sn: 'DEV-IN-1', brand: 'DELL', model: 'R760', category_name: '設備', warranty_years: 3, warranty_expire: '2029-08-01' },
    { id: 2, sn: 'HW-IN-2', brand: 'Intel', model: 'X710', category_name: '硬體', warranty_years: null, warranty_expire: null },
  ];

  const openEdit = async (syncResult = { success: true, rows: SYNCED }) => {
    setup({
      fetchInboundList: { success: true, rows: [ORDER] },
      fetchSuppliers: { success: true, rows: [{ id: 7, name: '元大Yuanta' }] },
      updateInboundOrderHeader: { success: true, rows: [{ id: 11 }] },
      syncAssetStockDateByInboundOrder: syncResult,
    });
    renderInboundHistory();
    await userEvent.click(await screen.findByLabelText('編輯進貨單'));
    return screen.findByLabelText('進貨日期');
  };

  it('日期改了：同步資產並在進貨單與每一台的履歷各記一筆', async () => {
    const input = await openEdit();
    await userEvent.clear(input);
    await userEvent.type(input, '2026-08-01');
    await userEvent.click(screen.getByRole('button', { name: /儲存/ }));

    await waitFor(() => expect(calls('syncAssetStockDateByInboundOrder')).toHaveLength(1));
    expect(calls('syncAssetStockDateByInboundOrder')[0][1]).toEqual([11, '2026-08-01', '2026-07-15']);

    await waitFor(() => expect(auditLogs().filter((l) => l.targetId === 'HW-IN-2')).toHaveLength(1));
    const logs = auditLogs();
    const inbound = logs.find((l) => l.module === 'INBOUND');
    expect(inbound.summary).toBe('修改進貨單 [IN-20260715-01] 進貨日期/發票/供應商/附件；2 筆設備／硬體的進貨日期跟著改為 2026-08-01');
    expect(inbound.details.stockDateSyncedSns).toEqual(['DEV-IN-1', 'HW-IN-2']);
    expect(logs.find((l) => l.targetId === 'DEV-IN-1')).toMatchObject({
      module: 'DEVICE', summary: '進貨日期跟著進貨單 [IN-20260715-01] 改為 2026-08-01（原 2026-07-15）',
    });
    expect(logs.find((l) => l.targetId === 'HW-IN-2')).toMatchObject({ module: 'HARDWARE' });
  });

  it('日期沒改：不動資產', async () => {
    await openEdit();
    const invoice = screen.getByDisplayValue('INV-001');
    await userEvent.clear(invoice);
    await userEvent.type(invoice, 'INV-002');
    await userEvent.click(screen.getByRole('button', { name: /儲存/ }));

    await waitFor(() => expect(calls('updateInboundOrderHeader')).toHaveLength(1));
    await waitFor(() => expect(auditLogs().some((l) => l.module === 'INBOUND')).toBe(true));
    expect(calls('syncAssetStockDateByInboundOrder')).toHaveLength(0);
    expect(auditLogs().find((l) => l.module === 'INBOUND').summary).toBe('修改進貨單 [IN-20260715-01] 進貨日期/發票/供應商/附件');
  });
});
