import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Outbound from '../pages/Outbound';
import LendOrderRegistrationModal from '../components/LendOrderRegistrationModal';
import LentOrderPrintModal from '../components/LentOrderPrintModal';
import { RoleContext } from '../context/RoleContext';
import { createRunTransactionMock } from './helpers/mockTransaction';
import { toDraft, fromDraft, draftChanges } from '../utils/lentPrintDraft';
import { queries } from '../../database/queries';

/**
 * 出貨單、借用單、借貨申請單：每個改到的欄位都記「變更前 → 變更後」
 *
 * 事件查詢看 details.changes 的表格，品項履歷只看敘述，
 * 所以敘述也要寫出「欄位：舊 → 新」；LOGO 記檔名。
 */

const auditLogsOf = (calls) => calls.filter((c) => c.query === 'insertAuditLog')
  .map(({ params: p }) => ({ actionType: p[3], module: p[4], target: p[6], summary: p[8], details: p[9] }));

describe('修改待出貨單：單頭、明細與回寫資產都記變更前後', () => {
  const DN = {
    id: 5, request_no: 'DN-20261016-01', customer: '元大證券', location: '台北機房', contact_info: '王大明',
    shipping_date: '2026-10-16', end_user: '元大投信', project_name: '', status: 'PENDING',
  };
  const ITEMS = [
    { id: 1, item_id: 101, sn: 'SRV-001', brand: 'Supermicro', model: 'SYS-1029P', category_name: '設備', quantity: 1, location: '台北機房', asset_id: 9 },
    { id: 2, item_id: 202, sn: 'HDD-002', brand: 'Seagate', model: 'ST4000', category_name: '硬體', quantity: 1, location: '台北機房', asset_id: 10 },
  ];
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    calls = [];
    window.alert = vi.fn();
    const namedQuery = vi.fn(async (query, params) => {
      calls.push({ query, params });
      if (query === 'fetchCustomers') return { success: true, rows: [{ id: 1, name: '元大證券' }] };
      if (query === 'fetchDNItems') return { success: true, rows: ITEMS };
      if (query === 'fetchAssetSideFieldsForOutbound') {
        return { success: true, rows: [
          { id: 9, sn: 'SRV-001', category_name: '設備', client: '元大證券', end_user: '元大投信', project_name: '', server_sn: null },
          { id: 11, sn: 'NIC-009', category_name: '硬體', client: '元大證券', end_user: '', project_name: '', server_sn: 'SRV-001' },
        ] };
      }
      if (query === 'updateOutboundRequestHeader') return { success: true, rows: [{ id: 5 }] };
      return { success: true, rows: [] };
    });
    window.electronAPI = { namedQuery, runTransaction: createRunTransactionMock(namedQuery) };
  });

  it('單頭、明細（地點、移除的列）與資產的 End-user 都寫出舊 → 新', async () => {
    const { container } = render(
      <RoleContext.Provider value={{ authUser: { id: 1, full_name: '測試管理員', role: 'ADMIN' } }}>
        <BrowserRouter><Outbound isModalMode editingDn={DN} /></BrowserRouter>
      </RoleContext.Provider>
    );
    await screen.findByText('HDD-002');

    fireEvent.change(screen.getByPlaceholderText('出貨地點 / 備註'), { target: { value: '新竹機房' } });
    fireEvent.change(screen.getByLabelText(/^End-user/), { target: { value: '元大期貨' } });
    const locInputs = container.querySelectorAll('.item-loc-input');
    fireEvent.change(locInputs[0], { target: { value: 'A 棟 3F' } });
    fireEvent.click(container.querySelectorAll('.btn-del-item')[1]);
    await waitFor(() => expect(screen.queryByText('HDD-002')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /儲存修改/ }));
    await waitFor(() => expect(auditLogsOf(calls).find((l) => l.module === 'OUTBOUND')).toBeDefined());

    // 讀資產原值在寫入之前
    const snapIdx = calls.findIndex((c) => c.query === 'fetchAssetSideFieldsForOutbound');
    expect(snapIdx).toBeGreaterThan(-1);
    expect(calls[snapIdx].params[0]).toEqual(['SRV-001']);
    expect(snapIdx).toBeLessThan(calls.findIndex((c) => c.query === 'updateOutboundRequestHeader'));

    const log = auditLogsOf(calls).find((l) => l.module === 'OUTBOUND');
    expect(log.actionType).toBe('UPDATE');
    expect(log.summary).toContain('出貨地點：台北機房 → 新竹機房');
    expect(log.summary).toContain('End-user：元大投信 → 元大期貨');
    expect(log.summary).toContain('明細 Supermicro SYS-1029P (SRV-001) 地點：台北機房 → A 棟 3F');
    expect(log.summary).toContain('移除明細：Seagate ST4000 (HDD-002) → （空白）');
    expect(log.details.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'location', from: '台北機房', to: '新竹機房' }),
      expect.objectContaining({ field: 'end_user', from: '元大投信', to: '元大期貨' }),
      expect.objectContaining({ field: 'items.location', from: '台北機房', to: 'A 棟 3F' }),
    ]));
    expect(log.details.removedItems).toEqual([expect.objectContaining({ sn: 'HDD-002' })]);
    // 原本的 details 仍在
    expect(log.details).toMatchObject({ dnNumber: 'DN-20261016-01', end_user: '元大期貨' });
    // 沒改的欄位不列
    expect(log.details.changes.some((c) => c.field === 'customer')).toBe(false);

    // 每台被改寫的資產各一筆
    const dev = auditLogsOf(calls).find((l) => l.module === 'DEVICE' && l.target === 'SRV-001');
    expect(dev.actionType).toBe('UPDATE');
    expect(dev.summary).toContain('End-user：元大投信 → 元大期貨');
    expect(dev.details.changes).toEqual([expect.objectContaining({ field: 'end_user', from: '元大投信', to: '元大期貨' })]);
    const hw = auditLogsOf(calls).find((l) => l.module === 'HARDWARE' && l.target === 'NIC-009');
    expect(hw.summary).toContain('End-user：（空白） → 元大期貨');
  });

  it('讀資產原值的查詢：含搭載在單上設備底下的硬體', () => {
    expect(queries.fetchAssetSideFieldsForOutbound).toContain('ANY($1::text[])');
    expect(queries.fetchAssetSideFieldsForOutbound).toContain("custom_attributes->>'server_sn'");
  });
});

describe('修改借用單：記 UPDATE 與變更前後', () => {
  const DN = {
    id: 42, request_no: 'DN-20260914-03', customer: '原客戶', location: '原地點', contact_info: '王先生',
    shipping_date: '2026-09-14', expected_return_date: '2026-09-30', project_name: '', status: 'PENDING', request_type: 'LEND',
  };
  const ITEMS = [
    { id: 1, item_id: 10, brand: 'DELL', model: 'R750', category_name: '設備', sn: 'SN-1', quantity: 1, location: '原地點', purpose: '運作測試' },
    { id: 2, item_id: 11, brand: 'DELL', model: 'R650', category_name: '設備', sn: 'SN-2', quantity: 1, location: '原地點', purpose: '運作測試' },
  ];
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    calls = [];
    window.alert = vi.fn();
    const namedQuery = vi.fn(async (query, params) => {
      calls.push({ query, params });
      if (query === 'fetchDNItems') return { success: true, rows: ITEMS };
      if (query === 'fetchCustomers') return { success: true, rows: [{ id: 1, name: '原客戶' }] };
      if (query === 'countOutboundRequests') return { success: true, rows: [{ count: 1 }] };
      return { success: true, rows: [], rowCount: 1 };
    });
    window.electronAPI = { namedQuery, runTransaction: createRunTransactionMock(namedQuery) };
  });

  it('單頭預計歸還日、明細用途與地點、移除的列', async () => {
    const { container } = render(
      <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, full_name: 'Admin' }, setAuthUser: vi.fn() }}>
        <LendOrderRegistrationModal isOpen editingDn={DN} onClose={vi.fn()} onSuccess={vi.fn()} />
      </RoleContext.Provider>
    );
    await screen.findByText(/SN-2/);

    fireEvent.change(screen.getByDisplayValue('2026-09-30'), { target: { value: '2026-10-15' } });
    fireEvent.change(screen.getAllByPlaceholderText('用途 (如: 運作測試)')[0], { target: { value: 'POC 驗證' } });
    fireEvent.change(container.querySelectorAll('.item-loc-input')[0], { target: { value: '客戶機房' } });
    fireEvent.click(container.querySelectorAll('.btn-del-item')[1]);
    await waitFor(() => expect(screen.queryByText(/SN-2/)).not.toBeInTheDocument());

    await userEvent.click(screen.getByText(/儲存修改/));
    await waitFor(() => expect(auditLogsOf(calls).find((l) => l.module === 'LENT')).toBeDefined());

    const log = auditLogsOf(calls).find((l) => l.module === 'LENT');
    expect(log.actionType).toBe('UPDATE');
    expect(log.summary).toContain('預計歸還日：2026-09-30 → 2026-10-15');
    expect(log.summary).toContain('明細 DELL R750 (SN-1) 用途：運作測試 → POC 驗證');
    expect(log.summary).toContain('明細 DELL R750 (SN-1) 地點：原地點 → 客戶機房');
    expect(log.summary).toContain('移除明細：DELL R650 (SN-2) → （空白）');
    expect(log.details.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'expected_return_date', from: '2026-09-30', to: '2026-10-15' }),
      expect.objectContaining({ field: 'items.purpose', from: '運作測試', to: 'POC 驗證' }),
    ]));
    expect(log.details).toMatchObject({ dnNumber: 'DN-20260914-03', request_type: 'LEND' });
    // 單頭沒改的欄位不列
    expect(log.details.changes.some((c) => c.field === 'customer' || c.field === 'shipping_date')).toBe(false);
  });
});

describe('借貨申請單預覽：儲存與還原記變更前後，LOGO 記檔名', () => {
  const DN = {
    id: 101, request_no: 'DN-20260829-01', customer: '富邦證券', location: '台北市仁愛路',
    contact_info: 'David Chen (0918-600-800)', shipping_date: '2026-08-29', expected_return_date: '2026-09-05', request_type: 'LEND',
  };
  const ITEMS = [{ brand: 'Supermicro', model: 'SYS-1029P', sn: 'SMC001', quantity: 1, specification: '1U' }];
  let saved;

  beforeEach(() => {
    vi.clearAllMocks();
    saved = null;
    window.confirm = vi.fn(() => true);
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn(async (q, p) => {
        if (q === 'fetchLentPrintDraft') return { success: true, rows: [{ print_draft: saved }] };
        if (q === 'saveLentPrintDraft') { saved = p[0]; return { success: true, rows: [{ id: p[1] }] }; }
        if (q === 'clearLentPrintDraft') { saved = null; return { success: true, rows: [{ id: p[0] }] }; }
        return { success: true, rows: [] };
      }),
    };
  });

  const calls = (q) => window.electronAPI.namedQuery.mock.calls.filter(([n]) => n === q).map(([, p]) => p);
  const lentLogs = () => calls('insertAuditLog').map((p) => ({ actionType: p[3], module: p[4], summary: p[8], details: p[9] }))
    .filter((l) => l.module === 'LENT');

  const open = async () => {
    const before = calls('fetchLentPrintDraft').length;
    const utils = render(<LentOrderPrintModal isOpen onClose={vi.fn()} dnData={DN} items={ITEMS} />);
    await waitFor(() => expect(calls('fetchLentPrintDraft').slice(before)).toEqual([[101]]));
    return utils;
  };

  it('改聯絡人並換 LOGO：敘述與 changes 都有舊值與新值，LOGO 記檔名、不記圖片內容', async () => {
    const { container } = await open();
    await userEvent.click(screen.getByText('✏️ 進入即時編輯模式'));
    const input = [...container.querySelectorAll('.loan-edit-input')].find((el) => el.value === 'David Chen');
    await userEvent.clear(input);
    await userEvent.type(input, '王小明');

    const file = new File(['logo-bytes'], 'fubon-logo.png', { type: 'image/png' });
    await userEvent.upload(container.querySelector('input[type="file"]'), file);
    await waitFor(() => expect(screen.getByRole('button', { name: /^儲存$/ })).toBeEnabled());

    await userEvent.click(screen.getByRole('button', { name: /^儲存$/ }));
    await waitFor(() => expect(lentLogs()).toHaveLength(1));
    const log = lentLogs()[0];
    expect(log.actionType).toBe('UPDATE');
    expect(log.summary).toContain('客戶聯絡人：David Chen → 王小明');
    expect(log.summary).toContain('LOGO：範本 LOGO → fubon-logo.png');
    expect(log.details.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'custPerson', from: 'David Chen', to: '王小明' }),
      expect.objectContaining({ field: 'customLogo', from: '範本 LOGO', to: 'fubon-logo.png', kind: 'file' }),
    ]));
    expect(JSON.stringify(log.details)).not.toContain('base64');
    // 檔名也存進這張單的草稿
    expect(saved.form.customLogoName).toBe('fubon-logo.png');
  });

  it('還原預設：敘述列出被清掉的值', async () => {
    saved = toDraft({ custPerson: '王小明', termsList: ['只有一條'] });
    await open();
    expect(await screen.findByText('王小明')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /還原預設/ }));
    await waitFor(() => expect(lentLogs()).toHaveLength(1));
    const log = lentLogs()[0];
    expect(log.summary).toContain('借貨申請單 [DN-20260829-01] 還原為預設內容：');
    expect(log.summary).toContain('客戶聯絡人：王小明 → David Chen');
    expect(log.summary).toContain('注意事項第 1 條：只有一條 → ');
    expect(log.details.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'custPerson', from: '王小明', to: 'David Chen' }),
    ]));
  });

  it('舊的存檔沒有 LOGO 檔名：照樣讀得回來，紀錄寫「自訂 LOGO」', () => {
    const legacy = { version: 1, form: { customLogo: 'data:image/png;base64,AAAA', custPerson: 'A' } };
    expect(fromDraft(legacy)).toEqual({ customLogo: 'data:image/png;base64,AAAA', custPerson: 'A' });
    expect(draftChanges(fromDraft(legacy), { ...fromDraft(legacy), customLogo: 'data:image/png;base64,BBBB', customLogoName: 'new.png' }))
      .toEqual([{ field: 'customLogo', label: 'LOGO', from: '自訂 LOGO', to: 'new.png', kind: 'file' }]);
  });

  it('明細逐列、範本與版型轉成名稱', () => {
    const changes = draftChanges(
      { selectedPreset: 'PRESET_A', headerLayout: 'STANDARD', tableRows: [{ model: 'R750', sn: 'S1', purpose: '測試' }] },
      { selectedPreset: 'PRESET_B', headerLayout: 'CENTERED', tableRows: [{ model: 'R750', sn: 'S2', purpose: '測試' }] },
      { presetLabel: (k) => ({ PRESET_A: '版本 A', PRESET_B: '版本 B' })[k] },
    );
    expect(changes).toEqual([
      { field: 'selectedPreset', label: '公司範本', from: '版本 A', to: '版本 B' },
      { field: 'headerLayout', label: '頁首版型', from: '標準商務 (Logo左 / 文字右)', to: '品牌置中 (Logo中 / 文字中 - 上下)' },
      { field: 'tableRows', label: '借貨明細第 1 列', from: 'R750 / S1 / 測試', to: 'R750 / S2 / 測試' },
    ]);
  });

  it('LOGO 太大沒存，檔名也不存', () => {
    const d = toDraft({ customLogo: 'x'.repeat(2 * 1024 * 1024), customLogoName: 'big.png' });
    expect(d.form.customLogo).toBeNull();
    expect(d.form.customLogoName).toBeNull();
  });
});
