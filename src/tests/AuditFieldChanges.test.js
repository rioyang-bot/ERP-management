import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  diffFields, describeChanges, fileChange, fileNameOf, normalizeValue, logFieldChanges,
} from '../utils/auditLogger';

/**
 * 欄位變更紀錄的共用工具
 *
 * 每個可編輯欄位改了都要記「變更前 → 變更後」；照片、附件記檔名。
 */
describe('欄位變更紀錄工具', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI.namedQuery.mockResolvedValue({ success: true, rows: [] });
  });

  it('只列出有變的欄位，含變更前與變更後', () => {
    const changes = diffFields(
      { hostname: 'NeoTap', location: 'UAT DC', client: '凱基' },
      { hostname: 'NeoTap-02', location: 'UAT DC', client: '' },
      [
        { key: 'hostname', label: '主機名稱' },
        { key: 'location', label: '放置位置' },
        { key: 'client', label: '客戶' },
      ],
    );
    expect(changes).toEqual([
      { field: 'hostname', label: '主機名稱', from: 'NeoTap', to: 'NeoTap-02' },
      { field: 'client', label: '客戶', from: '凱基', to: '' },
    ]);
  });

  it('null、undefined、空字串、前後空白視為相同，不算變更', () => {
    const fields = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }];
    expect(diffFields({ a: null, b: ' x ', c: undefined }, { a: '', b: 'x', c: null }, fields)).toEqual([]);
  });

  it('format 把代碼轉成顯示文字再比對', () => {
    const label = { FOR_SALE: '銷售用', COMPANY: '公司資產' };
    expect(diffFields({ ownership: 'FOR_SALE' }, { ownership: 'COMPANY' }, [
      { key: 'ownership', label: '歸屬', format: (v) => label[v] || v },
    ])).toEqual([{ field: 'ownership', label: '歸屬', from: '銷售用', to: '公司資產' }]);
  });

  it('陣列、布林、物件轉成可讀文字', () => {
    expect(normalizeValue(['A', 'B'])).toBe('A、B');
    expect(normalizeValue(true)).toBe('是');
    expect(normalizeValue(false)).toBe('否');
    expect(normalizeValue({ x: 1 })).toBe('{"x":1}');
    expect(normalizeValue(12)).toBe('12');
  });

  it('敘述寫成「欄位：舊 → 新」，空的寫（空白）', () => {
    expect(describeChanges([
      { label: '主機名稱', from: 'A', to: 'B' },
      { label: '客戶', from: '凱基', to: '' },
      null,
    ])).toBe('主機名稱：A → B；客戶：凱基 → （空白）');
  });

  it('檔案變更記檔名；沒換就不記', () => {
    expect(fileChange('正面照片', 'old.jpg', 'new.jpg', 'photo')).toEqual({ field: 'photo', label: '正面照片', from: 'old.jpg', to: 'new.jpg', kind: 'file' });
    expect(fileChange('正面照片', 'same.jpg', 'same.jpg')).toBeNull();
    expect(fileChange('LOGO', '', 'logo.png')).toMatchObject({ from: '', to: 'logo.png' });
  });

  it('從網址或路徑取出檔名', () => {
    expect(fileNameOf('/uploads/assets/12/front-abc.jpg')).toBe('front-abc.jpg');
    expect(fileNameOf('https://x/uploads/%E7%85%A7%E7%89%87.png?v=2')).toBe('照片.png');
    expect(fileNameOf('data:image/png;base64,AAAA')).toBe('（內嵌圖片）');
    expect(fileNameOf(null)).toBe('');
  });

  it('logFieldChanges：寫一筆 UPDATE，敘述含變更前後，details.changes 為清單', async () => {
    const changes = [{ field: 'hostname', label: '主機名稱', from: 'A', to: 'B' }];
    await logFieldChanges('DEVICE', 'SN001', 'SN001', '設備 [SN001] 編輯詳細資訊', changes, { sn: 'SN001' });

    const call = window.electronAPI.namedQuery.mock.calls.find(([q]) => q === 'insertAuditLog');
    expect(call).toBeTruthy();
    const [, params] = call;
    expect(params[3]).toBe('UPDATE');
    expect(params[8]).toBe('設備 [SN001] 編輯詳細資訊：主機名稱：A → B');
    expect(params[9]).toEqual({ sn: 'SN001', changes });
  });

  it('logFieldChanges：沒有任何變更就不記', async () => {
    const res = await logFieldChanges('DEVICE', 'SN001', 'SN001', '編輯', [null]);
    expect(res).toBeNull();
    expect(window.electronAPI.namedQuery).not.toHaveBeenCalled();
  });
});
