import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoleContext } from '../context/RoleContext';

/**
 * 設備攜出入單頁面的線上簽核
 *
 * 簽核由伺服器判斷權限與內容是否異動；頁面依回傳的 permissions 顯示按鈕，
 * 簽名視窗用滑鼠或手寫板簽，匯出時只帶有效的簽名。
 */
// jsdom 畫不出來：拍照的部分換成回傳一張固定大小的假圖
vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({ width: 2246, height: 1588, toDataURL: () => 'data:image/jpeg;base64,/9j/4A==' })),
}));
import html2canvas from 'html2canvas';
import IsoEquipmentForm from '../pages/IsoEquipmentForm';
import { drawUploadedSignature } from '../components/SignaturePadModal';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const MOVES = [
  { move_date: '2026-10-01', direction: 'IN', reason: '進貨', vendor: '華峻', brand: 'ARISTA', model: 'DCS-7010TX', specification: '', sn: 'HBG254808R4' },
];

const renderPage = (user = { id: 7, username: 'tom', full_name: '王機房' }) => render(
  <RoleContext.Provider value={{ authUser: user }}>
    <MemoryRouter><IsoEquipmentForm /></MemoryRouter>
  </RoleContext.Provider>
);

/** 簽核 API：GET 表單月份回 state()；me/signature 回自己的簽名檔 mine */
const mockSign = (state, mine = null) => {
  window.electronAPI.isoSignature = vi.fn(async (method, form) => {
    if (form === 'me') return method === 'GET' ? { success: true, signaturePng: mine } : { success: true };
    return method === 'GET' ? { success: true, ...state() } : { success: true };
  });
};
const calls = (method, form) => window.electronAPI.isoSignature.mock.calls.filter(([m, f]) => m === method && f === form);
const MONTH = expect.stringMatching(/^\d{4}-\d{2}$/);

beforeEach(() => {
  vi.clearAllMocks();
  window.electronAPI = {
    namedQuery: vi.fn(async () => ({ success: true, rows: MOVES })),
  };
  // jsdom 沒有 canvas：給一個什麼都不畫的 2d context
  const ctx = { beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), clearRect: vi.fn() };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx);
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => PNG);
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  // jsdom 不載圖片，complete 永遠是 false：當作已載好
  Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
});

describe('線上簽核', () => {
  it('有權限的人：彈出簽名視窗，簽了才能確認；送出簽名後重新讀取狀態', async () => {
    let signed = false;
    mockSign(() => ({
      signatures: signed ? { ROOM_ADMIN: { userName: '王機房', signedAt: '2026-10-31T09:00:00Z', signaturePng: PNG, stale: false } } : {},
      permissions: { ROOM_ADMIN: { canSign: true, canRevoke: true }, SUPERVISOR: { canSign: false, canRevoke: false } },
    }));
    renderPage();
    const card = await screen.findByTestId('iso-sign-ROOM_ADMIN');
    expect(within(card).getByText('尚未簽核')).toBeInTheDocument();
    // 權責主管沒有權限：沒有簽核按鈕
    expect(within(screen.getByTestId('iso-sign-SUPERVISOR')).queryByRole('button')).toBeNull();

    fireEvent.click(await within(card).findByRole('button', { name: /簽核（機房管理員）/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('王機房')).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: '確認簽名' });
    expect(confirm).toBeDisabled();

    // 用手寫筆（或滑鼠）畫一筆
    const pad = within(dialog).getByLabelText('簽名板');
    fireEvent.pointerDown(pad, { pointerId: 1, clientX: 10, clientY: 10, pointerType: 'pen', pressure: 0.5 });
    fireEvent.pointerMove(pad, { pointerId: 1, clientX: 60, clientY: 30, pointerType: 'pen', pressure: 0.5 });
    fireEvent.pointerUp(pad, { pointerId: 1 });
    expect(confirm).not.toBeDisabled();

    // 還沒有簽名檔：預設勾「存成我的簽名檔」，簽的同時存下來
    expect(within(dialog).getByRole('checkbox', { name: /存成我的簽名檔/ })).toBeChecked();
    signed = true;
    fireEvent.click(confirm);
    await waitFor(() => expect(calls('PUT', 'me')).toEqual([['PUT', 'me', 'signature', undefined, { signature: PNG }]]));
    await waitFor(() => expect(window.electronAPI.isoSignature).toHaveBeenCalledWith('POST', 'S-408-02', expect.stringMatching(/^\d{4}-\d{2}$/), 'ROOM_ADMIN', { signature: PNG }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await within(card).findByText('已簽核')).toBeInTheDocument();
    expect(within(card).getByAltText('機房管理員簽名')).toHaveAttribute('src', PNG);
    // 有效的簽名不能直接重簽，只能撤銷
    expect(within(card).queryByRole('button', { name: /簽核（機房管理員）/ })).toBeNull();
    expect(within(card).getByRole('button', { name: '撤銷機房管理員簽核' })).toBeInTheDocument();
  });

  it('清除重簽會清掉畫布，確認又變回不能按', async () => {
    mockSign(() => ({ signatures: {}, permissions: { ROOM_ADMIN: { canSign: true, canRevoke: true } } }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /簽核（機房管理員）/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.pointerDown(within(dialog).getByLabelText('簽名板'), { pointerId: 1, clientX: 5, clientY: 5 });
    expect(within(dialog).getByRole('button', { name: '確認簽名' })).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: /清除重簽/ }));
    expect(within(dialog).getByRole('button', { name: '確認簽名' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.electronAPI.isoSignature).not.toHaveBeenCalledWith('POST', expect.anything(), expect.anything(), expect.anything(), expect.anything());
  });

  it('簽核後資料有異動：標示出來、可以重新簽核；表單頁尾與 PDF 只印有效的簽名', async () => {
    mockSign(() => ({
      signatures: {
        ROOM_ADMIN: { userName: '王機房', signedAt: '2026-10-31T09:00:00Z', signaturePng: PNG, stale: true },
        SUPERVISOR: { userName: '李主管', signedAt: '2026-10-31T10:00:00Z', signaturePng: PNG, stale: false },
      },
      permissions: { ROOM_ADMIN: { canSign: true, canRevoke: true }, SUPERVISOR: { canSign: false, canRevoke: false } },
    }));
    let pdfBlob = null;
    global.URL.createObjectURL = vi.fn((b) => { pdfBlob = b; return 'blob:x'; });
    global.URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { container } = renderPage();
    const admin = await screen.findByTestId('iso-sign-ROOM_ADMIN');
    expect(await within(admin).findByText(/簽核後資料有異動，請重新簽核/)).toBeInTheDocument();
    expect(within(admin).getByRole('button', { name: '重新簽核（機房管理員）' })).toBeInTheDocument();
    expect(within(screen.getByTestId('iso-sign-SUPERVISOR')).getByText('已簽核')).toBeInTheDocument();

    // 預覽的表單頁尾：只有權責主管的簽名
    const sheet = await waitFor(() => { const el = container.querySelector('.iso-equipment-sheet'); expect(el).not.toBeNull(); return el; });
    expect(within(sheet).getByAltText('權責主管簽名')).toBeInTheDocument();
    expect(within(sheet).queryByAltText('機房管理員簽名')).toBeNull();

    await waitFor(() => expect(screen.getByRole('button', { name: /下載 PDF/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /下載 PDF/ }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    // 每頁拍一張：拍的是畫面外原尺寸的那份，頁尾一樣只有有效的簽名
    expect(html2canvas).toHaveBeenCalledTimes(1);
    const shot = html2canvas.mock.calls[0][0];
    expect(shot.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(within(shot).queryByAltText('機房管理員簽名')).toBeNull();
    // 下載完那份已經拿掉（不在畫面上），只看它的內容
    expect(within(shot).queryByAltText('權責主管簽名')).not.toBeNull();
    expect(html2canvas.mock.calls[0][1]).toMatchObject({ scale: 2, width: 1123, height: 794 });
    expect(pdfBlob.type).toBe('application/pdf');
    const head = new TextDecoder().decode(new Uint8Array(await pdfBlob.slice(0, 8).arrayBuffer()));
    expect(head).toBe('%PDF-1.4');
    // 下載完畫面外那份就拿掉
    await waitFor(() => expect(container.ownerDocument.querySelector('[aria-hidden="true"] .iso-equipment-sheet')).toBeNull());
    clickSpy.mockRestore();
  });

  it('撤銷要先確認，確認後呼叫撤銷並重新讀取', async () => {
    mockSign(() => ({
      signatures: { SUPERVISOR: { userName: '李主管', signedAt: '2026-10-31T10:00:00Z', signaturePng: PNG, stale: false } },
      permissions: { ROOM_ADMIN: { canSign: false, canRevoke: true }, SUPERVISOR: { canSign: false, canRevoke: true } },
    }));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderPage();
    const btn = await screen.findByRole('button', { name: '撤銷權責主管簽核' });
    fireEvent.click(btn);
    expect(window.electronAPI.isoSignature).not.toHaveBeenCalledWith('DELETE', expect.anything(), expect.anything(), expect.anything());
    fireEvent.click(btn);
    await waitFor(() => expect(window.electronAPI.isoSignature).toHaveBeenCalledWith('DELETE', 'S-408-02', expect.stringMatching(/^\d{4}-\d{2}$/), 'SUPERVISOR'));
    expect(confirmSpy.mock.calls[1][0]).toContain('李主管');
    confirmSpy.mockRestore();
  });

  it('沒有權限又還沒簽：提示由指定的帳號簽核', async () => {
    mockSign(() => ({ signatures: {}, permissions: { ROOM_ADMIN: { canSign: false, canRevoke: false }, SUPERVISOR: { canSign: false, canRevoke: false } } }));
    renderPage();
    expect(await within(await screen.findByTestId('iso-sign-ROOM_ADMIN')).findByText(/由指定的帳號登入簽核/)).toBeInTheDocument();
    // 沒有簽核權限也不需要簽名檔
    expect(screen.queryByText(/我的簽名檔/)).toBeNull();
  });
});

describe('個人簽名檔', () => {
  it('有簽名檔：直接用自己帳號的簽名檔簽核（由伺服器讀取，不送圖）', async () => {
    mockSign(() => ({ signatures: {}, permissions: { SUPERVISOR: { canSign: true, canRevoke: true } } }), PNG);
    renderPage();
    expect(await screen.findByText('我的簽名檔：已設定')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /簽核（權責主管）/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByAltText('我的簽名檔')).toHaveAttribute('src', PNG);
    // 已有簽名檔：預設不覆蓋
    expect(within(dialog).getByRole('checkbox', { name: /同時更新為我的簽名檔/ })).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole('button', { name: '使用我的簽名檔簽核' }));
    await waitFor(() => expect(window.electronAPI.isoSignature).toHaveBeenCalledWith('POST', 'S-408-02', MONTH, 'SUPERVISOR', { useSaved: true }));
    expect(calls('PUT', 'me')).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('手寫但不勾存檔：只簽這一次，不改簽名檔', async () => {
    mockSign(() => ({ signatures: {}, permissions: { ROOM_ADMIN: { canSign: true, canRevoke: true } } }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /簽核（機房管理員）/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /存成我的簽名檔/ }));
    fireEvent.pointerDown(within(dialog).getByLabelText('簽名板'), { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.click(within(dialog).getByRole('button', { name: '確認簽名' }));
    await waitFor(() => expect(calls('POST', 'S-408-02')).toEqual([['POST', 'S-408-02', MONTH, 'ROOM_ADMIN', { signature: PNG }]]));
    expect(calls('PUT', 'me')).toHaveLength(0);
  });

  it('管理我的簽名檔：手寫或上傳後儲存、刪除', async () => {
    mockSign(() => ({ signatures: {}, permissions: { ROOM_ADMIN: { canSign: true, canRevoke: true } } }), PNG);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /管理我的簽名檔/ }));
    let dialog = screen.getByRole('dialog', { name: '我的簽名檔' });
    expect(within(dialog).getByAltText('我的簽名檔')).toBeInTheDocument();
    // 管理時沒有「使用我的簽名檔簽核」，也不用勾存檔
    expect(within(dialog).queryByRole('button', { name: '使用我的簽名檔簽核' })).toBeNull();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    fireEvent.pointerDown(within(dialog).getByLabelText('簽名板'), { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存簽名檔' }));
    await waitFor(() => expect(calls('PUT', 'me')).toEqual([['PUT', 'me', 'signature', undefined, { signature: PNG }]]));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls('POST', 'S-408-02')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /管理我的簽名檔/ }));
    dialog = screen.getByRole('dialog', { name: '我的簽名檔' });
    fireEvent.click(within(dialog).getByRole('button', { name: /刪除簽名檔/ }));
    await waitFor(() => expect(calls('DELETE', 'me')).toEqual([['DELETE', 'me', 'signature']]));
    expect(await screen.findByText('我的簽名檔：尚未設定')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('只能上傳 PNG、JPG', async () => {
    mockSign(() => ({ signatures: {}, permissions: { ROOM_ADMIN: { canSign: true, canRevoke: true } } }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /設定我的簽名檔/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('上傳簽名圖檔'), { target: { files: [new File(['x'], 'sign.gif', { type: 'image/gif' })] } });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('請選 PNG 或 JPG 圖檔');
    expect(within(dialog).getByRole('button', { name: '儲存簽名檔' })).toBeDisabled();
  });

  it('上傳的圖：等比例縮進簽名板置中，白底變透明', () => {
    // 2 個像素：一點白、一點深色
    const px = new Uint8ClampedArray([255, 255, 255, 255, 20, 20, 20, 255]);
    const ctx = { clearRect: vi.fn(), drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: px })), putImageData: vi.fn() };
    drawUploadedSignature(ctx, { width: 1160, height: 180 });
    // 寬度先碰到邊（四周留 10px）：580×90，置中
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 10, 55, 580, 90);
    expect(px[3]).toBe(0);
    expect(px[7]).toBe(255);
    expect(ctx.putImageData).toHaveBeenCalled();
  });
});
