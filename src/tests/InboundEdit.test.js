import { describe, it, expect } from 'vitest';
import {
  validateQtyChange, buildQtyChangeSteps, isQtyEditable,
  findUsedAssets, describeUsage, buildInboundDeleteSteps,
  collectMasterIds, describeOrphanMaster,
} from '../utils/inboundEdit';
import { queries } from '../../database/queries';

/**
 * 進貨明細的數量更正
 *
 * 明細建立後只改得了序號、訂單來源與單頭，數量完全動不了；
 * 打錯一個數字就得上伺服器把整張單刪掉重開。
 * 數量與庫存必須一起改，否則會出現「單據是 10、庫存卻是 100」。
 */
describe('數量的檢查', () => {
  it('算出與原本的差額', () => {
    expect(validateQtyChange(10, 25)).toMatchObject({ error: null, delta: 15, next: 25 });
    expect(validateQtyChange(100, '30')).toMatchObject({ error: null, delta: -70, next: 30 });
  });

  it('沒有改動就不送出，避免留下無意義的異動紀錄', () => {
    expect(validateQtyChange(10, 10)).toMatchObject({ unchanged: true, delta: 0 });
  });

  /** 0 等於這筆明細不該存在，那是刪除不是更正 */
  it('不接受 0 與負數', () => {
    expect(validateQtyChange(10, 0).error).toMatch(/大於 0/);
    expect(validateQtyChange(10, -5).error).toMatch(/大於 0/);
  });

  it('不接受小數與非數字', () => {
    expect(validateQtyChange(10, 2.5).error).toMatch(/整數/);
    expect(validateQtyChange(10, 'abc').error).toMatch(/整數/);
  });

  it('空白輸入要說「請輸入數量」，不是「必須大於 0」', () => {
    // Number('') 是 0，不先擋掉就會掉進大於 0 的檢查，訊息對不上
    expect(validateQtyChange(10, '').error).toBe('請輸入數量');
    expect(validateQtyChange(10, '   ').error).toBe('請輸入數量');
    expect(validateQtyChange(10, null).error).toBe('請輸入數量');
  });

  it('擋下明顯多打位數的情形', () => {
    expect(validateQtyChange(10, 1000000).error).toMatch(/位數/);
  });
});

describe('哪些明細可以改數量', () => {
  /** 一支序號就是一台，改數字不會多出或少掉一台資產，只會讓單據對不起來 */
  it('有序號的（設備／硬體）不給改', () => {
    expect(isQtyEditable({ sn: 'SRV-001' })).toBe(false);
    expect(isQtyEditable({ sn: '  SRV-001  ' })).toBe(false);
  });

  it('沒有序號的（耗材）可以改', () => {
    expect(isQtyEditable({ sn: '' })).toBe(true);
    expect(isQtyEditable({ sn: null })).toBe(true);
    expect(isQtyEditable({})).toBe(true);
  });
});

describe('更正數量的交易步驟', () => {
  it('明細與庫存一起改，兩步都要求改到一列', () => {
    const steps = buildQtyChangeSteps({ itemId: 7, itemMasterId: 42, nextQty: 25, delta: 15 });
    expect(steps.map((s) => s.queryName)).toEqual(['updateInboundItemQty', 'adjustItemMasterStock']);
    expect(steps[0].params).toEqual([25, 7]);
    expect(steps[1].params).toEqual([15, 42]);
    expect(steps.every((s) => s.expectRows === 1)).toBe(true);
  });

  it('沒有對應主檔時只改單據，不會憑空動別人的庫存', () => {
    const steps = buildQtyChangeSteps({ itemId: 7, itemMasterId: null, nextQty: 25, delta: 15 });
    expect(steps.map((s) => s.queryName)).toEqual(['updateInboundItemQty']);
  });

  it('減量時傳負的差額', () => {
    const steps = buildQtyChangeSteps({ itemId: 7, itemMasterId: 42, nextQty: 3, delta: -7 });
    expect(steps[1].params[0]).toBe(-7);
  });
});

/**
 * 刪除整張進貨單
 *
 * 規則與 scripts/delete-inbound-order.mjs 相同 —— 那支腳本原本是唯一的途徑，
 * 但得登入伺服器才能用。
 */
describe('已被動用的資產要擋下來', () => {
  const rows = [
    { sn: 'A1', outbound: 0, repair: 0, lab: 0, mounted: 0 },
    { sn: 'A2', outbound: 1, repair: 0, lab: 0, mounted: 0 },
    { sn: 'A3', outbound: 0, repair: 0, lab: 0, mounted: 2 },
  ];

  it('任何一種痕跡都算被動用', () => {
    expect(findUsedAssets(rows).map((r) => r.sn)).toEqual(['A2', 'A3']);
  });

  it('全新未動用時回空陣列', () => {
    expect(findUsedAssets([rows[0]])).toEqual([]);
    expect(findUsedAssets([])).toEqual([]);
    expect(findUsedAssets(null)).toEqual([]);
  });

  it('說得出是為什麼不能刪', () => {
    expect(describeUsage({ sn: 'A2', outbound: 1, repair: 0, lab: 0, mounted: 0 }))
      .toBe('A2：出貨或借用 1 筆');
    expect(describeUsage({ sn: 'A3', outbound: 0, repair: 1, lab: 2, mounted: 3 }))
      .toBe('A3：維修 1 筆、借測調撥 2 筆、有 3 個硬體掛載於此');
  });
});

describe('刪除進貨單的交易步驟', () => {
  const items = [
    { item_id: 10, quantity: 5, purchase_record_id: 99 },
    { item_id: 11, quantity: 3, purchase_record_id: null },
  ];

  it('順序與腳本一致：扣庫存 → 退採購 → 刪資產 → 刪單據', () => {
    const steps = buildInboundDeleteSteps({ orderId: 1, items, assetSns: ['A1'] });
    expect(steps.map((s) => s.queryName)).toEqual([
      'reverseStockQtyOnInboundDelete',
      'reverseStockQtyOnInboundDelete',
      'reversePurchaseRecordOnInboundDelete',
      'deleteAssetsBySnList',
      'deleteInboundOrderById',
    ]);
  });

  it('只有來自採購單的明細才退回採購數量', () => {
    const steps = buildInboundDeleteSteps({ orderId: 1, items, assetSns: [] });
    const po = steps.filter((s) => s.queryName === 'reversePurchaseRecordOnInboundDelete');
    expect(po).toHaveLength(1);
    expect(po[0].params).toEqual([5, 99]);
  });

  it('沒有資產就不下刪除資產那一步', () => {
    const steps = buildInboundDeleteSteps({ orderId: 1, items, assetSns: [] });
    expect(steps.some((s) => s.queryName === 'deleteAssetsBySnList')).toBe(false);
  });

  it('沒有主檔的明細不扣庫存', () => {
    const steps = buildInboundDeleteSteps({ orderId: 1, items: [{ item_id: null, quantity: 5 }], assetSns: [] });
    expect(steps.map((s) => s.queryName)).toEqual(['deleteInboundOrderById']);
  });

  it('刪單那一步一定要改到一列，否則整批退回', () => {
    const steps = buildInboundDeleteSteps({ orderId: 1, items: [], assetSns: [] });
    expect(steps[steps.length - 1]).toMatchObject({ queryName: 'deleteInboundOrderById', expectRows: 1 });
  });
});

describe('用到的查詢都存在且語意正確', () => {
  it.each([
    'updateInboundItemQty', 'adjustItemMasterStock', 'fetchInboundAssetUsage',
    'deleteAssetsBySnList', 'deleteInboundOrderById',
    'reverseStockQtyOnInboundDelete', 'reversePurchaseRecordOnInboundDelete',
  ])('%s', (name) => {
    expect(queries[name], name).toBeTruthy();
  });

  it('庫存調整夾在 0 以上，不會變成負數', () => {
    expect(queries.adjustItemMasterStock).toContain('GREATEST(COALESCE(stock_qty, 0) + $1::integer, 0)');
  });

  it('改數量與刪單都回傳資料列，呼叫端才知道有沒有真的改到', () => {
    expect(queries.updateInboundItemQty).toContain('RETURNING');
    expect(queries.deleteInboundOrderById).toContain('RETURNING');
  });
});

/**
 * 刪單後的孤兒品項
 *
 * 進貨頁的「快速新增」會當場建出主檔，與送不送出單據無關。
 * 單子刪掉後那筆主檔仍留在列表上，庫存 0、沒有任何單據用過 ——
 * 正是先前要手動清掉的那種幽靈品項。不自動刪，問一句由使用者決定。
 */
describe('刪單後的孤兒品項', () => {
  it('收集這張單用到的品項，去掉重複與空值', () => {
    expect(collectMasterIds([
      { item_id: 5 }, { item_id: 5 }, { item_id: 7 }, { item_id: null }, {}, { item_id: 0 },
    ])).toEqual([5, 7]);
    expect(collectMasterIds([])).toEqual([]);
    expect(collectMasterIds(null)).toEqual([]);
  });

  it('說得出是哪一個品項', () => {
    expect(describeOrphanMaster({ brand: 'ARISTA', type: 'GBIC', model: '10G-LR', category_name: '耗材' }))
      .toBe('　· ARISTA GBIC 10G-LR（耗材）');
    expect(describeOrphanMaster({ brand: 'A', model: 'B', specification: '2 Port', category_name: '硬體' }))
      .toBe('　· A B / 2 Port（硬體）');
  });

  /** 少檢查一張表就會連帶刪掉歷史帳務且毫無警告 */
  it('判定條件涵蓋五張 CASCADE 母表與庫存', () => {
    const sql = queries.fetchOrphanItemMasters;
    for (const t of ['assets', 'inbound_items', 'outbound_items',
      'item_lab_assignments', 'inventory_monthly_balances']) {
      expect(sql, t).toContain(t);
    }
    expect(sql).toContain('COALESCE(i.stock_qty, 0) = 0');
    expect(sql).toContain('COALESCE(i.lab_qty, 0) = 0');
  });

  it('實際刪除那支也補上了月結存檢查', () => {
    expect(queries.deleteItemMasterIfOrphan).toContain('inventory_monthly_balances');
  });
});
