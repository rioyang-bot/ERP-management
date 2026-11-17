import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { renderInboundHistory } from './helpers/renderInboundList';
import { createRunTransactionMock } from './helpers/mockTransaction';
import ProcurementRegistration from '../pages/Purchasing';
import ProcurementList from '../pages/ProcurementList';
import { RoleContext } from '../context/RoleContext';

/**
 * 進貨單、採購單的事件紀錄：每個改到的欄位都記「變更前 → 變更後」，
 * 附件記檔名（新增、移除的檔案），刪除時留下整張單的快照。
 */
let namedQuery;
let handlers;

const auditLogs = () => namedQuery.mock.calls
  .filter(([q]) => q === 'insertAuditLog')
  .map(([, p]) => ({ action: p[3], module: p[4], targetId: p[6], summary: p[8], details: p[9] }));

const setup = (overrides = {}) => {
  handlers = { ...overrides };
  namedQuery = vi.fn((query, params) => {
    const h = handlers[query];
    if (typeof h === 'function') return Promise.resolve(h(params));
    if (h) return Promise.resolve(h);
    return Promise.resolve({ success: true, rows: [] });
  });
  window.electronAPI = {
    namedQuery,
    runTransaction: createRunTransactionMock((...args) => namedQuery(...args)),
    saveFile: vi.fn().mockResolvedValue({ success: true, fileName: 'stored-c.pdf' }),
    releaseUploads: vi.fn().mockResolvedValue({ success: true, released: [], kept: [] }),
    getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
  vi.spyOn(window, 'confirm').mockImplementation(() => true);
});

describe('進貨單：編輯單頭記變更前後', () => {
  const ORDER = {
    id: 11, order_no: 'IN-20260715-01', status: 'COMPLETED',
    order_date: '2026-07-15', effective_date: '2026-07-15', created_at: '2026-07-15T02:00:00.000Z',
    partner_id: 7, partner_name: '元大Yuanta', invoice_no: 'INV-001',
    attachments: JSON.stringify([
      { originalName: 'a.pdf', fileName: 'stored-a.pdf' },
      { originalName: 'b.pdf', fileName: 'stored-b.pdf' },
    ]),
  };

  it('供應商記名稱、發票號碼、附件新增與移除的檔名', async () => {
    setup({
      fetchInboundList: { success: true, rows: [ORDER] },
      fetchSuppliers: { success: true, rows: [{ id: 7, name: '元大Yuanta' }, { id: 8, name: '凱基' }] },
      updateInboundOrderHeader: { success: true, rows: [{ id: 11 }] },
    });
    renderInboundHistory();
    await userEvent.click(await screen.findByLabelText('編輯進貨單'));
    await screen.findByLabelText('進貨日期');

    fireEvent.change(document.getElementById('edit-inbound-partner'), { target: { value: '8' } });
    const invoice = screen.getByDisplayValue('INV-001');
    await userEvent.clear(invoice);
    await userEvent.type(invoice, 'INV-002');
    await userEvent.click(screen.getByLabelText('移除附件 b.pdf'));
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['x'], 'c.pdf', { type: 'application/pdf' });
    file.arrayBuffer = () => Promise.resolve(new ArrayBuffer(1));
    fireEvent.change(fileInput, { target: { files: [file] } });
    await screen.findByLabelText('移除附件 c.pdf');

    await userEvent.click(screen.getByRole('button', { name: /儲存/ }));
    await waitFor(() => expect(auditLogs().some((l) => l.module === 'INBOUND')).toBe(true));

    const log = auditLogs().find((l) => l.module === 'INBOUND');
    expect(log.action).toBe('UPDATE');
    expect(log.summary).toBe('修改進貨單 [IN-20260715-01]：供應商：元大Yuanta → 凱基；發票號碼：INV-001 → INV-002；附件：a.pdf、b.pdf → a.pdf、c.pdf');
    expect(log.details.changes).toEqual([
      { field: 'partner', label: '供應商', from: '元大Yuanta', to: '凱基' },
      { field: 'invoice_no', label: '發票號碼', from: 'INV-001', to: 'INV-002' },
      { field: 'attachments', label: '附件', from: 'a.pdf、b.pdf', to: 'a.pdf、c.pdf', kind: 'file' },
    ]);
    expect(log.details.addedFiles).toEqual([{ originalName: 'c.pdf', fileName: 'stored-c.pdf' }]);
    expect(log.details.removedFiles).toEqual([{ originalName: 'b.pdf', fileName: 'stored-b.pdf' }]);
    // 既有的 details 欄位保留
    expect(log.details).toMatchObject({ orderNo: 'IN-20260715-01', invoiceNo: 'INV-002', attachmentsCount: 2 });
    expect(JSON.stringify(log.details)).not.toContain('base64');
  });
});

describe('進貨單：統一填寫訂單來源記每一支序號的變更前後', () => {
  const ORDER = {
    id: 11, order_no: 'IN-20260921-01', status: 'COMPLETED', order_date: '2026-09-21', effective_date: '2026-09-21',
    created_at: '2026-09-21T10:00:00.000Z', partner_id: null, partner_name: null, invoice_no: null, attachments: '[]',
  };
  const ITEMS = [
    { id: 1, sn: 'SFOC303000D7', quantity: 1, brand: 'CISCO', model: 'X25', category_name: '硬體', order_source: null },
    { id: 2, sn: 'SFOC303000CB', quantity: 1, brand: 'CISCO', model: 'X25', category_name: '硬體', order_source: 'PO-舊' },
  ];

  it('覆蓋時進貨單與每一支資產都記「訂單來源：舊 → 新」', async () => {
    setup({
      fetchInboundList: { success: true, rows: [ORDER] },
      fetchInboundItems: { success: true, rows: ITEMS },
      updateOrderSourceByInboundOrder: { success: true, rows: [{ id: 1, sn: 'SFOC303000D7' }, { id: 2, sn: 'SFOC303000CB' }] },
    });
    renderInboundHistory();
    await userEvent.click(await screen.findByLabelText('編輯進貨單'));
    await screen.findByText('SFOC303000D7');
    await userEvent.type(screen.getByLabelText('統一填寫訂單來源'), 'PO-新');
    await userEvent.click(screen.getByRole('button', { name: '統一填寫' }));

    await waitFor(() => expect(auditLogs().filter((l) => l.module === 'HARDWARE')).toHaveLength(2));
    const inbound = auditLogs().find((l) => l.module === 'INBOUND');
    expect(inbound.summary).toBe('統一填寫訂單來源「PO-新」，共 2 筆：訂單來源（SFOC303000D7）：（空白） → PO-新；訂單來源（SFOC303000CB）：PO-舊 → PO-新');
    expect(inbound.details).toMatchObject({ orderSource: 'PO-新', changed: 2 });

    const hw = auditLogs().find((l) => l.targetId === 'SFOC303000CB');
    expect(hw.action).toBe('UPDATE');
    expect(hw.summary).toContain('訂單來源：PO-舊 → PO-新');
    expect(hw.details.changes).toEqual([{ field: 'order_source', label: '訂單來源', from: 'PO-舊', to: 'PO-新' }]);
  });
});

describe('進貨單：刪除留下快照，只記真的刪掉的品項主檔', () => {
  const ORDER = {
    id: 11, order_no: 'IN-20260715-01', status: 'COMPLETED',
    order_date: '2026-07-15', effective_date: '2026-07-15', created_at: '2026-07-15T02:00:00.000Z',
    partner_id: 7, partner_name: '元大Yuanta', invoice_no: 'INV-001',
    attachments: JSON.stringify([{ originalName: '發票.pdf', fileName: 'stored-inv.pdf' }]),
  };
  const ITEMS = [
    { id: 1, item_id: 501, sn: 'SN-A', quantity: 1, brand: 'DELL', type: 'SERVER', model: 'R760', specification: '2U', category_name: '設備' },
    { id: 2, item_id: 502, sn: null, quantity: 5, brand: 'METECH', model: 'LC-LC', category_name: '耗材', unit: '條' },
  ];

  it('單頭、明細、附件檔名都進快照；孤兒品項只記刪除成功的那一個', async () => {
    setup({
      fetchInboundList: { success: true, rows: [ORDER] },
      fetchSuppliers: { success: true, rows: [{ id: 7, name: '元大Yuanta' }] },
      fetchInboundItems: { success: true, rows: ITEMS },
      fetchInboundAssetUsage: { success: true, rows: [] },
      fetchOrphanItemMasters: { success: true, rows: [
        { id: 501, brand: 'DELL', type: 'SERVER', model: 'R760', specification: '2U', category_name: '設備' },
        { id: 502, brand: 'METECH', type: null, model: 'LC-LC', specification: null, category_name: '耗材' },
      ] },
      deleteItemMasterIfOrphan: ([id]) => ({ success: true, rows: id === 501 ? [{ id: 501 }] : [] }),
    });
    renderInboundHistory();
    await userEvent.click(await screen.findByLabelText('編輯進貨單'));
    await screen.findByText('SN-A');
    await userEvent.click(screen.getByRole('button', { name: /刪除進貨單/ }));

    await waitFor(() => expect(auditLogs().some((l) => l.summary.includes('未使用品項'))).toBe(true));
    const del = auditLogs().find((l) => l.action === 'DELETE' && l.summary.startsWith('刪除進貨單 [IN-20260715-01]（'));
    expect(del.summary).toContain('供應商：元大Yuanta');
    expect(del.summary).toContain('發票號碼：INV-001');
    expect(del.summary).toContain('附件：發票.pdf');
    expect(del.summary).toContain('DELL SERVER R760 / 2U [SN-A] ×1');
    expect(del.details).toMatchObject({ orderNo: 'IN-20260715-01', items: 2, assets: 1 });
    expect(del.details.snapshot.header).toMatchObject({ supplier: '元大Yuanta', invoiceNo: 'INV-001', orderDate: '2026-07-15', attachments: ['發票.pdf'] });
    expect(del.details.snapshot.items).toHaveLength(2);
    expect(del.details.snapshot.items[1]).toMatchObject({ model: 'LC-LC', quantity: 5 });

    const masters = auditLogs().find((l) => l.summary.includes('未使用品項'));
    expect(masters.summary).toBe('刪除進貨單 [IN-20260715-01] 後一併移除 1 個未使用品項：DELL SERVER R760 / 2U');
    expect(masters.details.removedMasters).toEqual([501]);
    expect(masters.details.removedMasterDetails).toEqual([
      { id: 501, category: '設備', brand: 'DELL', type: 'SERVER', model: 'R760', specification: '2U' },
    ]);
  });
});

describe('採購單：修改記每一筆明細、備註與附件的變更前後', () => {
  const authUser = { id: 1, username: 'METECH', full_name: '系統管理員', role: 'ADMIN' };
  const ROWS = [
    { id: 1, order_no: 'PO-1', category_id: 1, category_name: '設備', partner_id: 1, partner_name: '供應商A',
      item_type: '伺服器', brand: 'Dell', model: 'R750', specification: '2U', unit: '台', quantity: 2, received_quantity: 0,
      remarks: '舊備註', attachments: [{ originalName: 'a.pdf', fileName: 'stored-a.pdf' }, { originalName: 'b.pdf', fileName: 'stored-b.pdf' }] },
    { id: 2, order_no: 'PO-1', category_id: 1, category_name: '設備', partner_id: 1, partner_name: '供應商A',
      item_type: 'switch', brand: 'Cisco', model: 'C3548', specification: '48 Port', unit: '台', quantity: 1, received_quantity: 0,
      remarks: '舊備註', attachments: [] },
  ];

  it('數量、移除的明細、備註、移除的附件都記變更前後', async () => {
    setup({
      fetchSuppliers: { success: true, rows: [{ id: 1, name: '供應商A' }] },
      fetchCategories: { success: true, rows: [{ id: 1, name: '設備' }] },
      fetchPurchaseRecordsByOrder: { success: true, rows: ROWS },
      deletePurchaseRecordById: ([id]) => ({ success: true, rows: [{ id }] }),
    });
    render(
      <RoleContext.Provider value={{ authUser, role: 'ADMIN' }}>
        <MemoryRouter>
          <ProcurementRegistration editMode initOrderNo="PO-1" onClose={vi.fn()} />
        </MemoryRouter>
      </RoleContext.Provider>
    );
    await screen.findByText('b.pdf');

    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '3' } });
    fireEvent.click(screen.getAllByTitle('刪除此項')[1]);
    fireEvent.change(screen.getByPlaceholderText('請輸入此採購案的備註說明（選填）...'), { target: { value: '新備註' } });
    fireEvent.click(screen.getByText('b.pdf').parentElement.parentElement.querySelector('button'));
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }));

    await waitFor(() => expect(auditLogs().some((l) => l.module === 'PURCHASE')).toBe(true));
    const log = auditLogs().find((l) => l.module === 'PURCHASE');
    expect(log.action).toBe('UPDATE');
    expect(log.summary).toBe('修改採購單 [PO-1] 共 1 個品項：[Dell 伺服器 R750 / 2U] 數量：2 → 3；移除品項：Cisco switch C3548 / 48 Port ×1 → （空白）；備註：舊備註 → 新備註；附件：a.pdf、b.pdf → a.pdf');
    expect(log.details.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'quantity', from: '2', to: '3' }),
      expect.objectContaining({ field: 'remarks', from: '舊備註', to: '新備註' }),
      expect.objectContaining({ field: 'attachments', from: 'a.pdf、b.pdf', to: 'a.pdf', kind: 'file' }),
    ]));
    expect(log.details.removedLines).toEqual([expect.objectContaining({ id: 2, model: 'C3548', quantity: 1 })]);
    expect(log.details.removedFiles).toEqual([{ originalName: 'b.pdf', fileName: 'stored-b.pdf' }]);
    expect(log.details).toMatchObject({ orderNo: 'PO-1', itemsCount: 1, remarks: '新備註' });
  });
});

describe('採購單：刪除留下明細與附件的快照', () => {
  it('敘述與 details 列出刪掉的明細與附件檔名', async () => {
    const RECORDS = [
      { id: 1, order_no: 'PO-9', partner_name: '供應商A', category_name: '設備', purchaser_name: 'Rio', created_at: '2026-09-01T00:00:00Z',
        item_type: '伺服器', brand: 'Dell', model: 'R750', specification: '2U', unit: '台', quantity: 2, received_quantity: 0, status: 'ORDERED',
        remarks: '急件', attachments: [{ originalName: '報價.pdf', fileName: 'stored-q.pdf' }] },
    ];
    setup({
      fetchProcurementList: { success: true, rows: RECORDS },
      deletePurchaseRecordList: { success: true, rows: [{ id: 1 }] },
    });
    render(
      <RoleContext.Provider value={{ authUser: { id: 1, role: 'ADMIN' }, role: 'ADMIN' }}>
        <MemoryRouter><ProcurementList /></MemoryRouter>
      </RoleContext.Provider>
    );
    fireEvent.click(await screen.findByLabelText('刪除採購單'));

    await waitFor(() => expect(auditLogs().some((l) => l.module === 'PURCHASE')).toBe(true));
    const log = auditLogs().find((l) => l.module === 'PURCHASE');
    expect(log.action).toBe('DELETE');
    expect(log.summary).toBe('刪除整筆採購單 [PO-9]：明細：Dell 伺服器 R750 / 2U ×2（供應商A）；附件：報價.pdf；備註：急件');
    expect(log.details.orderNo).toBe('PO-9');
    expect(log.details.snapshot.items).toEqual([expect.objectContaining({ model: 'R750', quantity: 2, supplier: '供應商A' })]);
    expect(log.details.snapshot.attachments).toEqual([{ originalName: '報價.pdf', fileName: 'stored-q.pdf' }]);
  });
});
