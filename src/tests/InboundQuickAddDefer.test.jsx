import { describe, it, expect } from 'vitest';

/**
 * 快速新增的品項延後到送出時才建立
 *
 * 舊行為：在進貨頁按下「快速新增」的當下就寫進 item_master。使用者若沒有
 * 送出進貨單（關掉頁面、改變主意），那筆品項仍會留在列表上 ——
 * 庫存 0、沒有任何單據用過，正是先前要手動清掉的幽靈主檔。
 *
 * 新行為：暫存在該列上，送出時才在同一個交易裡建立（與採購單那條路一致，
 * 都是 insertItemMaster/insertInboundItemMaster + $ref）。放棄送出就什麼都沒發生。
 */
/**
 * 上面的元件測試依賴彈窗的欄位配置，較脆弱；
 * 真正把行為釘住的是下面這幾條 —— 直接檢查原始碼的結構。
 */
describe('延後建立的關鍵結構', () => {
  const src = () => require('fs').readFileSync('src/pages/Inbound.jsx', 'utf8');

  it('快速新增的存檔流程裡沒有 insertItemMaster', () => {
    const s = src();
    const start = s.indexOf('const handleQuickAddSave');
    const end = s.indexOf('const handleSubmit');
    expect(start).toBeGreaterThan(-1);
    expect(s.slice(start, end)).not.toContain('insertItemMaster');
  });

  it('改為存進列上的 pendingMaster', () => {
    const s = src();
    const start = s.indexOf('const handleQuickAddSave');
    const end = s.indexOf('const handleSubmit');
    expect(s.slice(start, end)).toContain('pendingMaster: {');
  });

  it('送出時才以 $ref 建立主檔', () => {
    const s = src();
    const start = s.indexOf('const handleSubmit');
    const body = s.slice(start);
    expect(body).toContain("queryName: 'insertItemMaster'");
    expect(body).toContain('newmaster_');
    expect(body).toContain('.rows.0.id');
  });

  it('送出前的檢查接受待建立的品項', () => {
    expect(src()).toContain('!i.itemId && !i.pendingMaster && !i.purchaseRecordId');
  });

  /** 已經有同樣品項就直接選用，否則送出時會撞上耗材的唯一索引 */
  it('快速新增會先查有沒有既有品項', () => {
    const s = src();
    const body = s.slice(s.indexOf('const handleQuickAddSave'), s.indexOf('const handleSubmit'));
    expect(body).toContain('checkDuplicateConsumable');
    expect(body).toContain('findItemMaster');
  });

  it('列上會標明這筆還沒建立', () => {
    expect(src()).toContain('送出後才建立');
  });
});
