import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AssetPhotoSection from '../components/AssetPhotoSection';
import { namePastedImage, imagesFromPasteEvent, readClipboardImages } from '../utils/clipboardImages';

/**
 * 主機照片：用貼上的方式上傳
 *
 * 截圖、從聊天軟體複製的照片，不必先存成檔案再選：
 *   - 點選拍照項目那一列後按 Ctrl+V
 *   - 按「貼上」鈕（讀剪貼簿）
 * 剪貼簿的圖片檔名幾乎都是 image.png，依設備序號、拍照項目與時間重新命名。
 */
const DEVICE = { id: 7, sn: 'BC0099', brand: 'BLACKCORE', model: '3122-SM' };
const ITEMS = [
  { id: 501, kind: 'PHOTO', item_name: '正面', description: null },
  { id: 502, kind: 'PHOTO', item_name: '機櫃內配線', description: null },
];
const png = () => new File(['x'], 'image.png', { type: 'image/png' });
/** 模擬 Ctrl+V：剪貼簿裡有一張圖片 */
const pasteImage = (target = document, blobs = [png()]) => fireEvent.paste(target, {
  clipboardData: {
    items: blobs.map((b) => ({ kind: 'file', type: b.type, getAsFile: () => b })),
    files: blobs,
  },
});

describe('命名與讀取', () => {
  it('依設備序號、拍照項目與時間命名，不留存檔會出問題的字元', () => {
    const f = namePastedImage(new Blob(['x'], { type: 'image/png' }), { sn: 'BC0099', itemName: '機櫃 內/配線', now: new Date(2026, 9, 6, 9, 5, 3) });
    expect(f.name).toBe('BC0099_機櫃_內_配線_20261006-090503.png');
    expect(f.type).toBe('image/png');
    // 一次貼好幾張，加上序號
    expect(namePastedImage(new Blob(['x'], { type: 'image/jpeg' }), { sn: 'A', itemName: 'B', index: 1, now: new Date(2026, 0, 1) }).name).toBe('A_B_20260101-000000-2.jpg');
  });

  it('Ctrl+V 只取圖片，文字照常貼上', () => {
    const img = png();
    expect(imagesFromPasteEvent({ clipboardData: { items: [{ kind: 'string', type: 'text/plain' }, { kind: 'file', type: 'image/png', getAsFile: () => img }] } })).toEqual([img]);
    expect(imagesFromPasteEvent({ clipboardData: { items: [{ kind: 'string', type: 'text/plain' }], files: [] } })).toEqual([]);
  });

  it('「貼上」鈕讀剪貼簿；不支援或沒有權限時說明改用 Ctrl+V', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    await expect(readClipboardImages({ read: async () => [{ types: ['text/plain', 'image/png'], getType: async () => blob }] })).resolves.toEqual([blob]);
    await expect(readClipboardImages(undefined)).rejects.toThrow('Ctrl+V');
    await expect(readClipboardImages({ read: async () => { throw new Error('NotAllowedError'); } })).rejects.toThrow('沒有允許讀取剪貼簿');
  });
});

describe('主機照片區塊', () => {
  let calls;
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.electronAPI = {
      namedQuery: vi.fn(async (query, params) => {
        calls.push({ query, params });
        if (query === 'fetchAssetPhotos') return { success: true, rows: [] };
        if (query === 'insertAssetPhoto') return { success: true, rows: [{ id: 99 }] };
        return { success: true, rows: [] };
      }),
      saveFile: vi.fn(async (name) => ({ success: true, fileName: `${name}-1787` })),
      loadMedia: vi.fn(async () => ({ success: true, blob: new Blob(['x']) })),
    };
  });
  const inserted = () => calls.filter((c) => c.query === 'insertAssetPhoto');

  const renderItems = async () => {
    render(<AssetPhotoSection device={DEVICE} photoItems={ITEMS} onChanged={vi.fn()} />);
    await screen.findByText('正面');
  };

  it('點選某一列後按 Ctrl+V，照片掛到那一項', async () => {
    await renderItems();
    await userEvent.click(screen.getByTestId('photo-item-502'));
    expect(screen.getByTestId('photo-item-502')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('photo-item-paste-hint-502')).toHaveTextContent('按 Ctrl+V 貼上');

    pasteImage();
    await waitFor(() => expect(inserted()).toHaveLength(1));
    // 最後一個參數是拍照項目
    expect(inserted()[0].params.at(-1)).toBe(502);
    expect(inserted()[0].params[2]).toMatch(/^BC0099_機櫃內配線_\d{8}-\d{6}\.png$/);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('的「機櫃內配線」上傳這 1 張照片'));
  });

  it('沒有點選任何一列時 Ctrl+V 不會上傳', async () => {
    await renderItems();
    pasteImage();
    await act(async () => {});
    expect(inserted()).toHaveLength(0);
  });

  it('游標在輸入框裡時不攔截，照常貼上文字', async () => {
    render(
      <>
        <input aria-label="其他輸入框" />
        <AssetPhotoSection device={DEVICE} photoItems={ITEMS} onChanged={vi.fn()} />
      </>
    );
    await screen.findByText('正面');
    await userEvent.click(screen.getByTestId('photo-item-501'));
    pasteImage(screen.getByLabelText('其他輸入框'));
    await act(async () => {});
    expect(inserted()).toHaveLength(0);
  });

  it('再點一次取消選取', async () => {
    await renderItems();
    await userEvent.click(screen.getByTestId('photo-item-501'));
    await userEvent.click(screen.getByTestId('photo-item-501'));
    expect(screen.getByTestId('photo-item-501')).toHaveAttribute('aria-selected', 'false');
  });

  it('每一列的「貼上」鈕讀剪貼簿，貼到那一項', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: async () => [{ types: ['image/png'], getType: async () => blob }] },
    });
    await renderItems();
    await userEvent.click(screen.getByRole('button', { name: '貼上 正面 的照片' }));
    await waitFor(() => expect(inserted()).toHaveLength(1));
    expect(inserted()[0].params.at(-1)).toBe(501);
  });

  it('剪貼簿裡沒有圖片就說明，不上傳', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: async () => [{ types: ['text/plain'], getType: async () => new Blob(['hi']) }] },
    });
    await renderItems();
    await userEvent.click(screen.getByRole('button', { name: '貼上其他照片' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('剪貼簿裡沒有圖片')));
    expect(inserted()).toHaveLength(0);
  });

  it('沒有拍照項目的設備：點選區塊後 Ctrl+V 上傳為一般照片', async () => {
    render(<AssetPhotoSection device={DEVICE} photoItems={[]} onChanged={vi.fn()} />);
    await userEvent.click(await screen.findByTestId('photo-paste-zone'));
    expect(screen.getByTestId('photo-paste-zone')).toHaveTextContent('已選取：按 Ctrl+V 貼上照片');
    pasteImage();
    await waitFor(() => expect(inserted()).toHaveLength(1));
    expect(inserted()[0].params.at(-1)).toBeNull();
  });
});
