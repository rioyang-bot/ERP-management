import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { queries } from '../../database/queries';
import { findColumnValue } from '../utils/importColumnMatch';
import { parseWarrantyYears, readImportWarranty, warrantyInsertTail, YEARS_COLUMN_KEYWORDS } from '../utils/importWarranty';
import { buildFillPlan, buildFillParams, getKeptFieldLabels, FILLABLE_COLUMNS } from '../utils/assetFillImport';
import { createRunTransactionMock } from './helpers/mockTransaction';
import DeviceBatchImportModal from '../components/DeviceBatchImportModal';
import HwBatchImportModal from '../components/HwBatchImportModal';
import DeviceRegistrationModal from '../components/DeviceRegistrationModal';
import HwRegistrationModal from '../components/HwRegistrationModal';
import Devices from '../pages/Devices';
import HwRegistration from '../pages/HwRegistration';

/**
 * 批次匯入與新增設備／硬體：進貨日期、原廠保固(年)、客戶保固(年)
 *
 * 與列表編輯相同的規則：
 *   原廠保固到期 = 進貨日期 + 原廠保固(年)
 *   客戶保固到期 = 安裝日期 + 客戶保固(年)
 * 有填年數就以算出來的為準，沒填年數照舊用填的到期日。
 */

const identity = (v) => (v ? String(v) : null);

describe('匯入欄位解析', () => {
  it.each([
    [3, 3], ['3', 3], ['3年', 3], ['3 年', 3], ['3 years', 3], ['1 year', 1], ['5Y', 5],
  ])('年數 %p → %p', (raw, years) => {
    expect(parseWarrantyYears(raw)).toEqual({ years, invalid: false });
  });

  it.each([[0], [6], ['2.5'], ['三年'], ['abc']])('不是 1~5 的整數就不收：%p', (raw) => {
    expect(parseWarrantyYears(raw)).toEqual({ years: null, invalid: true });
  });

  it('空白不算填錯', () => {
    expect(parseWarrantyYears('')).toEqual({ years: null, invalid: false });
    expect(parseWarrantyYears(undefined)).toEqual({ years: null, invalid: false });
  });

  it('讀出進貨日期與兩種年數（中文表頭）', () => {
    const r = readImportWarranty({ '進貨日期': '2026-10-01', '原廠保固(年)': 3, '客戶保固(年)': '2 年' }, identity);
    expect(r).toMatchObject({ stock_date: '2026-10-01', warranty_years: 3, customer_warranty_years: 2 });
  });

  it('英文表頭，Stock Data 手誤也認得', () => {
    const r = readImportWarranty({ 'Stock Data': '2026-09-01', 'Warranty Years': 1, 'Customer Warranty Years': 4 }, identity);
    expect(r).toMatchObject({ stock_date: '2026-09-01', warranty_years: 1, customer_warranty_years: 4 });
  });

  it('只有客戶保固年數時，不會被當成原廠保固年數', () => {
    const r = readImportWarranty({ 'Customer Warranty Years': 4 }, identity);
    expect(r).toMatchObject({ warranty_years: null, customer_warranty_years: 4 });
  });

  it('找到期日時跳過年數欄位，「原廠保固(年)」的 3 不會被當成到期日', () => {
    const row = { '原廠保固(年)': 3, '客戶保固(年)': 2 };
    expect(findColumnValue(row, ['原廠保固到期', '原廠保固'], YEARS_COLUMN_KEYWORDS)).toBe('');
    expect(findColumnValue(row, ['客戶保固到期', '客戶保固'], YEARS_COLUMN_KEYWORDS)).toBe('');
    expect(findColumnValue({ '原廠保固到期': '2029-01-01', ...row }, ['原廠保固到期', '原廠保固'], YEARS_COLUMN_KEYWORDS)).toBe('2029-01-01');
  });

  it('寫入參數：表單的年數是字串，轉成數字；空的是 null', () => {
    expect(warrantyInsertTail({ stock_date: '2026-10-01', warranty_years: '3', customer_warranty_years: '' })).toEqual(['2026-10-01', 3, null]);
    expect(warrantyInsertTail({})).toEqual([null, null, null]);
  });
});

describe('新增資產的查詢', () => {
  it('多了進貨日期與兩種年數（$16~$18），到期日依年數算', () => {
    const sql = queries.insertAssetRecord;
    expect(sql).toContain('stock_date, warranty_years, customer_warranty_years) VALUES');
    expect(sql).toContain("($16::date + make_interval(years => $17::smallint::int))::date ELSE $9::date END");
    expect(sql).toContain("($6::date + make_interval(years => $18::smallint::int))::date ELSE $7::date END");
  });
});

describe('重新匯入補齊空白欄位', () => {
  it('補齊參數：資產欄位依序，自訂屬性在最後（$13）', () => {
    const plan = buildFillPlan({ id: 9, sn: 'A' }, { stock_date: '2026-10-01', warranty_years: 3 });
    const params = buildFillParams(plan);
    expect(params).toHaveLength(1 + FILLABLE_COLUMNS.length + 1);
    expect(FILLABLE_COLUMNS.map((c) => c.key).slice(-3)).toEqual(['stock_date', 'warranty_years', 'customer_warranty_years']);
    expect(params.slice(9, 12)).toEqual(['2026-10-01', 3, null]);
  });

  it('補上進貨日期與年數，空的到期日跟著算出來', () => {
    const plan = buildFillPlan({ id: 9, sn: 'A' }, { stock_date: '2026-10-01', warranty_years: 3 });
    expect(plan.columns).toMatchObject({ stock_date: '2026-10-01', warranty_years: 3, warranty_expire: '2029-10-01' });
    expect(plan.labels).toEqual(['原廠保固到期', '進貨日期', '原廠保固（年）']);
  });

  it('系統已有年數，只補安裝日期：客戶保固到期跟著算', () => {
    const plan = buildFillPlan({ id: 9, sn: 'A', customer_warranty_years: 2 }, { installed_date: '2026-06-30' });
    expect(plan.columns).toMatchObject({ installed_date: '2026-06-30', customer_warranty_expire: '2028-06-30' });
  });

  it('既有到期日跟算出來的不同：基準日期與年數都不補，到期日也不動', () => {
    const existing = { id: 9, sn: 'A', warranty_expire: '2030-01-01' };
    const row = { stock_date: '2026-10-01', warranty_years: 3 };
    expect(buildFillPlan(existing, row)).toBeNull();
    expect(getKeptFieldLabels(existing, row)).toEqual(['進貨日期', '原廠保固（年）']);
  });

  it('既有到期日剛好就是算出來的：照補', () => {
    const plan = buildFillPlan({ id: 9, sn: 'A', warranty_expire: '2029-10-01' }, { stock_date: '2026-10-01', warranty_years: 3 });
    expect(Object.keys(plan.columns)).toEqual(['stock_date', 'warranty_years']);
  });
});

/** 產生一份 xlsx 檔 */
const makeFile = (rows, name = 'warranty.xlsx') => {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'S');
  const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([u8], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

describe('批次匯入', () => {
  const namedQueryMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    namedQueryMock.mockImplementation((query) => {
      if (query === 'findItemMaster' || query === 'insertItemMaster') return Promise.resolve({ success: true, rows: [{ id: 88 }] });
      if (query === 'insertAssetRecord') return Promise.resolve({ success: true, rows: [], rowCount: 1 });
      return Promise.resolve({ success: true, rows: [] });
    });
    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
      getDashboardStats: vi.fn(), saveFile: vi.fn(),
    };
  });

  const assetParams = (sn) => namedQueryMock.mock.calls.find((c) => c[0] === 'insertAssetRecord' && c[1][1] === sn)?.[1];

  const upload = async (Modal, rows) => {
    const { container } = render(<Modal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await userEvent.upload(container.querySelector('input[type="file"]'), makeFile(rows));
    await screen.findByText(/warranty\.xlsx/);
  };

  const ROWS = [
    {
      SN: 'IMP-W-001', Type: 'SERVER', Brand: 'DELL', Model: 'R760',
      'Project Date': '2026-10-20', 'Stock Date': '2026-10-01', '原廠保固(年)': 3, '客戶保固(年)': '2年',
      // 檔案也有到期日：有填年數就以算出來的為準
      'Warranty Expire': '2030-12-31',
    },
    { SN: 'IMP-W-002', Type: 'SERVER', Brand: 'DELL', Model: 'R760', '原廠保固(年)': 7, 'Warranty Expire': '2028-05-05' },
  ];

  it('設備：預覽列出進貨日期與年數，填錯的標出來；寫入時到期日依年數算', async () => {
    await upload(DeviceBatchImportModal, ROWS);
    for (const h of ['進貨日期', '原廠保固(年)', '客戶保固(年)']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
    }
    const row1 = screen.getByText('IMP-W-001').closest('tr');
    expect(within(row1).getByText('3 年')).toBeInTheDocument();
    expect(within(row1).getByText('2 年')).toBeInTheDocument();
    expect(within(row1).getByText('2029-10-01')).toBeInTheDocument();
    const row2 = screen.getByText('IMP-W-002').closest('tr');
    expect(within(row2).getByText(/⚠️ 7/)).toBeInTheDocument();

    await userEvent.click(screen.getByText(/確認(批次)?匯入/i));
    await waitFor(() => expect(assetParams('IMP-W-002')).toBeTruthy());

    const p1 = assetParams('IMP-W-001');
    expect([p1[5], p1[6], p1[8]]).toEqual(['2026-10-20', '2028-10-20', '2029-10-01']);
    expect(p1.slice(15)).toEqual(['2026-10-01', 3, 2]);
    // 年數填錯：留空，到期日用檔案裡的
    const p2 = assetParams('IMP-W-002');
    expect(p2[8]).toBe('2028-05-05');
    expect(p2.slice(15)).toEqual([null, null, null]);
  });

  it('硬體：同樣寫入進貨日期與年數', async () => {
    await upload(HwBatchImportModal, [{ ...ROWS[0], SN: 'IMP-HW-001', Type: 'NIC', Brand: 'Intel', Model: 'X710' }]);
    expect(screen.getByRole('columnheader', { name: '原廠保固(年)' })).toBeInTheDocument();
    await userEvent.click(screen.getByText(/確認(批次)?匯入/i));
    await waitFor(() => expect(assetParams('IMP-HW-001')).toBeTruthy());
    const p = assetParams('IMP-HW-001');
    expect([p[5], p[6], p[8]]).toEqual(['2026-10-20', '2028-10-20', '2029-10-01']);
    expect(p.slice(15)).toEqual(['2026-10-01', 3, 2]);
  });
});

describe('新增設備／硬體', () => {
  const namedQueryMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    namedQueryMock.mockImplementation((query) => {
      if (query === 'fetchDeviceBrands') return Promise.resolve({ success: true, rows: [{ id: 1, name: 'DELL' }] });
      if (query === 'fetchDeviceTypes') return Promise.resolve({ success: true, rows: [{ id: 1, name: 'SERVER' }] });
      if (query === 'fetchModelsByBrand') return Promise.resolve({ success: true, rows: [{ id: 1, name: 'R750' }] });
      if (query === 'fetchHwBrands') return Promise.resolve({ success: true, rows: [{ id: 1, name: 'Intel' }] });
      if (query === 'fetchHwTypes') return Promise.resolve({ success: true, rows: [{ name: 'NIC 網卡' }] });
      if (query === 'fetchHwModelsByBrand') return Promise.resolve({ success: true, rows: [{ name: 'E810' }] });
      if (query === 'findItemMaster' || query === 'insertItemMaster') return Promise.resolve({ success: true, rows: [{ id: 101 }] });
      if (query === 'insertAssetRecord') return Promise.resolve({ success: true, rows: [{ id: 1 }], rowCount: 1 });
      return Promise.resolve({ success: true, rows: [] });
    });
    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
      getDashboardStats: vi.fn(), saveFile: vi.fn(),
    };
  });

  const insertParams = () => namedQueryMock.mock.calls.find((c) => c[0] === 'insertAssetRecord')?.[1];
  const createLog = () => namedQueryMock.mock.calls.filter((c) => c[0] === 'insertAuditLog').map((c) => c[1]).find((p) => p[3] === 'CREATE');

  /** 填進貨日期、安裝日期，選原廠 3 年、客戶 2 年，確認到期日自動算出 */
  const fillWarranty = async (user) => {
    await user.type(screen.getByLabelText(/進貨日期/), '2026-10-01');
    await user.type(screen.getByLabelText(/安裝日期/), '2026-10-20');
    await user.selectOptions(screen.getByLabelText('原廠保固(年)'), '3');
    await user.selectOptions(screen.getByLabelText('客戶保固(年)'), '2');
    expect(screen.getByLabelText(/原廠保固到期/).value).toBe('2029-10-01');
    expect(screen.getByLabelText(/客戶保固到期/).value).toBe('2028-10-20');
  };

  const expectSaved = async (module) => {
    await waitFor(() => expect(insertParams()).toBeTruthy());
    const p = insertParams();
    expect([p[5], p[6], p[8]]).toEqual(['2026-10-20', '2028-10-20', '2029-10-01']);
    expect(p.slice(15)).toEqual(['2026-10-01', 3, 2]);
    await waitFor(() => expect(createLog()).toBeTruthy());
    const log = createLog();
    expect(log[4]).toBe(module);
    expect(log[9]).toMatchObject({
      stock_date: '2026-10-01', installed_date: '2026-10-20',
      warranty_years: '3', warranty_expire: '2029-10-01',
      customer_warranty_years: '2', customer_warranty_expire: '2028-10-20',
    });
  };

  it('設備列表的新增視窗', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><DeviceRegistrationModal isOpen={true} onClose={() => {}} onSuccess={() => {}} /></MemoryRouter>);
    await screen.findByText(/新增設備建檔/);
    await user.selectOptions(screen.getByLabelText(/廠牌/i), 'DELL');
    await user.selectOptions(screen.getByLabelText(/類型/i), 'SERVER');
    await waitFor(() => expect(screen.getByRole('option', { name: 'R750' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/型號/i), 'R750');
    await user.type(screen.getByPlaceholderText(/請輸入或掃描序號/), 'REG-DEV-001');
    await fillWarranty(user);
    await user.click(screen.getByRole('button', { name: /儲存並關閉/ }));
    await expectSaved('DEVICE');
  });

  it('設備建檔頁', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Devices /></MemoryRouter>);
    await waitFor(() => expect(screen.getByDisplayValue('DELL')).toBeInTheDocument());
    const typeSelect = screen.getAllByRole('combobox').find((sel) => [...sel.options].some((o) => o.value === 'SERVER'));
    await user.selectOptions(typeSelect, 'SERVER');
    await user.type(await screen.findByPlaceholderText(/序號/i), 'REG-DEV-002');
    await fillWarranty(user);
    await user.click(screen.getByRole('button', { name: '儲存設備資料' }));
    await expectSaved('DEVICE');
  });

  it('硬體列表的新增視窗', async () => {
    const user = userEvent.setup();
    render(<HwRegistrationModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'NIC 網卡' })).toBeInTheDocument());
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], 'NIC 網卡');
    await user.selectOptions(selects[1], 'Intel');
    await waitFor(() => expect(screen.getByRole('option', { name: 'E810' })).toBeInTheDocument());
    await user.selectOptions(selects[2], 'E810');
    await user.type(screen.getByPlaceholderText('請輸入或掃描序號'), 'REG-HW-001');
    await fillWarranty(user);
    await user.click(screen.getByRole('button', { name: /儲存並關閉/ }));
    await expectSaved('HARDWARE');
  });

  it('硬體建檔頁', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><HwRegistration /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('option', { name: 'NIC 網卡' })).toBeInTheDocument());
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], 'NIC 網卡');
    await user.selectOptions(selects[1], 'Intel');
    await waitFor(() => expect(screen.getByRole('option', { name: 'E810' })).toBeInTheDocument());
    await user.selectOptions(selects[2], 'E810');
    await user.type(screen.getByPlaceholderText('請輸入硬體序號'), 'REG-HW-002');
    await fillWarranty(user);
    await user.click(screen.getByRole('button', { name: /儲存硬體資料/ }));
    await expectSaved('HARDWARE');
  });

  it('沒填日期與保固：後三個參數都是 null，到期日照舊', async () => {
    const user = userEvent.setup();
    render(<HwRegistrationModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'NIC 網卡' })).toBeInTheDocument());
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], 'NIC 網卡');
    await user.selectOptions(selects[1], 'Intel');
    await waitFor(() => expect(screen.getByRole('option', { name: 'E810' })).toBeInTheDocument());
    await user.selectOptions(selects[2], 'E810');
    await user.type(screen.getByPlaceholderText('請輸入或掃描序號'), 'REG-HW-003');
    await user.click(screen.getByRole('button', { name: /儲存並關閉/ }));
    await waitFor(() => expect(insertParams()).toBeTruthy());
    const p = insertParams();
    expect([p[5], p[6], p[8]]).toEqual([null, null, null]);
    expect(p.slice(15)).toEqual([null, null, null]);
  });
});
