import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import * as XLSX from 'xlsx';
import InboundList from '../pages/InboundList';
import DNList from '../pages/DNList';
import { RoleContext } from '../context/RoleContext';
import { buildInboundSheet, buildDnSheet, safeFileName, ymd } from '../utils/detailExcel';

// 不真的寫檔：攔下 writeFile，檢查產生的活頁簿
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, writeFile: vi.fn() };
});

/**
 * 進貨單明細、出貨單明細下載 Excel
 *
 * 一張單一個工作表：上面是單據資訊，空一列後是品項表，最後一列合計數量。
 */
const INBOUND = {
  id: 21, order_no: 'IN-20261002-01', status: 'COMPLETED', order_date: '2026-10-02', effective_date: '2026-10-02',
  created_at: '2026-10-02T09:36:37.000Z', partner_id: 3, partner_name: '元景資訊', invoice_no: 'INV-1',
  attachments: '[]', item_count: 2, creator_name: 'Rio',
};
const INBOUND_ITEMS = [
  { id: 1, item_id: 7, sn: 'E7ADE593', quantity: 1, brand: 'INTEL', type: 'CPU', model: 'XEON W7-2595X', specification: '26C', category_name: '硬體', order_source: 'PO-1', remarks: '急件', po_order_no: 'PO-20261001-01' },
  { id: 2, item_id: 8, sn: null, quantity: 10, brand: 'CISCO', type: 'GBIC', model: '10G-SR', specification: '', category_name: '耗材', order_source: null, remarks: null, po_order_no: null },
];
const DN = {
  id: 7, request_no: 'DN-20261002-02', request_type: 'SALE', customer: '凱基證券', location: 'BQIDC 5F', contact_info: '王 0912',
  shipping_date: '2026-10-02', created_at: '2026-10-02T09:00:00.000Z', status: 'SHIPPED', item_count: 2, end_user: '凱基期貨', project_name: 'HFT',
  creator_name: 'Admin', signed_doc_url: null, signed_doc_name: null,
};
const DN_ITEMS = [
  { id: 1, item_id: 10, brand: 'ARISTA', model: 'DCS-7010TX', specification: '48P', type: 'SWITCH', category_name: '設備', sn: 'HBG254808R4', quantity: 1, location: 'BQIDC 5F' },
  { id: 2, item_id: 11, brand: 'METECH', model: '10G-SR', specification: '', type: 'GBIC', category_name: '耗材', sn: null, quantity: 4, location: 'BQIDC 5F', lab_asset_id: 9, lab_device_sn: 'SRV-1' },
];

describe('產生工作表內容', () => {
  it('進貨單：單據資訊、品項（類型／廠牌／型號／規格分開）、合計', () => {
    const aoa = buildInboundSheet(INBOUND, INBOUND_ITEMS);
    expect(aoa.slice(0, 6)).toEqual([
      ['進貨單明細', 'IN-20261002-01'], ['供應商', '元景資訊'], ['進貨日期', '2026-10-02'],
      ['發票號碼', 'INV-1'], ['狀態', '已進貨'], ['建立者', 'Rio'],
    ]);
    expect(aoa[6]).toEqual([]);
    expect(aoa[7]).toEqual(['來源採購單', '類別', '類型', '廠牌', '型號', '規格', '序號 (S/N)', '訂單來源', '備註', '數量']);
    expect(aoa[8]).toEqual(['PO-20261001-01', '硬體', 'CPU', 'INTEL', 'XEON W7-2595X', '26C', 'E7ADE593', 'PO-1', '急件', 1]);
    expect(aoa[9]).toEqual(['無 (非採購入庫)', '耗材', 'GBIC', 'CISCO', '10G-SR', '', '', '', '', 10]);
    expect(aoa.at(-1)).toEqual(['合計', '', '', '', '', '', '', '', '', 11]);
  });

  it('進貨單待確認、沒有供應商', () => {
    const aoa = buildInboundSheet({ ...INBOUND, partner_name: null }, [], { isDraft: true });
    expect(aoa[1]).toEqual(['供應商', '待補填']);
    expect(aoa[4]).toEqual(['狀態', '待確認・尚未入庫']);
  });

  it('出貨單：單據資訊（含 End-user、專案）、品項、掛載耗材註明設備、合計', () => {
    const aoa = buildDnSheet(DN, DN_ITEMS);
    expect(aoa.slice(0, 9)).toEqual([
      ['出貨單明細', 'DN-20261002-02'], ['客戶', '凱基證券'], ['聯絡資訊', '王 0912'], ['出貨日期', '2026-10-02'],
      ['出貨地點', 'BQIDC 5F'], ['End-user', '凱基期貨'], ['專案', 'HFT'], ['狀態', '已出貨'], ['建立者', 'Admin'],
    ]);
    expect(aoa[10]).toEqual(['類型', '廠牌', '型號', '規格', '序號 (S/N)', '數量', '發送位置', '備註']);
    expect(aoa[11]).toEqual(['SWITCH', 'ARISTA', 'DCS-7010TX', '48P', 'HBG254808R4', 1, 'BQIDC 5F', '']);
    expect(aoa[12][7]).toBe('掛載於 SRV-1，隨設備出貨（從 LAB 扣）');
    expect(aoa.at(-1)).toEqual(['合計', '', '', '', '', 5, '', '']);
  });

  it('日期：DATE 字串照用；時間點換成本地日期；Date 物件也行', () => {
    expect(ymd('2026-10-15')).toBe('2026-10-15');
    expect(ymd(new Date(2026, 9, 15))).toBe('2026-10-15');
    const local = new Date(2026, 9, 15, 0, 30);
    expect(ymd(local.toISOString())).toBe('2026-10-15');
    expect(ymd(null)).toBe('');
  });

  it('檔名不能有的字元換掉', () => {
    expect(safeFileName('出貨單明細_DN/01:A')).toBe('出貨單明細_DN_01_A');
  });
});

describe('明細視窗的「下載 Excel」', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn(async (query) => {
        if (query === 'fetchInboundList') return { success: true, rows: [INBOUND] };
        if (query === 'fetchInboundItems') return { success: true, rows: INBOUND_ITEMS };
        if (query === 'fetchDNList') return { success: true, rows: [DN] };
        if (query === 'fetchDNItems') return { success: true, rows: DN_ITEMS };
        return { success: true, rows: [] };
      }),
      runTransaction: vi.fn(),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const wrap = (node) => (
    <MemoryRouter>
      <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1 }, setAuthUser: vi.fn() }}>{node}</RoleContext.Provider>
    </MemoryRouter>
  );

  /** writeFile 收到的活頁簿 → 第一個工作表的內容 */
  const written = () => {
    const [wb, name] = XLSX.writeFile.mock.calls[0];
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return { name, sheetName: wb.SheetNames[0], rows: XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) };
  };

  it('進貨單明細', async () => {
    render(wrap(<InboundList />));
    // 已進貨的單在「已進貨」頁籤
    await userEvent.click(await screen.findByTestId('inbound-tab-history'));
    await screen.findByText(INBOUND.order_no);
    await userEvent.click(screen.getByLabelText('查看進貨明細'));
    await screen.findByText('E7ADE593');
    await userEvent.click(screen.getByRole('button', { name: /下載 Excel/ }));
    const { name, sheetName, rows } = written();
    expect(name).toBe('進貨單明細_IN-20261002-01.xlsx');
    expect(sheetName).toBe('進貨單明細');
    expect(rows[0]).toEqual(['進貨單明細', 'IN-20261002-01', '', '', '', '', '', '', '', '']);
    expect(rows.some((r) => r.includes('E7ADE593'))).toBe(true);
  });

  it('出貨單明細', async () => {
    render(wrap(<DNList />));
    await userEvent.click(await screen.findByTestId('dn-tab-history'));
    const row = (await screen.findByText(DN.request_no)).closest('tr');
    fireEvent.click(within(row).getByTitle('查看詳情'));
    await waitFor(() => expect(screen.getByText('HBG254808R4')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /下載 Excel/ }));
    const { name, sheetName, rows } = written();
    expect(name).toBe('出貨單明細_DN-20261002-02.xlsx');
    expect(sheetName).toBe('出貨單明細');
    expect(rows.find((r) => r[0] === 'End-user')[1]).toBe('凱基期貨');
    expect(rows.some((r) => r.includes('HBG254808R4'))).toBe(true);
  });
});
