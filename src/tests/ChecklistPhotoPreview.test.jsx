import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssetPhotoSection from '../components/AssetPhotoSection';

/**
 * 出機檢查表的照片：點縮圖先預覽，按「下載」才存檔
 *
 * 先前點縮圖就直接下載，只是想看一眼也會存一堆檔案。
 */
const DEVICE = { id: 7, sn: 'DFE322328070001', brand: 'SECRETHFT', model: '3122-SM' };
const PHOTO_ITEMS = [
  { id: 501, asset_id: 7, group_name: 'SecretHFT 出機檢查', kind: 'PHOTO', item_name: '正面', source_item_id: 61, photo_count: 2 },
];
const photo = (id, name, itemId = null) => ({
  id, asset_id: 7, file_name: `${name}-1787.jpg`, original_name: name,
  mime_type: 'image/jpeg', file_size: 1024, uploaded_by_name: '楊先生', checklist_item_id: itemId,
});
const PHOTOS = [photo(1, '正面1.jpg', 501), photo(2, '正面2.jpg', 501), photo(3, '其他A.jpg'), photo(4, '其他B.jpg')];

let downloads;
const realClick = HTMLAnchorElement.prototype.click;

beforeEach(() => {
  vi.clearAllMocks();
  downloads = [];
  window.alert = vi.fn();
  let n = 0;
  globalThis.URL.createObjectURL = vi.fn(() => `blob:fake-${(n += 1)}`);
  globalThis.URL.revokeObjectURL = vi.fn();
  // 攔下 <a download>.click()：記下存了哪個檔
  HTMLAnchorElement.prototype.click = function stub() { downloads.push(this.download); };
  window.electronAPI = {
    namedQuery: vi.fn(async (q) => (q === 'fetchAssetPhotos' ? { success: true, rows: PHOTOS } : { success: true, rows: [] })),
    saveFile: vi.fn(),
    loadMedia: vi.fn(async () => ({ success: true, blob: new Blob(['x']) })),
  };
});
afterEach(() => { HTMLAnchorElement.prototype.click = realClick; });

const openSection = async () => {
  render(<AssetPhotoSection device={DEVICE} photoItems={PHOTO_ITEMS} />);
  await screen.findByText('正面1.jpg');
  // 縮圖都載入了
  await waitFor(() => expect(screen.getAllByRole('img').length).toBe(4));
};

describe('照片預覽', () => {
  it('點縮圖：跳出預覽，不下載', async () => {
    await openSection();
    await userEvent.click(screen.getByRole('button', { name: '預覽 正面1.jpg' }));
    const dialog = screen.getByRole('dialog', { name: '照片預覽' });
    expect(within(dialog).getByText('正面1.jpg')).toBeInTheDocument();
    expect(within(dialog).getByText('正面')).toBeInTheDocument();
    expect(within(dialog).getByText('1 / 2')).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: '正面1.jpg' })).toHaveAttribute('src', expect.stringMatching(/^blob:fake-/));
    expect(downloads).toEqual([]);
  });

  it('預覽裡按「下載」才存檔，檔名是原本的', async () => {
    await openSection();
    await userEvent.click(screen.getByRole('button', { name: '預覽 正面1.jpg' }));
    await userEvent.click(screen.getByTestId('photo-preview-download'));
    await waitFor(() => expect(downloads).toEqual(['正面1.jpg']));
  });

  it('同一組裡切換上一張／下一張（按鈕與左右鍵）；不會跨到別組', async () => {
    await openSection();
    await userEvent.click(screen.getByRole('button', { name: '預覽 正面1.jpg' }));
    const dialog = screen.getByRole('dialog', { name: '照片預覽' });
    expect(within(dialog).queryByRole('button', { name: '上一張' })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '下一張' }));
    expect(within(dialog).getByText('正面2.jpg')).toBeInTheDocument();
    // 正面這一組只有兩張，最後一張沒有「下一張」
    expect(within(dialog).queryByRole('button', { name: '下一張' })).not.toBeInTheDocument();
    await userEvent.keyboard('{ArrowLeft}');
    expect(within(dialog).getByText('正面1.jpg')).toBeInTheDocument();
  });

  it('Esc、關閉鈕、點背景都能關掉', async () => {
    await openSection();
    await userEvent.click(screen.getByRole('button', { name: '預覽 其他A.jpg' }));
    expect(within(screen.getByRole('dialog', { name: '照片預覽' })).getByText('其他照片')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '照片預覽' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '預覽 其他B.jpg' }));
    await userEvent.click(screen.getByRole('button', { name: '關閉預覽' }));
    expect(screen.queryByRole('dialog', { name: '照片預覽' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '預覽 其他B.jpg' }));
    await userEvent.click(screen.getByRole('dialog', { name: '照片預覽' }));
    expect(screen.queryByRole('dialog', { name: '照片預覽' })).not.toBeInTheDocument();
    expect(downloads).toEqual([]);
  });

  it('卡片上的下載鈕照樣直接下載', async () => {
    await openSection();
    await userEvent.click(screen.getByRole('button', { name: '下載 其他B.jpg' }));
    await waitFor(() => expect(downloads).toEqual(['其他B.jpg']));
    expect(screen.queryByRole('dialog', { name: '照片預覽' })).not.toBeInTheDocument();
  });

  it('其他照片的縮圖大小一致（先前第二張以後會變成小縮圖）', async () => {
    await openSection();
    const a = screen.getByTestId('asset-photo-3');
    const b = screen.getByTestId('asset-photo-4');
    expect(a.style.width).toBe('132px');
    expect(b.style.width).toBe('132px');
  });
});
