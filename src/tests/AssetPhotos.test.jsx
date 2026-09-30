import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssetPhotoSection from '../components/AssetPhotoSection';
import { screenPhotoFiles, formatFileSize } from '../utils/assetPhotos';
import { queries } from '../../database/queries';

/**
 * 出機檢查表的主機照片
 *
 * 照片掛在單一台設備（序號）上，不是掛在型號上：同型號的兩台機器，
 * 機況與配置都不一樣，日後要據以開立驗收單的也是那一台自己的照片。
 */
const DEVICE = { id: 7, sn: 'DFE322328070001', brand: 'SECRETHFT', model: '3122-SM' };

const PHOTO = {
  id: 31, asset_id: 7, file_name: 'front-1787289689625.jpg', original_name: '正面.jpg',
  mime_type: 'image/jpeg', file_size: 2_400_000, uploaded_by_name: '楊先生',
  created_at: '2026-09-30T02:00:00Z',
};

const imageFile = (name, size = 1024, type = 'image/jpeg') => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('挑選要上傳的照片', () => {
  it('不是圖片的擋下來並說明原因', () => {
    const { accepted, rejected } = screenPhotoFiles([
      imageFile('a.jpg'), imageFile('b.pdf', 1024, 'application/pdf'),
    ]);
    expect(accepted.map((f) => f.name)).toEqual(['a.jpg']);
    expect(rejected[0]).toEqual({ name: 'b.pdf', reason: '不是圖片檔' });
  });

  it('超過上限的擋下來，訊息帶出實際大小', () => {
    const { accepted, rejected } = screenPhotoFiles([imageFile('big.jpg', 12 * 1024 * 1024)]);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toContain('10 MB');
    expect(rejected[0].reason).toContain('12.0 MB');
  });

  it('剛好等於上限可以上傳', () => {
    const { accepted } = screenPhotoFiles([imageFile('edge.jpg', 10 * 1024 * 1024)]);
    expect(accepted).toHaveLength(1);
  });

  it('檔案大小讀得懂', () => {
    expect(formatFileSize(900)).toBe('900 B');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(2_400_000)).toBe('2.3 MB');
    expect(formatFileSize(null)).toBe('--');
  });
});

describe('主機照片區塊', () => {
  let namedQuery;
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    // jsdom 沒有這兩支
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
    globalThis.URL.revokeObjectURL = vi.fn();

    namedQuery = vi.fn(async (query, params) => {
      calls.push({ query, params });
      if (query === 'fetchAssetPhotos') return { success: true, rows: [PHOTO] };
      if (query === 'insertAssetPhoto') return { success: true, rows: [{ id: 99 }] };
      if (query === 'deleteAssetPhoto') return { success: true, rows: [{ id: params[0] }] };
      return { success: true, rows: [] };
    });
    window.electronAPI = {
      namedQuery,
      saveFile: vi.fn(async (name) => ({ success: true, fileName: `${name}-1787` })),
      loadMedia: vi.fn(async () => ({ success: true, blob: new Blob(['x']) })),
    };
  });

  const called = (name) => calls.filter((c) => c.query === name);

  it('列出這台設備已經有的照片', async () => {
    render(<AssetPhotoSection device={DEVICE} />);

    expect(await screen.findByText('正面.jpg')).toBeInTheDocument();
    expect(called('fetchAssetPhotos')[0].params).toEqual([7]);
    expect(screen.getByText(/2.3 MB/)).toBeInTheDocument();
  });

  it('縮圖不是直接指向 /uploads', async () => {
    // /uploads 擋在 requireAuth 後面，瀏覽器的 img 不會帶 Authorization 標頭，
    // 直接指過去只會拿到 401
    render(<AssetPhotoSection device={DEVICE} />);
    await screen.findByText('正面.jpg');

    await waitFor(() => expect(window.electronAPI.loadMedia).toHaveBeenCalledWith('front-1787289689625.jpg'));
    const img = await screen.findByAltText('正面.jpg');
    expect(img.getAttribute('src')).toBe('blob:fake');
  });

  it('上傳前先問過，確定後才寫入', async () => {
    render(<AssetPhotoSection device={DEVICE} />);
    await screen.findByText('正面.jpg');

    await userEvent.upload(screen.getByTestId('asset-photo-input'), imageFile('背面.jpg', 500_000));

    await waitFor(() => expect(called('insertAssetPhoto')).toHaveLength(1));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('背面.jpg'));
    const params = called('insertAssetPhoto')[0].params;
    expect(params[0]).toBe(7);                  // asset_id
    expect(params[2]).toBe('背面.jpg');          // 原始檔名，下載時要用
    expect(params[4]).toBe(500_000);            // 檔案大小
  });

  it('按下取消就不上傳', async () => {
    window.confirm.mockReturnValue(false);
    render(<AssetPhotoSection device={DEVICE} />);
    await screen.findByText('正面.jpg');

    await userEvent.upload(screen.getByTestId('asset-photo-input'), imageFile('背面.jpg'));

    expect(window.electronAPI.saveFile).not.toHaveBeenCalled();
    expect(called('insertAssetPhoto')).toHaveLength(0);
  });

  it('上傳會留下事件紀錄，目標是設備序號', async () => {
    render(<AssetPhotoSection device={DEVICE} />);
    await screen.findByText('正面.jpg');

    await userEvent.upload(screen.getByTestId('asset-photo-input'), imageFile('背面.jpg'));

    await waitFor(() => expect(called('insertAuditLog')).toHaveLength(1));
    // 履歷是拿序號接回資產的
    expect(called('insertAuditLog')[0].params[6]).toBe(DEVICE.sn);
    expect(called('insertAuditLog')[0].params[8]).toContain('上傳主機照片');
  });

  it('點縮圖會把原檔存下來，檔名用使用者原本的那一個', async () => {
    const clicked = [];
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function stub() {
      clicked.push({ href: this.href, download: this.download });
    };
    try {
      render(<AssetPhotoSection device={DEVICE} />);
      await screen.findByText('正面.jpg');

      await userEvent.click(screen.getByTestId('download-asset-photo-31'));

      await waitFor(() => expect(clicked).toHaveLength(1));
      // 存下來的檔名是「正面.jpg」而不是伺服器上那串加了時間戳的檔名
      expect(clicked[0].download).toBe('正面.jpg');
    } finally {
      HTMLAnchorElement.prototype.click = realClick;
    }
  });

  it('刪除要先問過', async () => {
    window.confirm.mockReturnValue(false);
    render(<AssetPhotoSection device={DEVICE} />);
    await screen.findByText('正面.jpg');

    await userEvent.click(screen.getByTestId('delete-asset-photo-31'));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('正面.jpg'));
    expect(called('deleteAssetPhoto')).toHaveLength(0);
  });

  it('確定刪除後會寫紀錄', async () => {
    render(<AssetPhotoSection device={DEVICE} />);
    await screen.findByText('正面.jpg');

    await userEvent.click(screen.getByTestId('delete-asset-photo-31'));

    await waitFor(() => expect(called('deleteAssetPhoto')[0].params).toEqual([31]));
    await waitFor(() => expect(called('insertAuditLog')[0].params[8]).toContain('刪除主機照片'));
  });

  /** 伺服器還沒套用資料庫變更時，不能讓整張檢查表打不開 */
  it('讀不到照片時只擋住這一區', async () => {
    namedQuery.mockImplementation(async (query) => {
      if (query === 'fetchAssetPhotos') return { success: false, error: 'relation "asset_photos" does not exist' };
      return { success: true, rows: [] };
    });
    render(<AssetPhotoSection device={DEVICE} />);

    expect(await screen.findByText(/讀取主機照片失敗/)).toBeInTheDocument();
    expect(screen.getByText('主機照片')).toBeInTheDocument();
  });
});

describe('照片的查詢', () => {
  it('照片掛在資產上，設備刪掉時一併清掉', () => {
    const sql = require('fs').readFileSync('database/migration_asset_photos.sql', 'utf8');
    expect(sql).toMatch(/asset_id\s+INTEGER NOT NULL REFERENCES assets\(id\) ON DELETE CASCADE/);
  });

  it('同時留下伺服器檔名與原始檔名', () => {
    // 只留伺服器檔名的話，下載存下來會是一串加了時間戳的亂碼
    expect(queries.insertAssetPhoto).toContain('file_name');
    expect(queries.insertAssetPhoto).toContain('original_name');
    expect(queries.fetchAssetPhotos).toContain('original_name');
  });

  it('刪除會回傳被刪的那一筆，呼叫端才知道刪掉的是誰', () => {
    expect(queries.deleteAssetPhoto).toContain('RETURNING');
    expect(queries.deleteAssetPhoto).toContain('original_name');
  });
});
