import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import * as XLSX from 'xlsx';
import ConsumableList from '../pages/ConsumableList';
import ConsumableBatchImportModal from '../components/ConsumableBatchImportModal';
import Partners from '../pages/Partners';
import ProjectList from '../pages/ProjectList';
import { RoleContext } from '../context/RoleContext';

/**
 * 事件紀錄：耗材、夥伴、專案的每個可編輯欄位都記「變更前 → 變更後」
 *
 * - 敘述（summary，履歷只看得到這個）寫成「欄位：舊 → 新」
 * - details.changes 存 { field, label, from, to }，事件查詢用表格列出
 * - 變更前一律取原本那筆，不是編輯中的複本
 * - 刪除要記下刪除前的整筆內容；附件只記檔名，不記 base64 內容
 * - 寫入失敗不記
 */

const auditRows = () => window.electronAPI.namedQuery.mock.calls
  .filter(([q]) => q === 'insertAuditLog')
  .map(([, p]) => ({ actionType: p[3], module: p[4], targetId: p[6], summary: p[8], details: p[9] }));

const setQueries = (handlers) => {
  window.electronAPI.namedQuery.mockImplementation(async (query, params) => {
    if (handlers[query]) return handlers[query](params);
    return { success: true, rows: [] };
  });
};

beforeEach(() => {
  window.electronAPI.namedQuery.mockReset();
  window.alert = vi.fn();
  window.confirm = vi.fn(() => true);
});

// ---------------------------------------------------------------------------
// 耗材清單
// ---------------------------------------------------------------------------
const CONSUMABLE = {
  id: 88, brand: 'METECH', type: '光纖線', model: 'LC-LC-OM4-3M', specification: '多模 3米',
  unit: '條', stock_qty: 50, lab_qty: 10, safety_stock: 20,
};

const renderConsumables = async (item = CONSUMABLE, extra = {}) => {
  setQueries({
    fetchConsumablesList: () => ({ success: true, rows: [item] }),
    fetchConsumablesListByType: () => ({ success: true, rows: [item] }),
    ...extra,
  });
  render(
    <RoleContext.Provider value={{ authUser: { full_name: '管理者' }, role: 'ADMIN' }}>
      <BrowserRouter><ConsumableList /></BrowserRouter>
    </RoleContext.Provider>
  );
  await waitFor(() => expect(screen.getByText(/顯示全部耗材清單/)).toBeInTheDocument());
  fireEvent.click(screen.getByText(/顯示全部耗材清單/));
  await waitFor(() => expect(screen.getByText(item.model)).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('consumable-action-menu-btn'));
};

describe('耗材清單：事件紀錄記變更前 → 變更後', () => {
  it('編輯型號、規格、安全庫存、單位：每個欄位都記舊值與新值（型號照資料庫轉成大寫）', async () => {
    const user = userEvent.setup();
    await renderConsumables(CONSUMABLE, { updateConsumableMaster: () => ({ success: true, rows: [] }) });
    fireEvent.click(await screen.findByTestId('consumable-edit-detail-btn'));

    const model = screen.getByTestId('edit-consumable-model-input');
    await user.clear(model);
    await user.type(model, 'lc-lc-om4-5m');
    const spec = screen.getByTestId('edit-consumable-spec-input');
    await user.clear(spec);
    await user.type(spec, '多模 5米');
    fireEvent.change(screen.getByDisplayValue('20'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('save-edit-consumable-btn'));

    await waitFor(() => expect(auditRows()).toHaveLength(1));
    const [log] = auditRows();
    expect(log.actionType).toBe('UPDATE');
    expect(log.targetId).toBe('88');
    expect(log.summary).toContain('型號：LC-LC-OM4-3M → LC-LC-OM4-5M');
    expect(log.summary).toContain('規格說明/備註：多模 3米 → 多模 5米');
    expect(log.summary).toContain('安全庫存：20 → 30');
    expect(log.details.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'model', from: 'LC-LC-OM4-3M', to: 'LC-LC-OM4-5M' }),
      expect.objectContaining({ field: 'safety_stock', from: '20', to: '30' }),
    ]));
    // 沒改的欄位不列
    expect(log.details.changes.map((c) => c.field)).not.toContain('brand');
    // 舊的 details 欄位保留
    expect(log.details.itemMasterId).toBe(88);
  });

  it('更新失敗不記', async () => {
    const user = userEvent.setup();
    await renderConsumables(CONSUMABLE, { updateConsumableMaster: () => ({ success: false, error: 'x' }) });
    fireEvent.click(await screen.findByTestId('consumable-edit-detail-btn'));
    const model = screen.getByTestId('edit-consumable-model-input');
    await user.clear(model);
    await user.type(model, 'NEW');
    fireEvent.click(screen.getByTestId('save-edit-consumable-btn'));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(auditRows()).toHaveLength(0);
  });

  it('刪除：記下刪除前的廠牌、類型、型號、規格、單位、安全庫存與數量', async () => {
    const empty = { ...CONSUMABLE, stock_qty: 0, lab_qty: 0 };
    await renderConsumables(empty, { deleteConsumableMasterIfSafe: () => ({ success: true, rows: [{ id: 88 }] }) });
    fireEvent.click(await screen.findByText('刪除耗材'));

    await waitFor(() => expect(auditRows()).toHaveLength(1));
    const [log] = auditRows();
    expect(log.actionType).toBe('DELETE');
    expect(log.summary).toContain('廠牌：METECH');
    expect(log.summary).toContain('型號：LC-LC-OM4-3M');
    expect(log.summary).toContain('安全庫存：20');
    expect(log.details.snapshot).toMatchObject({ brand: 'METECH', type: '光纖線', unit: '條', safety_stock: 20, stock_qty: 0, lab_qty: 0 });
    expect(log.details.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'model', from: 'LC-LC-OM4-3M', to: '' }),
    ]));
  });

  it('LAB 移回 Stock：記 Stock、LAB 與該設備掛載數量的變更前 → 變更後', async () => {
    await renderConsumables(CONSUMABLE, {
      fetchCurrentLabUsage: () => ({ success: true, rows: [{ asset_id: 5, sn: 'SN-DEV-1', hostname: 'h1', brand: 'DELL', model: 'R750', current_qty: '4' }] }),
      findAssetBySn: () => ({ success: true, rows: [{ id: 5 }] }),
      unmountConsumableStock: () => ({ success: true, rows: [{ id: 88 }], rowCount: 1 }),
      deductLabAssignment: () => ({ success: true, rows: [{ id: 900 }], rowCount: 1 }),
    });
    fireEvent.click(await screen.findByText(/庫存異動/));
    fireEvent.click(await screen.findByText('移回 Stock'));
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '3' } });
    const select = await screen.findByDisplayValue('--- 選擇退回來源 ---');
    await waitFor(() => expect(screen.getByText(/SN-DEV-1/)).toBeInTheDocument());
    fireEvent.change(select, { target: { value: 'SN-DEV-1' } });
    fireEvent.click(screen.getByText('確認移動'));

    await waitFor(() => expect(auditRows()).toHaveLength(1));
    const [log] = auditRows();
    expect(log.summary).toContain('LAB ➔ Stock');
    expect(log.summary).toContain('Stock 庫存：50 → 53');
    expect(log.summary).toContain('LAB 數量：10 → 7');
    expect(log.summary).toContain('設備 [SN-DEV-1] 掛載數量：4 → 1');
    expect(log.details.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'stock_qty', from: '50', to: '53' }),
      expect.objectContaining({ field: 'lab_qty', from: '10', to: '7' }),
      expect.objectContaining({ field: 'lab_assignment_qty', from: '4', to: '1' }),
    ]));
    expect(log.details).toMatchObject({ prevStock: 50, prevLab: 10, direction: 'TO_STOCK' });
  });
});

// ---------------------------------------------------------------------------
// 耗材批次匯入
// ---------------------------------------------------------------------------
describe('耗材批次匯入：既有品項的庫存逐筆記變更前 → 變更後', () => {
  const importFile = async () => {
    const ws = XLSX.utils.json_to_sheet([{ '廠牌': 'Cisco', '型號/規格': 'SFP-10G-SR', '備註': '光纖模組', 'Total 數量': '5' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Consumables');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'stock.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const { container } = render(<ConsumableBatchImportModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    await userEvent.upload(container.querySelector('input[type="file"]'), file);
    await waitFor(() => expect(screen.getByText('SFP-10G-SR')).toBeInTheDocument());
    fireEvent.click(screen.getByText(/確認批次匯入/));
  };

  it('覆蓋模式：品項自己的紀錄記 Stock 庫存 7 → 5，整批那一筆也保留並帶上清單', async () => {
    setQueries({
      fetchConsumablesList: () => ({ success: true, rows: [] }),
      findConsumableMaster: () => ({ success: true, rows: [{ id: 55, stock_qty: 7, lab_qty: 0, safety_stock: 0 }] }),
      updateConsumableStockQtyOnImport: ([qty, id]) => ({ success: true, rows: [{ id, stock_qty: qty }] }),
    });
    await importFile();

    await waitFor(() => expect(auditRows().some((r) => r.actionType === 'BATCH_IMPORT')).toBe(true));
    const item = auditRows().find((r) => r.actionType === 'UPDATE');
    expect(item.targetId).toBe('55');
    expect(item.summary).toContain('Stock 庫存：7 → 5');
    expect(item.details.changes).toEqual([expect.objectContaining({ field: 'stock_qty', from: '7', to: '5' })]);
    expect(item.details.itemMasterId).toBe(55);

    const batch = auditRows().find((r) => r.actionType === 'BATCH_IMPORT');
    expect(batch.details.updatedCount).toBe(1);
    expect(batch.details.stockChanges).toEqual([expect.objectContaining({ id: 55, from: 7, to: 5 })]);
  });
});

// ---------------------------------------------------------------------------
// 夥伴管理
// ---------------------------------------------------------------------------
const PARTNERS = [
  { id: 1, type: 'CUSTOMER', name: '富邦綜合證券', contact: 'David Chen', phone: '0918600800', address: '台北市仁愛路四段 169 號', project_info: 'IMC', is_active: true },
];

describe('夥伴管理：事件紀錄記變更前 → 變更後', () => {
  it('編輯：電話、類型改了，記舊值與新值（類型顯示中文）', async () => {
    setQueries({
      fetchPartners: () => ({ success: true, rows: PARTNERS }),
      updatePartner: () => ({ success: true, rows: [] }),
    });
    render(<Partners />);
    fireEvent.click(await screen.findByTitle('修改夥伴資訊'));
    fireEvent.change(await screen.findByDisplayValue('0918600800'), { target: { value: '0911222333' } });
    const typeSelect = screen.getAllByRole('combobox').find((s) => s.value === 'CUSTOMER' && s.closest('[style*="fixed"]'))
      || screen.getAllByRole('combobox').at(-1);
    fireEvent.change(typeSelect, { target: { value: 'DEALER' } });
    fireEvent.click(screen.getByText('更新資料'));

    await waitFor(() => expect(auditRows()).toHaveLength(1));
    const [log] = auditRows();
    expect(log.module).toBe('PARTNER');
    expect(log.summary).toContain('電話：0918600800 → 0911222333');
    expect(log.summary).toContain('類型：客戶 → 經銷商');
    expect(log.details.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'phone', from: '0918600800', to: '0911222333' }),
    ]));
    expect(log.details.phone).toBe('0911222333');
  });

  it('刪除：記下刪除前的整筆內容', async () => {
    setQueries({
      fetchPartners: () => ({ success: true, rows: PARTNERS }),
      deletePartner: () => ({ success: true, rows: [] }),
    });
    render(<Partners />);
    fireEvent.click(await screen.findByTitle('刪除夥伴'));

    await waitFor(() => expect(auditRows()).toHaveLength(1));
    const [log] = auditRows();
    expect(log.actionType).toBe('DELETE');
    expect(log.summary).toContain('電話：0918600800');
    expect(log.summary).toContain('公司地址：台北市仁愛路四段 169 號');
    expect(log.details.snapshot).toMatchObject({ type: 'CUSTOMER', phone: '0918600800', project_info: 'IMC' });
    expect(log.details).toMatchObject({ id: 1, name: '富邦綜合證券', contact: 'David Chen' });
  });
});

// ---------------------------------------------------------------------------
// 專案管理
// ---------------------------------------------------------------------------
const PROJECT = {
  id: 7, project_no: 'PRJ-20260101-01', customer_name: '富邦綜合證券', customer_contact: 'David Chen',
  name: '機房擴建', start_date: '2026-01-01T00:00:00.000Z', end_date: null, remarks: '', status: 'IN_PROGRESS',
  documents: [
    { id: 1, name: '合約.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,QUFBQUFB' },
    { id: 2, name: '報價.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,QkJCQkJC' },
  ],
};

describe('專案管理：事件紀錄記變更前 → 變更後', () => {
  it('編輯：欄位記舊值與新值，附件只記新增／移除的檔名，不記 base64', async () => {
    setQueries({
      fetchProjects: () => ({ success: true, rows: [PROJECT] }),
      updateProject: () => ({ success: true, rows: [{ id: 7 }] }),
    });
    const { container } = render(<ProjectList />);
    fireEvent.click(await screen.findByTitle('編輯專案'));
    fireEvent.change(await screen.findByDisplayValue('機房擴建'), { target: { value: '機房擴建二期' } });
    fireEvent.change(screen.getByDisplayValue('進行中'), { target: { value: 'CLOSED' } });
    // 移除「合約.pdf」、上傳「驗收單.pdf」
    fireEvent.click(screen.getAllByTitle('刪除檔案')[0]);
    const file = new File(['hello'], '驗收單.pdf', { type: 'application/pdf' });
    await userEvent.upload(container.querySelector('#file-upload'), file);
    await waitFor(() => expect(screen.getByText('驗收單.pdf')).toBeInTheDocument());
    fireEvent.click(screen.getByText('儲存'));

    await waitFor(() => expect(auditRows()).toHaveLength(1));
    const [log] = auditRows();
    expect(log.summary).toContain('專案名稱：機房擴建 → 機房擴建二期');
    expect(log.summary).toContain('狀態：進行中 → 已結案');
    expect(log.summary).toContain('附件文件：合約.pdf、報價.pdf → 報價.pdf、驗收單.pdf');
    // 開始日期沒改（資料庫是完整時間字串，表單只有日期）不列
    expect(log.summary).not.toContain('開始日期');
    expect(log.details.documentsAdded).toEqual(['驗收單.pdf']);
    expect(log.details.documentsRemoved).toEqual(['合約.pdf']);
    expect(log.details.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'name', from: '機房擴建', to: '機房擴建二期' }),
      expect.objectContaining({ field: 'documents', kind: 'file' }),
    ]));
    expect(JSON.stringify(log.details)).not.toContain('base64');
  });

  it('編輯失敗不記', async () => {
    setQueries({
      fetchProjects: () => ({ success: true, rows: [PROJECT] }),
      updateProject: () => ({ success: false, error: 'db down' }),
    });
    render(<ProjectList />);
    fireEvent.click(await screen.findByTitle('編輯專案'));
    fireEvent.change(await screen.findByDisplayValue('機房擴建'), { target: { value: 'X' } });
    fireEvent.click(screen.getByText('儲存'));
    await waitFor(() => expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('updateProject', expect.anything()));
    await new Promise((r) => setTimeout(r, 0));
    expect(auditRows()).toHaveLength(0);
  });

  it('刪除：記下整筆內容、附件檔名與被清掉專案標籤的設備序號', async () => {
    setQueries({
      fetchProjects: () => ({ success: true, rows: [PROJECT] }),
      countProjectAssets: () => ({ success: true, rows: [{ count: '2' }] }),
      clearProjectFromAssets: () => ({ success: true, rows: [{ id: 1, sn: 'SN-A' }, { id: 2, sn: 'SN-B' }] }),
      deleteProject: () => ({ success: true, rows: [] }),
    });
    render(<ProjectList />);
    fireEvent.click(await screen.findByTitle('刪除專案'));

    await waitFor(() => expect(auditRows()).toHaveLength(1));
    const [log] = auditRows();
    expect(log.actionType).toBe('DELETE');
    expect(log.summary).toContain('SN-A、SN-B');
    expect(log.summary).toContain('專案編號：PRJ-20260101-01');
    expect(log.summary).toContain('客戶名稱：富邦綜合證券');
    expect(log.details).toMatchObject({ id: 7, projectName: '機房擴建', affectedAssetsCount: 2, affectedAssetSns: ['SN-A', 'SN-B'] });
    expect(log.details.snapshot.documents).toEqual(['合約.pdf', '報價.pdf']);
    expect(JSON.stringify(log.details)).not.toContain('base64');
  });

  it('刪除失敗不記', async () => {
    setQueries({
      fetchProjects: () => ({ success: true, rows: [PROJECT] }),
      countProjectAssets: () => ({ success: true, rows: [{ count: '0' }] }),
      deleteProject: () => ({ success: false, error: 'fk' }),
    });
    render(<ProjectList />);
    fireEvent.click(await screen.findByTitle('刪除專案'));
    await waitFor(() => expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('deleteProject', [7]));
    await new Promise((r) => setTimeout(r, 0));
    expect(auditRows()).toHaveLength(0);
  });
});
