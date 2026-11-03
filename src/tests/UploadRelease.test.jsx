import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, BrowserRouter } from 'react-router-dom';
import AssetPhotoSection from '../components/AssetPhotoSection';
import ChecklistTemplates from '../pages/ChecklistTemplates';
import DNList from '../pages/DNList';
import UploadCleanupPanel from '../components/UploadCleanupPanel';
import { releaseUploads, attachmentFileNames, removedAttachmentFiles, formatBytes } from '../utils/uploadRelease';
import { renderInboundHistory } from './helpers/renderInboundList';
import { queries } from '../../database/queries';

/**
 * 刪掉／換掉檔案時，伺服器上的檔案一併清掉
 *
 * 畫面上刪照片、換掉預設照片或簽收單、移除附件後，把舊的存檔名交給伺服器
 * （electronAPI.releaseUploads）。伺服器確認沒有其他紀錄在用才清，見 server/uploadCleanup.js。
 * 系統管理另有清理工具，補清以前留下來的。
 */
// 整頁畫面要先讀資料才畫得出來，整套測試一起跑時常超過預設的 1 秒
const PAGE_LOAD = { timeout: 5000 };

let calls;
const called = (name) => calls.filter((c) => c.query === name);
const auditLogs = () => called('insertAuditLog').map((c) => ({ module: c.params[4], summary: c.params[8] }));

const installApi = (handler, extra = {}) => {
  window.electronAPI = {
    namedQuery: vi.fn(async (query, params) => {
      calls.push({ query, params });
      return (await handler(query, params)) || { success: true, rows: [] };
    }),
    runTransaction: vi.fn(),
    getDashboardStats: vi.fn(),
    saveFile: vi.fn(async (name) => ({ success: true, fileName: `${name}-1787` })),
    loadMedia: vi.fn(async () => ({ success: true, blob: new Blob(['x']) })),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    releaseUploads: vi.fn(async (files) => ({ success: true, released: files, kept: [] })),
    ...extra,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  window.alert = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('共用函式', () => {
  it('交給伺服器前去掉空值與重複', async () => {
    installApi(() => null);
    await releaseUploads(['a.jpg', '', null, 'a.jpg', 'b.pdf']);
    expect(window.electronAPI.releaseUploads).toHaveBeenCalledWith(['a.jpg', 'b.pdf']);
  });

  it('沒有檔名不呼叫；伺服器失敗也不丟錯（只是順手清理）', async () => {
    installApi(() => null, { releaseUploads: vi.fn(async () => { throw new Error('offline'); }) });
    expect(await releaseUploads([])).toEqual({ released: [], kept: [] });
    expect(window.electronAPI.releaseUploads).not.toHaveBeenCalled();
    expect(await releaseUploads(['a.jpg'])).toEqual({ released: [], kept: ['a.jpg'] });
  });

  it('桌面版沒有這支 API：直接略過', async () => {
    installApi(() => null, { releaseUploads: undefined });
    expect(await releaseUploads(['a.jpg'])).toEqual({ released: [], kept: ['a.jpg'] });
  });

  it('附件清單：陣列或 JSON 字串都讀得到存檔名；比對出這次移除的', () => {
    const before = JSON.stringify([{ fileName: 'a-1.pdf' }, { fileName: 'b-2.jpg' }]);
    expect(attachmentFileNames(before)).toEqual(['a-1.pdf', 'b-2.jpg']);
    expect(attachmentFileNames('not json')).toEqual([]);
    expect(removedAttachmentFiles(before, [{ fileName: 'b-2.jpg' }, { fileName: 'c-3.png' }])).toEqual(['a-1.pdf']);
  });

  it('大小的寫法', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('設備的主機照片：刪除', () => {
  it('刪掉紀錄後，伺服器上的檔案一併清掉；事件紀錄照舊', async () => {
    const photo = { id: 31, asset_id: 7, file_name: 'front-own-1790.jpg', original_name: '正面.jpg', mime_type: 'image/jpeg', file_size: 1024, checklist_item_id: null };
    installApi((query) => {
      if (query === 'fetchAssetPhotos') return { success: true, rows: [photo] };
      if (query === 'deleteAssetPhoto') return { success: true, rows: [{ id: 31 }] };
      return null;
    });
    render(<AssetPhotoSection device={{ id: 7, sn: 'SN-7' }} photoItems={[]} />);
    const card = await screen.findByTestId('asset-photo-31');
    await userEvent.click(within(card).getByTitle('刪除'));
    await waitFor(() => expect(window.electronAPI.releaseUploads).toHaveBeenCalledWith(['front-own-1790.jpg']));
    expect(called('deleteAssetPhoto')[0].params).toEqual([31]);
    expect(auditLogs()[0]).toMatchObject({ module: 'DEVICE', summary: '設備 [SN-7] 刪除主機照片 [正面.jpg]' });
  });

  it('刪除失敗：不清檔案', async () => {
    const photo = { id: 31, asset_id: 7, file_name: 'front-own-1790.jpg', original_name: '正面.jpg', checklist_item_id: null };
    installApi((query) => {
      if (query === 'fetchAssetPhotos') return { success: true, rows: [photo] };
      if (query === 'deleteAssetPhoto') return { success: false, error: 'db error' };
      return null;
    });
    render(<AssetPhotoSection device={{ id: 7, sn: 'SN-7' }} photoItems={[]} />);
    await userEvent.click(within(await screen.findByTestId('asset-photo-31')).getByTitle('刪除'));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('刪除失敗')));
    expect(window.electronAPI.releaseUploads).not.toHaveBeenCalled();
  });
});

describe('出機檢查表：更換／移除預設照片', () => {
  let items;
  beforeEach(() => {
    items = [{ id: 62, group_id: 2, kind: 'PHOTO', name: '正面', default_photo_file: 'front-default-1790.jpg', default_photo_name: '正面範例.jpg' }];
    installApi((query, params) => {
      if (query === 'fetchChecklistGroups') return { success: true, rows: [{ id: 2, name: 'SecretHFT 出機檢查', brand: 'SECRETHFT', main_count: 0, detail_count: 0, photo_count: 1 }] };
      if (query === 'fetchChecklistItems') return { success: true, rows: items };
      if (query === 'fetchDeviceBrands') return { success: true, rows: [{ id: 1, name: 'SECRETHFT' }] };
      if (query === 'setChecklistItemDefaultPhoto' || query === 'clearChecklistItemDefaultPhoto') {
        const it = items[0];
        const prev = { prev_photo_name: it.default_photo_name, prev_photo_file: it.default_photo_file };
        Object.assign(it, query === 'setChecklistItemDefaultPhoto'
          ? { default_photo_file: params[0], default_photo_name: params[1] }
          : { default_photo_file: null, default_photo_name: null });
        return { success: true, rows: [{ id: it.id, name: it.name, ...prev }] };
      }
      return null;
    });
  });

  it('查詢回傳原本的存檔名', () => {
    expect(queries.setChecklistItemDefaultPhoto).toContain('old.default_photo_file AS prev_photo_file');
    expect(queries.clearChecklistItemDefaultPhoto).toContain('old.default_photo_file AS prev_photo_file');
  });

  it('更換：換掉的那張交給伺服器清掉（別的主項目共用時伺服器會保留）', async () => {
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: '更換 正面 的預設照片' }, PAGE_LOAD));
    const file = new File(['x'], '正面新.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('default-photo-input'), { target: { files: [file] } });
    await waitFor(() => expect(window.electronAPI.releaseUploads).toHaveBeenCalledWith(['front-default-1790.jpg']));
    expect(auditLogs()[0].summary).toBe('出機檢查表拍照項目 [正面]（主項目 [SecretHFT 出機檢查]）更換預設照片：正面範例.jpg → 正面新.jpg');
  });

  it('移除：原本那張交給伺服器清掉', async () => {
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: '移除 正面 的預設照片' }, PAGE_LOAD));
    await waitFor(() => expect(window.electronAPI.releaseUploads).toHaveBeenCalledWith(['front-default-1790.jpg']));
    expect(auditLogs()[0].summary).toBe('出機檢查表拍照項目 [正面]（主項目 [SecretHFT 出機檢查]）移除預設照片 [正面範例.jpg]');
  });
});

describe('出貨單：刪除簽收單', () => {
  it('刪掉後伺服器上的簽收單檔案一併清掉', async () => {
    const dn = {
      id: 2, request_no: 'DN-20260828-02', customer: '凱基證券', status: 'SHIPPED', request_type: 'SHIPMENT',
      created_at: '2026-08-28T10:00:00Z', signed_doc_url: 'signed_kgi-1724912000.pdf', signed_doc_name: '凱基簽收單據.pdf',
    };
    installApi((query) => {
      if (query === 'fetchOutboundRequests' || query === 'fetchDNList' || /^fetch.*Outbound/.test(query)) return { success: true, rows: [dn] };
      if (query === 'fetchOutboundItems') return { success: true, rows: [] };
      if (query === 'removeOutboundSignedDoc') return { success: true, rows: [{ id: 2 }] };
      return null;
    });
    render(<BrowserRouter><DNList /></BrowserRouter>);
    fireEvent.click(await screen.findByTestId('dn-tab-history'));
    const row = (await screen.findByText('DN-20260828-02', {}, PAGE_LOAD)).closest('tr');
    fireEvent.click(within(row).getByTitle('查看詳情'));
    fireEvent.click(await screen.findByText('刪除檔案'));
    await waitFor(() => expect(window.electronAPI.releaseUploads).toHaveBeenCalledWith(['signed_kgi-1724912000.pdf']));
    expect(called('removeOutboundSignedDoc')[0].params).toEqual([2]);
  });
});

describe('進貨單：移除附件', () => {
  const ORDER = {
    id: 11, order_no: 'IN-20260715-01', status: 'COMPLETED', order_date: '2026-07-15', effective_date: '2026-07-15',
    created_at: '2026-09-18T10:30:00.000Z', partner_id: 7, partner_name: '元大Yuanta', invoice_no: 'INV-001',
    attachments: JSON.stringify([
      { fileName: '進貨單-1790.pdf', originalName: '進貨單.pdf', type: 'application/pdf' },
      { fileName: '發票-1791.pdf', originalName: '發票.pdf', type: 'application/pdf' },
    ]),
  };
  beforeEach(() => {
    installApi((query) => {
      if (query === 'fetchInboundList') return { success: true, rows: [ORDER] };
      if (query === 'fetchSuppliers') return { success: true, rows: [{ id: 7, name: '元大Yuanta' }] };
      if (query === 'updateInboundOrderHeader') return { success: true, rows: [{ id: 11 }] };
      return null;
    });
  });

  it('移除後按儲存：移掉的那份交給伺服器清掉，留下的不動', async () => {
    renderInboundHistory();
    await userEvent.click(await screen.findByLabelText('編輯進貨單', {}, PAGE_LOAD));
    await userEvent.click(await screen.findByLabelText('移除附件 進貨單.pdf'));
    await userEvent.click(screen.getByRole('button', { name: /儲存/ }));
    await waitFor(() => expect(called('updateInboundOrderHeader')).toHaveLength(1));
    expect(JSON.parse(called('updateInboundOrderHeader')[0].params[2]).map((a) => a.fileName)).toEqual(['發票-1791.pdf']);
    // 按移除時先交一次（還在單據上，伺服器會保留），儲存後再交一次
    await waitFor(() => expect(window.electronAPI.releaseUploads).toHaveBeenCalledTimes(2));
    expect(window.electronAPI.releaseUploads.mock.calls.flat()).toEqual([['進貨單-1790.pdf'], ['進貨單-1790.pdf']]);
  });
});

describe('系統管理：清理沒有使用的上傳檔案', () => {
  const SCAN = {
    success: true, scannedCount: 5, recentCount: 1, folders: ['PRJ-20260814-750'], trashKeepDays: 30,
    trash: { count: 2, size: 2048 },
    orphans: [
      { name: 'old-a-1787.jpg', size: 1024 * 1024, modifiedAt: '2026-08-21T05:21:00.000Z' },
      { name: 'old-b-1788.pdf', size: 512 * 1024, modifiedAt: '2026-09-01T05:21:00.000Z' },
    ],
    orphanSize: 1.5 * 1024 * 1024,
  };

  it('掃描後列出檔案與統計，預設全選；確認後只送勾選的', async () => {
    installApi(() => null, {
      scanOrphanUploads: vi.fn(async () => SCAN),
      trashOrphanUploads: vi.fn(async (files) => ({ success: true, trashed: files.map((name) => ({ name })), skipped: [], size: 512 * 1024 })),
    });
    render(<UploadCleanupPanel />);
    await userEvent.click(screen.getByTestId('scan-uploads-btn'));
    const summary = await screen.findByTestId('upload-scan-summary');
    expect(summary).toHaveTextContent('共 5 個檔案，沒有在用的 2 個（1.5 MB）');
    expect(summary).toHaveTextContent('1 個是 24 小時內上傳的，先不列入');
    expect(summary).toHaveTextContent('子資料夾 PRJ-20260814-750 裡的舊檔不掃描');
    expect(summary).toHaveTextContent('回收區目前 2 個（2.0 KB），放滿 30 天自動刪除');
    expect(screen.getByTestId('clean-uploads-btn')).toHaveTextContent('清掉 2 個（1.5 MB）');

    await userEvent.click(screen.getByLabelText('選取 old-a-1787.jpg'));
    expect(screen.getByTestId('clean-uploads-btn')).toHaveTextContent('清掉 1 個（512.0 KB）');
    await userEvent.click(screen.getByTestId('clean-uploads-btn'));

    await waitFor(() => expect(window.electronAPI.trashOrphanUploads).toHaveBeenCalledWith(['old-b-1788.pdf']));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('保留 30 天後才真正刪除'));
    expect(await screen.findByText(/已清掉 1 個檔案（512.0 KB），移到回收區保留 30 天/)).toBeInTheDocument();
    // 清完重新掃描
    expect(window.electronAPI.scanOrphanUploads).toHaveBeenCalledTimes(2);
  });

  it('取消確認：不清', async () => {
    window.confirm.mockReturnValue(false);
    installApi(() => null, { scanOrphanUploads: vi.fn(async () => SCAN), trashOrphanUploads: vi.fn() });
    render(<UploadCleanupPanel />);
    await userEvent.click(screen.getByTestId('scan-uploads-btn'));
    await userEvent.click(await screen.findByTestId('clean-uploads-btn'));
    expect(window.electronAPI.trashOrphanUploads).not.toHaveBeenCalled();
  });

  it('沒有可清的：顯示沒有需要清理的檔案', async () => {
    installApi(() => null, { scanOrphanUploads: vi.fn(async () => ({ ...SCAN, orphans: [], orphanSize: 0 })) });
    render(<UploadCleanupPanel />);
    await userEvent.click(screen.getByTestId('scan-uploads-btn'));
    expect(await screen.findByText('沒有需要清理的檔案。')).toBeInTheDocument();
    expect(screen.queryByTestId('clean-uploads-btn')).toBeNull();
  });

  it('沒有權限：顯示錯誤', async () => {
    installApi(() => null, { scanOrphanUploads: vi.fn(async () => ({ success: false, error: '權限不足。' })) });
    render(<UploadCleanupPanel />);
    await userEvent.click(screen.getByTestId('scan-uploads-btn'));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('掃描失敗：權限不足。'));
  });
});
