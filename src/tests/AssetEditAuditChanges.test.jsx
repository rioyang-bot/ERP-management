import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import * as XLSX from 'xlsx';
import DeviceList from '../pages/DeviceList';
import HwList from '../pages/HwList';
import HwRegistration from '../pages/HwRegistration';
import DeviceChecklistModal from '../components/DeviceChecklistModal';
import AssetPhotoSection from '../components/AssetPhotoSection';
import MountedConsumablesSection from '../components/MountedConsumablesSection';
import DeviceBatchImportModal from '../components/DeviceBatchImportModal';
import HwBatchImportModal from '../components/HwBatchImportModal';
import HwRegistrationModal from '../components/HwRegistrationModal';
import { fillPlanChanges, buildFillPlan } from '../utils/assetFillImport';
import { createRunTransactionMock } from './helpers/mockTransaction';

/**
 * 設備／硬體每個可編輯的欄位都要留下「欄位：舊 → 新」
 *
 * 事件查詢看 details.changes（表格列出變更前／變更後），品項履歷只看敘述，
 * 所以敘述裡也要寫出改了哪個欄位、從什麼改成什麼；照片記檔名。
 */

let calls;
let handler;
const called = (name) => calls.filter((c) => c.query === name);
const auditLogs = () => called('insertAuditLog').map(({ params: p }) => ({
  actionType: p[3], module: p[4], targetId: p[6], summary: p[8], details: p[9],
}));
const findLog = (pred) => auditLogs().find(pred);

const installApi = (fn = () => null) => {
  handler = fn;
  const namedQuery = vi.fn(async (query, params) => {
    calls.push({ query, params });
    const res = handler(query, params);
    return res || { success: true, rows: [] };
  });
  window.electronAPI = {
    namedQuery,
    runTransaction: createRunTransactionMock(namedQuery),
    saveFile: vi.fn(async (name) => ({ success: true, fileName: `${name}-1787` })),
    loadMedia: vi.fn(async () => ({ success: true, blob: new Blob(['x']) })),
    getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    releaseUploads: vi.fn(async () => ({ success: true })),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  window.alert = vi.fn();
  vi.spyOn(window, 'confirm').mockImplementation(() => true);
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
  globalThis.URL.revokeObjectURL = vi.fn();
});

// ---------------------------------------------------------------------------
describe('設備列表', () => {
  const DEVICE = {
    id: 1, item_master_id: 5, sn: 'DEV-A1', brand: 'DELL', type: 'SERVER', model: 'R760',
    specification: '', ownership: 'FOR_SALE', status: 'ACTIVE', hostname: 'old-host', location: 'Rack A',
    client: 'ACME', remarks: 'r1', custom_attributes: { project_name: 'P1', end_user: 'EU1' }, components: [],
  };

  const show = async (extra = () => null) => {
    installApi((query, params) => {
      const r = extra(query, params);
      if (r) return r;
      if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') return { success: true, rows: [DEVICE] };
      if (query === 'fetchDeviceBrands') return { success: true, rows: [{ id: 1, name: 'DELL' }, { id: 2, name: 'HPE' }] };
      if (query === 'fetchDeviceTypes') return { success: true, rows: [{ id: 1, name: 'SERVER' }] };
      if (query === 'fetchCustomers') return { success: true, rows: [{ id: 1, name: 'ACME' }] };
      if (query === 'countAssetsByMasterId') return { success: true, rows: [{ count: '1' }] };
      if (query === 'deleteAsset') return { success: true, rows: [] };
      return null;
    });
    render(<MemoryRouter initialEntries={['/devices?brand=DELL']}><DeviceList /></MemoryRouter>);
    await screen.findByText('DEV-A1');
  };

  const openMenu = () => fireEvent.click(screen.getByText('DEV-A1').closest('tr').querySelector('td:last-child button'));

  const openEdit = async (extra) => {
    await show(extra);
    openMenu();
    fireEvent.click(await screen.findByText(/編輯詳細資訊/));
    await screen.findByText('修改詳細設備資訊');
  };

  const editLog = async () => {
    await waitFor(() => expect(findLog((l) => l.summary.startsWith('編輯設備詳細資訊') || l.summary.startsWith('序號變更'))).toBeTruthy());
    return findLog((l) => l.summary.startsWith('編輯設備詳細資訊') || l.summary.startsWith('序號變更'));
  };

  it('編輯：每個改到的欄位都寫「欄位：舊 → 新」，details.changes 帶變更前後', async () => {
    await openEdit();
    fireEvent.change(screen.getByDisplayValue('old-host'), { target: { value: 'new-host' } });
    fireEvent.change(screen.getByDisplayValue('Rack A'), { target: { value: 'Rack B' } });
    fireEvent.change(screen.getByDisplayValue('r1'), { target: { value: '' } });
    fireEvent.change(screen.getByDisplayValue('P1'), { target: { value: 'P2' } });
    fireEvent.change(screen.getByDisplayValue('EU1'), { target: { value: 'EU2' } });
    fireEvent.click(screen.getByText(/儲存變更/));

    const log = await editLog();
    expect(log.summary).toContain('編輯設備詳細資訊 [DEV-A1]：');
    expect(log.summary).toContain('主機名稱：old-host → new-host');
    expect(log.summary).toContain('放置位置：Rack A → Rack B');
    expect(log.summary).toContain('備註：r1 → （空白）');
    expect(log.summary).toContain('專案名稱：P1 → P2');
    expect(log.summary).toContain('End-user：EU1 → EU2');
    expect(log.details.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'hostname', label: '主機名稱', from: 'old-host', to: 'new-host' }),
      expect.objectContaining({ field: 'project_name', from: 'P1', to: 'P2' }),
    ]));
    // 原本的 details 鍵仍保留
    expect(log.details).toMatchObject({ sn: 'DEV-A1', hostname: 'new-host', location: 'Rack B' });
  });

  it('改廠牌：記「廠牌：舊 → 新」與品項主檔怎麼跟著改', async () => {
    await openEdit();
    const hpe = await screen.findByRole('option', { name: 'HPE' });
    fireEvent.change(hpe.closest('select'), { target: { value: 'HPE' } });
    fireEvent.click(screen.getByText(/儲存變更/));

    const log = await editLog();
    expect(log.summary).toContain('廠牌：DELL → HPE');
    expect(log.summary).toContain('品項主檔 #5 直接更名');
    expect(log.details.itemMasterChange).toMatchObject({ action: 'RENAME', fromMasterId: 5 });
    expect(log.details.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'brand', from: 'DELL', to: 'HPE' })]));
  });

  it('改序號：仍走 logSnChange，其他欄位的變更接在敘述後面', async () => {
    await openEdit();
    fireEvent.change(screen.getByDisplayValue('DEV-A1'), { target: { value: 'DEV-A2' } });
    fireEvent.change(screen.getByDisplayValue('old-host'), { target: { value: 'new-host' } });
    fireEvent.click(screen.getByText(/儲存變更/));

    const log = await editLog();
    expect(log.summary).toContain('序號變更：[DEV-A1] → [DEV-A2]');
    expect(log.summary).toContain('主機名稱：old-host → new-host');
    expect(log.details.snChanged).toBe(true);
    expect(log.details.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'sn', from: 'DEV-A1', to: 'DEV-A2' })]));
  });

  it('明細沒存成就不記編輯', async () => {
    await openEdit((query) => (query === 'updateAssetDetails' ? { success: false, error: 'boom' } : null));
    fireEvent.change(screen.getByDisplayValue('old-host'), { target: { value: 'new-host' } });
    fireEvent.click(screen.getByText(/儲存變更/));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('儲存失敗')));
    expect(auditLogs().filter((l) => l.module === 'DEVICE')).toHaveLength(0);
  });

  it('轉資產歸屬：記「資產歸屬：一般銷售 → 公司資產」', async () => {
    await show();
    openMenu();
    fireEvent.click(await screen.findByText('轉為公司資產'));
    await waitFor(() => expect(findLog((l) => l.summary.includes('資產歸屬'))).toBeTruthy());
    const log = findLog((l) => l.summary.includes('資產歸屬'));
    expect(log.summary).toContain('資產歸屬：一般銷售 → 公司資產');
    expect(log.details).toMatchObject({ oldOwnership: 'FOR_SALE', newOwnership: 'COMPANY' });
    expect(log.details.changes[0]).toMatchObject({ from: '一般銷售', to: '公司資產' });
  });

  it('刪除：留下被刪設備的快照', async () => {
    await show();
    openMenu();
    fireEvent.click(await screen.findByText('刪除紀錄'));
    await waitFor(() => expect(findLog((l) => l.actionType === 'DELETE')).toBeTruthy());
    const log = findLog((l) => l.actionType === 'DELETE');
    expect(log.summary).toContain('DELL R760');
    expect(log.summary).toContain('客戶 ACME');
    expect(log.summary).toContain('位置 Rack A');
    expect(log.details.deleted).toMatchObject({
      sn: 'DEV-A1', brand: 'DELL', model: 'R760', type: 'SERVER', client: 'ACME', location: 'Rack A',
      hostname: 'old-host', status: 'ACTIVE', ownership: '一般銷售', end_user: 'EU1', project_name: 'P1',
    });
  });
});

// ---------------------------------------------------------------------------
describe('硬體列表', () => {
  const HW = {
    id: 88, item_master_id: 2, sn: 'hw-abc', brand: 'Mellanox', model: 'CX4121A', type: 'NIC',
    status: 'ACTIVE', ownership: 'FOR_SALE', hostname: 'h1', remarks: 'old remark', location: 'Lab', client: '',
    custom_attributes: { order_source: 'PO-1' },
  };

  const show = async (extra = () => null) => {
    installApi((query, params) => {
      const r = extra(query, params);
      if (r) return r;
      if (query === 'fetchNicList' || query === 'fetchNicListByType') return { success: true, rows: [HW] };
      if (query === 'deleteAsset') return { success: true, rows: [] };
      return null;
    });
    render(<MemoryRouter initialEntries={['/hardware/list?type=NIC']}><HwList /></MemoryRouter>);
    await screen.findByText('hw-abc');
  };
  const openMenu = () => fireEvent.click(screen.getByText('hw-abc').closest('tr').querySelector('td:last-child button'));
  const openEdit = async (extra) => {
    await show(extra);
    openMenu();
    fireEvent.click(await screen.findByText(/編輯詳細資訊/));
    await screen.findByText('修改硬體資訊');
  };

  it('編輯：欄位的「舊 → 新」寫進敘述與 details.changes', async () => {
    await openEdit();
    fireEvent.change(screen.getByDisplayValue('PO-1'), { target: { value: 'PO-2' } });
    fireEvent.change(screen.getByDisplayValue('Lab'), { target: { value: 'DC' } });
    await userEvent.click(screen.getByRole('button', { name: '儲存變更' }));

    await waitFor(() => expect(findLog((l) => l.summary.startsWith('編輯硬體詳細資訊'))).toBeTruthy());
    const log = findLog((l) => l.summary.startsWith('編輯硬體詳細資訊'));
    expect(log.summary).toContain('訂單來源：PO-1 → PO-2');
    expect(log.summary).toContain('放置位置：Lab → DC');
    expect(log.details.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'order_source', from: 'PO-1', to: 'PO-2' }),
      expect.objectContaining({ field: 'location', from: 'Lab', to: 'DC' }),
    ]));
  });

  it('序號只改大小寫：也記成序號變更，但不連動其他單據', async () => {
    await openEdit();
    fireEvent.change(screen.getByDisplayValue('hw-abc'), { target: { value: 'HW-ABC' } });
    fireEvent.change(screen.getByDisplayValue('h1'), { target: { value: 'h2' } });
    fireEvent.change(screen.getByDisplayValue('old remark'), { target: { value: 'new remark' } });
    await userEvent.click(screen.getByRole('button', { name: '儲存變更' }));

    await waitFor(() => expect(findLog((l) => l.summary.startsWith('序號變更'))).toBeTruthy());
    const log = findLog((l) => l.summary.startsWith('序號變更'));
    expect(log.summary).toContain('[hw-abc] → [HW-ABC]');
    expect(log.summary).toContain('主機名稱：h1 → h2');
    expect(log.summary).toContain('備註：old remark → new remark');
    expect(log.details.snChanged).toBe(true);
    expect(called('renameMountedHwSnOnDevices')).toHaveLength(0);
  });

  it('改狀態失敗就不記', async () => {
    await show((query) => (query === 'updateAssetStatus' ? { success: false, error: 'x' } : null));
    openMenu();
    fireEvent.click(await screen.findByText('標記為維修'));
    await waitFor(() => expect(called('updateAssetStatus')).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(auditLogs().filter((l) => l.actionType === 'STATUS_CHANGE')).toHaveLength(0);
  });

  it('轉資產歸屬：記「舊 → 新」', async () => {
    await show();
    openMenu();
    fireEvent.click(await screen.findByText('轉為公司資產'));
    await waitFor(() => expect(findLog((l) => l.summary.includes('資產歸屬'))).toBeTruthy());
    expect(findLog((l) => l.summary.includes('資產歸屬')).summary).toContain('資產歸屬：一般銷售 → 公司資產');
  });

  it('刪除：留下被刪硬體的快照', async () => {
    await show();
    openMenu();
    fireEvent.click(await screen.findByText('刪除紀錄'));
    await waitFor(() => expect(findLog((l) => l.actionType === 'DELETE')).toBeTruthy());
    const log = findLog((l) => l.actionType === 'DELETE');
    expect(log.summary).toContain('位置 Lab');
    expect(log.details.deleted).toMatchObject({
      sn: 'hw-abc', brand: 'Mellanox', model: 'CX4121A', type: 'NIC', location: 'Lab',
      hostname: 'h1', order_source: 'PO-1', remarks: 'old remark', status: 'ACTIVE',
    });
  });
});

// ---------------------------------------------------------------------------
describe('出機檢查表', () => {
  const DEVICE = { id: 7, sn: 'DFE-1', brand: 'SECRETHFT', model: '3122-SM', hostname: 'NeoTap', location: 'UAT DC' };
  const BASE = [
    { id: 801, group_name: 'SecretHFT 出機檢查', kind: 'MAIN', item_name: 'BIOS 設定', source_item_id: 21, is_checked: false },
    { id: 960, group_name: 'SecretHFT 出機檢查', kind: 'DETAIL', item_name: 'OS', source_item_id: null, content: 'RH9.6' },
  ];
  let applied;
  let photos;

  const renderModal = (rows = BASE, photoRows = []) => {
    applied = rows.map((r) => ({ ...r }));
    photos = photoRows;
    installApi((query, params) => {
      if (query === 'fetchAssetChecklist') return { success: true, rows: applied };
      if (query === 'fetchAssetPhotos') return { success: true, rows: photos };
      if (query === 'setAssetChecklistItemChecked' || query === 'setAssetChecklistItemContent') {
        return { success: true, rows: [{ id: params[1] }] };
      }
      if (query === 'deleteAssetChecklistItem') {
        applied = applied.filter((r) => r.id !== params[0]);
        return { success: true, rows: [{ id: params[0] }] };
      }
      return null;
    });
    return render(<DeviceChecklistModal isOpen device={DEVICE} onClose={vi.fn()} onChanged={vi.fn()} />);
  };
  const save = async () => userEvent.click(await screen.findByRole('button', { name: /儲存變更/ }));

  it('勾選與內容：每一項寫「項目（主項目）：舊 → 新」', async () => {
    renderModal();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'BIOS 設定 檢查完成' }));
    const input = screen.getByLabelText('OS 內容');
    await userEvent.clear(input);
    await userEvent.type(input, 'RH10');
    await userEvent.tab();
    await save();

    await waitFor(() => expect(findLog((l) => l.summary.includes('出機檢查表更新'))).toBeTruthy());
    const log = findLog((l) => l.summary.includes('出機檢查表更新'));
    expect(log.summary).toContain('BIOS 設定（SecretHFT 出機檢查）：未勾選 → 已勾選');
    expect(log.summary).toContain('OS（SecretHFT 出機檢查）：RH9.6 → RH10');
    expect(log.details.changes).toEqual([
      expect.objectContaining({ kind: 'check', item: 'BIOS 設定', group: 'SecretHFT 出機檢查', from: '未勾選', to: '已勾選' }),
      expect.objectContaining({ kind: 'content', item: 'OS', from: 'RH9.6', to: 'RH10' }),
    ]);
    // 原本的 details 鍵仍保留
    expect(log.details).toMatchObject({ checked: { 801: true }, contents: { 960: 'RH10' } });
  });

  it('勾了又取消：回到原狀就不算變更', async () => {
    renderModal();
    const box = await screen.findByRole('checkbox', { name: 'BIOS 設定 檢查完成' });
    await userEvent.click(box);
    expect(screen.getByText(/有 1 項變更尚未儲存/)).toBeInTheDocument();
    await userEvent.click(box);
    expect(screen.queryByText(/項變更尚未儲存/)).not.toBeInTheDocument();
  });

  it('移除項目：記下名稱、勾選狀態與內容', async () => {
    renderModal([{ id: 701, group_name: '已刪除的主項目', kind: 'MAIN', item_name: 'A', source_item_id: null, is_checked: true }]);
    await userEvent.click(await screen.findByLabelText('移除 A'));
    await waitFor(() => expect(findLog((l) => l.summary.includes('移除項目'))).toBeTruthy());
    const log = findLog((l) => l.summary.includes('移除項目'));
    expect(log.summary).toContain('A（已勾選）');
    expect(log.details.removed[0]).toMatchObject({ item: 'A', group: '已刪除的主項目', kind: 'MAIN', is_checked: true });
  });

  it('移除整組：列出該組每一項', async () => {
    renderModal([
      { id: 701, group_name: '已刪除的主項目', kind: 'MAIN', item_name: 'A', source_item_id: null, is_checked: true },
      { id: 702, group_name: '已刪除的主項目', kind: 'MAIN', item_name: 'B', source_item_id: null, is_checked: false },
    ]);
    await userEvent.click(await screen.findByRole('button', { name: /移除整組/ }));
    await waitFor(() => expect(findLog((l) => l.summary.includes('移除整組'))).toBeTruthy());
    const log = findLog((l) => l.summary.includes('移除整組'));
    expect(log.summary).toContain('A（已勾選）、B（未勾選）');
    expect(log.details.removed).toHaveLength(2);
  });

  it('移除有照片的拍照項目：記下哪幾張照片移到其他照片', async () => {
    const photo = (id, name) => ({ id, asset_id: 7, file_name: `${name}-x.jpg`, original_name: name, checklist_item_id: 503 });
    renderModal(
      [{ id: 503, group_name: 'SecretHFT 出機檢查', kind: 'PHOTO', item_name: '舊項目', source_item_id: null, photo_count: 2 }],
      [photo(31, 'p1.jpg'), photo(32, 'p2.jpg')],
    );
    await userEvent.click(await screen.findByLabelText('移除 舊項目'));
    await waitFor(() => expect(findLog((l) => l.summary.includes('移除項目'))).toBeTruthy());
    const log = findLog((l) => l.summary.includes('移除項目'));
    expect(log.summary).toContain('2 張照片移到其他照片：p1.jpg、p2.jpg');
    expect(log.details.removed[0].photosMovedToOther).toEqual(['p1.jpg', 'p2.jpg']);
  });
});

// ---------------------------------------------------------------------------
describe('主機照片', () => {
  const DEVICE = { id: 7, sn: 'DFE-1' };
  const ITEMS = [{ id: 502, asset_id: 7, group_name: 'G', kind: 'PHOTO', item_name: '背面', source_item_id: 62, photo_count: 0 }];
  const imageFile = (name) => {
    const file = new File(['x'], name, { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: 1024 });
    return file;
  };

  it('上傳：記「（空白）→ 檔名」與伺服器上存的檔名', async () => {
    installApi((query) => (query === 'insertAssetPhoto' ? { success: true, rows: [{ id: 99 }] } : null));
    render(<AssetPhotoSection device={DEVICE} photoItems={ITEMS} />);
    await screen.findByTestId('photo-item-502');
    await userEvent.click(screen.getByRole('button', { name: '上傳 背面 的照片' }));
    await userEvent.upload(screen.getByTestId('asset-photo-item-input'), imageFile('back.jpg'));

    await waitFor(() => expect(findLog((l) => l.summary.includes('上傳主機照片'))).toBeTruthy());
    const log = findLog((l) => l.summary.includes('上傳主機照片'));
    expect(log.summary).toContain('拍照項目：背面');
    expect(log.summary).toContain('主機照片（背面）：（空白） → back.jpg');
    expect(log.details).toMatchObject({ files: ['back.jpg'], storedFiles: ['back.jpg-1787'], photoItem: '背面' });
    expect(log.details.changes[0]).toMatchObject({ from: '', to: 'back.jpg', storedName: 'back.jpg-1787', kind: 'file' });
  });

  it('刪除：記原始檔名、存檔名與所屬拍照項目', async () => {
    const photo = { id: 31, asset_id: 7, file_name: '/uploads/assets/front-1790.jpg', original_name: '背面.jpg', checklist_item_id: 502 };
    installApi((query) => {
      if (query === 'fetchAssetPhotos') return { success: true, rows: [photo] };
      if (query === 'deleteAssetPhoto') return { success: true, rows: [{ id: 31 }] };
      return null;
    });
    render(<AssetPhotoSection device={DEVICE} photoItems={ITEMS} />);
    const card = await screen.findByTestId('asset-photo-31');
    await userEvent.click(within(card).getByTitle('刪除'));
    await waitFor(() => expect(findLog((l) => l.summary.includes('刪除主機照片'))).toBeTruthy());
    const log = findLog((l) => l.summary.includes('刪除主機照片'));
    expect(log.summary).toContain('[背面.jpg]（拍照項目：背面）');
    expect(log.details).toMatchObject({ file: '背面.jpg', storedFile: 'front-1790.jpg', photoItem: '背面' });
    expect(log.details.changes[0]).toMatchObject({ label: '主機照片（背面）', from: '背面.jpg', to: '' });
  });
});

// ---------------------------------------------------------------------------
describe('掛載耗材', () => {
  const DAC = { item_master_id: 301, brand: 'METECH', type: 'DAC CABLE', model: 'DAC-10G 2M', specification: '', unit: '條', quantity: 4, stock_qty: 5 };
  const device = { id: 55, sn: 'SRV-001', status: 'ACTIVE' };

  beforeEach(() => {
    installApi((query) => {
      if (query === 'fetchMountedConsumables') return { success: true, rows: [DAC] };
      if (query === 'fetchConsumablesList') {
        return { success: true, rows: [
          { id: 301, brand: 'METECH', type: 'DAC CABLE', model: 'DAC-10G 2M', stock_qty: 5, lab_qty: 4 },
          { id: 302, brand: 'METECH', type: 'SFP', model: 'SFP+ LR', stock_qty: 10, lab_qty: 1 },
        ] };
      }
      return { success: true, rows: [{ id: 1 }] };
    });
  });

  it('掛載：記本設備掛載數量、庫存與 LAB 的變更前後', async () => {
    render(<MountedConsumablesSection device={device} />);
    await userEvent.selectOptions(await screen.findByLabelText('要掛載的耗材'), '302');
    await userEvent.clear(screen.getByLabelText('掛載數量'));
    await userEvent.type(screen.getByLabelText('掛載數量'), '3');
    await userEvent.click(screen.getByRole('button', { name: /掛載$/ }));

    await waitFor(() => expect(auditLogs()).toHaveLength(2));
    for (const log of auditLogs()) {
      expect(log.summary).toContain('本設備掛載數量：0 → 3；庫存數量：10 → 7；LAB 數量：1 → 4');
      expect(log.details.changes).toEqual([
        expect.objectContaining({ field: 'mounted', from: '0', to: '3' }),
        expect.objectContaining({ field: 'stock_qty', from: '10', to: '7' }),
        expect.objectContaining({ field: 'lab_qty', from: '1', to: '4' }),
      ]);
    }
    expect(auditLogs().map((l) => l.module)).toEqual(['CONSUMABLE', 'DEVICE']);
  });

  it('卸載：同樣記變更前後', async () => {
    render(<MountedConsumablesSection device={device} />);
    const qty = await screen.findByLabelText('卸載 DAC CABLE - METECH DAC-10G 2M 的數量');
    await userEvent.clear(qty);
    await userEvent.type(qty, '1');
    await userEvent.click(screen.getByRole('button', { name: '卸載 DAC CABLE - METECH DAC-10G 2M' }));

    await waitFor(() => expect(auditLogs()).toHaveLength(2));
    expect(auditLogs()[1].summary).toContain('本設備掛載數量：4 → 3；庫存數量：5 → 6；LAB 數量：4 → 3');
  });
});

// ---------------------------------------------------------------------------
describe('批次匯入補齊既有資產的空白欄位', () => {
  const makeFile = (rows, name = 'fill.xlsx') => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'S');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new File([u8], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  it('補齊清單：變更前一律空白，日期轉成 YYYY-MM-DD，自訂欄位用顯示名稱', () => {
    const plan = buildFillPlan({ id: 9, sn: 'A', custom_attributes: {} },
      { hostname: 'h', stock_date: '2026-10-01', warranty_years: 3, custom_attributes: { rack: 'R1', end_user: 'EU' } },
      { attributeLabels: { rack: '機櫃編號' } });
    expect(fillPlanChanges(plan, { attributeLabels: { rack: '機櫃編號' } })).toEqual([
      { field: 'hostname', label: '主機名稱', from: '', to: 'h' },
      { field: 'warranty_expire', label: '原廠保固到期', from: '', to: '2029-10-01' },
      { field: 'stock_date', label: '進貨日期', from: '', to: '2026-10-01' },
      { field: 'warranty_years', label: '原廠保固（年）', from: '', to: '3' },
      { field: 'rack', label: '機櫃編號', from: '', to: 'R1' },
      { field: 'end_user', label: 'End-user', from: '', to: 'EU' },
    ]);
    expect(fillPlanChanges(null)).toEqual([]);
  });

  it.each([
    ['設備', DeviceBatchImportModal, 'DEVICE'],
    ['硬體', HwBatchImportModal, 'HARDWARE'],
  ])('%s：每一支序號各記一筆補了哪些欄位', async (_name, Modal, module) => {
    installApi((query) => {
      if (query === 'fetchAssetSns') return { success: true, rows: [{ sn: 'EX-1' }] };
      if (query === 'fetchAssetsBySnListForFill') {
        return { success: true, rows: [{ id: 5, sn: 'EX-1', hostname: null, location: '', custom_attributes: {} }] };
      }
      if (query === 'fillEmptyAssetFieldsBySn') return { success: true, rows: [{ id: 5, sn: 'EX-1' }] };
      return null;
    });
    const { container } = render(<Modal isOpen onClose={vi.fn()} onSuccess={vi.fn()} existingBrands={[]} />);
    await userEvent.click(await screen.findByRole('checkbox', { name: /一併補齊既有序號的空白欄位/ }));
    await userEvent.upload(container.querySelector('input[type="file"]'),
      makeFile([{ SN: 'EX-1', Type: 'SERVER', Brand: 'DELL', Model: 'R760', Hostname: 'host-x', Location: 'Rack 9' }]));
    await screen.findByText(/fill\.xlsx/);
    await waitFor(() => expect(called('fetchAssetsBySnListForFill').length).toBeGreaterThan(0));
    await userEvent.click(await screen.findByText(/確認(批次)?匯入/i));

    await waitFor(() => expect(called('fillEmptyAssetFieldsBySn')).toHaveLength(1));
    await waitFor(() => expect(findLog((l) => l.targetId === 'EX-1' && l.actionType === 'UPDATE')).toBeTruthy());
    const log = findLog((l) => l.targetId === 'EX-1' && l.actionType === 'UPDATE');
    expect(log.module).toBe(module);
    expect(log.summary).toContain('補齊');
    expect(log.summary).toContain('主機名稱：（空白） → host-x');
    expect(log.details.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'hostname', from: '', to: 'host-x' }),
      expect.objectContaining({ field: 'location', from: '', to: 'Rack 9' }),
    ]));
    // 整批那一筆照舊
    expect(findLog((l) => l.actionType === 'BATCH_IMPORT')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
describe('新增硬體時掛上既有設備', () => {
  const setupApi = () => installApi((query) => {
    if (query === 'fetchHwBrands') return { success: true, rows: [{ id: 1, name: 'Intel' }] };
    if (query === 'fetchHwTypes') return { success: true, rows: [{ name: 'NIC 網卡' }] };
    if (query === 'fetchHwModelsByBrand') return { success: true, rows: [{ name: 'E810' }] };
    if (query === 'findItemMaster' || query === 'insertItemMaster') return { success: true, rows: [{ id: 101 }] };
    if (query === 'insertAssetRecord') return { success: true, rows: [{ id: 1 }], rowCount: 1 };
    if (query === 'appendMountedHwSnToDevice') return { success: true, rows: [{ id: 9, sn: 'SRV-9' }] };
    return null;
  });

  const pick = async (user) => {
    await waitFor(() => expect(screen.getByRole('option', { name: 'NIC 網卡' })).toBeInTheDocument());
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], 'NIC 網卡');
    await user.selectOptions(selects[1], 'Intel');
    await waitFor(() => expect(screen.getByRole('option', { name: 'E810' })).toBeInTheDocument());
    await user.selectOptions(selects[2], 'E810');
  };

  const expectMountLog = async (hwSn) => {
    await waitFor(() => expect(findLog((l) => l.module === 'DEVICE' && l.summary.startsWith('搭載硬體異動'))).toBeTruthy());
    const log = findLog((l) => l.module === 'DEVICE' && l.summary.startsWith('搭載硬體異動'));
    expect(log.targetId).toBe('SRV-9');
    expect(log.summary).toBe(`搭載硬體異動：加掛 ${hwSn}`);
    expect(log.details).toMatchObject({ added: [hwSn], removed: [], mountChanged: true });
  };

  it('硬體列表的新增視窗', async () => {
    setupApi();
    const user = userEvent.setup();
    render(<HwRegistrationModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    await pick(user);
    await user.type(screen.getByPlaceholderText('請輸入或掃描序號'), 'REG-HW-9');
    await user.type(screen.getByPlaceholderText('選填：搭載之主機序號'), 'SRV-9');
    await user.click(screen.getByRole('button', { name: /儲存並關閉/ }));
    await expectMountLog('REG-HW-9');
  });

  it('硬體建檔頁', async () => {
    setupApi();
    const user = userEvent.setup();
    render(<MemoryRouter><HwRegistration /></MemoryRouter>);
    await pick(user);
    await user.type(screen.getByPlaceholderText('請輸入硬體序號'), 'REG-HW-10');
    await user.type(screen.getByPlaceholderText('同步對應主機'), 'SRV-9');
    await user.click(screen.getByRole('button', { name: /儲存硬體資料/ }));
    await expectMountLog('REG-HW-10');
  });
});
