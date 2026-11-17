import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ChecklistTemplates from '../pages/ChecklistTemplates';
import PhotoExampleLibrary from '../components/PhotoExampleLibrary';

/**
 * 出機檢查表範本與拍照項目範例的欄位變更紀錄
 *
 * 主項目、項目、順序、範例改了什麼，事件查詢要看得到「欄位：舊 → 新」；
 * 刪除要留下刪除前的內容（說明、預設照片檔名、一併刪掉的項目）。
 */
let calls;
const called = (name) => calls.filter((c) => c.query === name);
const auditLogs = () => called('insertAuditLog').map((c) => ({ action: c.params[3], targetId: c.params[6], summary: c.params[8], details: c.params[9] }));

const GROUP = { id: 2, name: 'BlackCore 出機檢查', brand: 'BLACKCORE', model: null, main_count: 2, detail_count: 0, photo_count: 1 };
const ITEMS = [
  { id: 11, group_id: 2, kind: 'MAIN', name: 'BIOS 設定', sort_order: 0, description: 'UEFI 開機' },
  { id: 12, group_id: 2, kind: 'MAIN', name: '網路設定', sort_order: 1, description: null },
  { id: 13, group_id: 2, kind: 'PHOTO', name: '正面', sort_order: 0, description: '正面平視', default_photo_name: '正面範例.jpg', default_photo_file: 'abc123.jpg' },
];

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  window.alert = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  window.electronAPI = {
    getDashboardStats: vi.fn(),
    runTransaction: vi.fn(),
    namedQuery: vi.fn(async (query, params) => {
      calls.push({ query, params });
      if (query === 'fetchChecklistGroups') return { success: true, rows: [GROUP] };
      if (query === 'fetchChecklistItems') return { success: true, rows: ITEMS };
      if (query === 'fetchDeviceBrands') return { success: true, rows: [{ name: 'BLACKCORE' }, { name: 'LDA' }] };
      if (query === 'fetchModelsByBrand') return { success: true, rows: [{ name: 'NEOTAP' }] };
      if (query === 'updateChecklistGroup') return { success: true, rows: [{ id: params[2] }] };
      if (query.startsWith('delete')) return { success: true, rows: [{ id: params[0] }] };
      return { success: true, rows: [] };
    }),
  };
});

const renderPage = async () => {
  const utils = render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
  await screen.findByText('BIOS 設定');
  return utils;
};

describe('出機檢查表範本', () => {
  it('修改主項目：名稱、廠牌、型號記變更前 → 變更後（變更前取清單原本那一筆）', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: `修改主項目 ${GROUP.name}` }));
    const name = screen.getByRole('textbox', { name: '修改主項目名稱' });
    await userEvent.clear(name);
    await userEvent.type(name, 'BlackCore 出機檢查 v2');
    await screen.findByRole('option', { name: 'NEOTAP' });
    fireEvent.change(screen.getByRole('combobox', { name: '修改適用型號' }), { target: { value: 'NEOTAP' } });
    await userEvent.click(screen.getByRole('button', { name: '儲存主項目' }));

    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    const [log] = auditLogs();
    expect(log.summary).toContain('名稱：BlackCore 出機檢查 → BlackCore 出機檢查 v2；型號：（空白） → NEOTAP');
    expect(log.details.changes).toEqual([
      { field: 'name', label: '名稱', from: 'BlackCore 出機檢查', to: 'BlackCore 出機檢查 v2' },
      { field: 'model', label: '型號', from: '', to: 'NEOTAP' },
    ]);
    expect(log.details.before).toEqual({ name: 'BlackCore 出機檢查', brand: 'BLACKCORE', model: null });
  });

  it('刪除主項目：留下型號與一併刪掉的項目（名稱、說明、預設照片檔名）', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: `刪除主項目 ${GROUP.name}` }));

    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    const [log] = auditLogs();
    expect(log.action).toBe('DELETE');
    expect(log.summary).toContain('一併刪除 主要檢查功能：BIOS 設定、網路設定；拍照項目：正面');
    expect(log.details).toMatchObject({ name: GROUP.name, brand: 'BLACKCORE', model: null });
    expect(log.details.items).toEqual([
      { id: 11, kind: 'MAIN', name: 'BIOS 設定', description: 'UEFI 開機', defaultPhoto: null, defaultPhotoFile: null },
      { id: 12, kind: 'MAIN', name: '網路設定', description: null, defaultPhoto: null, defaultPhotoFile: null },
      { id: 13, kind: 'PHOTO', name: '正面', description: '正面平視', defaultPhoto: '正面範例.jpg', defaultPhotoFile: 'abc123.jpg' },
    ]);
  });

  it('修改項目：名稱與說明都記變更前 → 變更後', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '修改 BIOS 設定' }));
    const desc = screen.getByRole('textbox', { name: '修改主要檢查功能說明' });
    await userEvent.clear(desc);
    await userEvent.type(desc, 'Secure Boot 關閉');
    await userEvent.click(screen.getByRole('button', { name: '儲存項目' }));

    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    const [log] = auditLogs();
    expect(log.summary).toBe('修改出機檢查項目 [BIOS 設定]，並更新說明：說明：UEFI 開機 → Secure Boot 關閉');
    expect(log.details.changes).toEqual([{ field: 'description', label: '說明', from: 'UEFI 開機', to: 'Secure Boot 關閉' }]);
    // 原本就有的 details 照舊
    expect(log.details).toMatchObject({ before: 'BIOS 設定', after: 'BIOS 設定', description: 'Secure Boot 關閉', beforeDescription: 'UEFI 開機' });
  });

  it('刪除項目：留下說明與預設照片檔名', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '刪除 正面' }));

    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    const [log] = auditLogs();
    expect(log.summary).toContain('刪除出機檢查項目 [正面]（拍攝說明：正面平視；預設照片：正面範例.jpg）');
    expect(log.details).toMatchObject({
      name: '正面', kind: 'PHOTO',
      before: { name: '正面', description: '正面平視', defaultPhoto: '正面範例.jpg', defaultPhotoFile: 'abc123.jpg' },
    });
  });

  it('調整順序：記拖曳前 → 拖曳後的順序', async () => {
    const { container } = await renderPage();
    const rows = [...container.querySelectorAll('[draggable="true"]')];
    const source = rows.find((r) => r.textContent.includes('BIOS 設定'));
    const target = rows.find((r) => r.textContent.includes('網路設定'));
    const dataTransfer = { setData: vi.fn(), getData: () => '', effectAllowed: '' };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    const [log] = auditLogs();
    expect(log.summary).toContain('順序：BIOS 設定、網路設定 → 網路設定、BIOS 設定');
    expect(log.details.changes).toEqual([{ field: 'order', label: '順序', from: 'BIOS 設定、網路設定', to: '網路設定、BIOS 設定' }]);
    expect(log.details.beforeOrder).toEqual(['BIOS 設定', '網路設定']);
  });

  it('移除預設照片：details 另記存檔名與變更前 → 變更後', async () => {
    const original = window.electronAPI.namedQuery.getMockImplementation();
    window.electronAPI.namedQuery.mockImplementation(async (query, params) => (
      query === 'clearChecklistItemDefaultPhoto'
        ? (calls.push({ query, params }), { success: true, rows: [{ id: 13, prev_photo_name: '正面範例.jpg', prev_photo_file: 'abc123.jpg' }] })
        : original(query, params)
    ));
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '移除 正面 的預設照片' }));

    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    const [log] = auditLogs();
    expect(log.details).toMatchObject({ prevDefaultPhoto: '正面範例.jpg', prevDefaultPhotoFile: 'abc123.jpg' });
    expect(log.details.changes).toEqual([{ field: 'defaultPhoto', label: '預設照片', from: '正面範例.jpg', to: '', kind: 'file' }]);
  });
});

describe('拍照項目範例', () => {
  const EX = { id: 5, name: '正面', description: '關機狀態' };
  const renderLib = () => render(
    <PhotoExampleLibrary examples={[EX]} onChanged={vi.fn()} card={{}} inputStyle={{}} iconBtn={() => ({})} />
  );

  it('修改範例：名稱與拍攝說明記變更前 → 變更後', async () => {
    window.electronAPI.namedQuery.mockImplementation(async (query, params) => {
      calls.push({ query, params });
      return { success: true, rows: [{ id: 5 }] };
    });
    renderLib();
    await userEvent.click(screen.getByRole('button', { name: '修改範例 正面' }));
    const name = screen.getByRole('textbox', { name: '修改範例項目名稱' });
    await userEvent.clear(name);
    await userEvent.type(name, '正面全景');
    const desc = screen.getByRole('textbox', { name: '修改範例說明' });
    await userEvent.clear(desc);
    await userEvent.type(desc, '開機狀態');
    await userEvent.click(screen.getByRole('button', { name: '儲存範例' }));

    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    const [log] = auditLogs();
    expect(log.summary).toBe('修改拍照項目範例 [正面] → [正面全景]：名稱：正面 → 正面全景；拍攝說明：關機狀態 → 開機狀態');
    expect(log.details.changes).toEqual([
      { field: 'name', label: '名稱', from: '正面', to: '正面全景' },
      { field: 'description', label: '拍攝說明', from: '關機狀態', to: '開機狀態' },
    ]);
    expect(log.details.before).toEqual({ name: '正面', description: '關機狀態' });
  });

  it('刪除範例：留下拍攝說明', async () => {
    renderLib();
    await userEvent.click(screen.getByRole('button', { name: '刪除範例 正面' }));
    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    const [log] = auditLogs();
    expect(log.summary).toBe('刪除拍照項目範例 [正面]（拍攝說明：關機狀態）');
    expect(log.details).toMatchObject({ name: '正面', description: '關機狀態' });
  });
});
