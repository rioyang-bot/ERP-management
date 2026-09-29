/**
 * 進貨明細的數量更正與整張單刪除
 *
 * 先前這兩件事都做不到：明細建立後只改得了序號、訂單來源與單頭（廠商、
 * 發票、日期），數量與品項完全動不了；要更正只能上伺服器跑
 * scripts/delete-inbound-order.mjs 把整張單刪掉重開。打錯一個數字就得這樣，
 * 代價太高。
 *
 * 兩件事都會動到庫存，因此規則集中在這裡並各自有測試 ——
 * 散在畫面元件裡的話，很難確認「庫存到底有沒有跟著改」。
 */

/** 數量必須是正整數 —— 0 等於這筆明細不該存在，那是刪除不是更正 */
export function validateQtyChange(oldQty, nextRaw) {
  const text = String(nextRaw ?? '').trim();
  // Number('') 是 0，不先擋掉的話空白輸入會得到「必須大於 0」這種對不上的訊息
  if (text === '') return { error: '請輸入數量' };
  const next = Number(text);
  if (!Number.isInteger(next)) return { error: '數量必須是整數' };
  if (next <= 0) return { error: '數量必須大於 0。若這筆明細不該存在，請刪除整張進貨單重開。' };
  if (next > 999999) return { error: '數量看起來不合理，請確認是否多打了位數' };
  const from = Number(oldQty || 0);
  if (next === from) return { error: null, unchanged: true, delta: 0, next };
  return { error: null, unchanged: false, delta: next - from, next };
}

/**
 * 更正數量的交易步驟：明細與庫存一起改，缺一不可。
 *
 * expectRows 讓改不到的那一步直接讓整批退回 —— 例如明細已被別人刪掉，
 * 若沒有這道把關就會變成「庫存改了、明細沒改」。
 */
export function buildQtyChangeSteps({ itemId, itemMasterId, nextQty, delta }) {
  const steps = [
    {
      id: 'item',
      queryName: 'updateInboundItemQty',
      params: [nextQty, itemId],
      expectRows: 1,
      errorMessage: '找不到這筆進貨明細，可能已被刪除',
    },
  ];
  // 沒有對應主檔的明細（資料不全）就只改單據，不要憑空動別人的庫存
  if (itemMasterId) {
    steps.push({
      id: 'stock',
      queryName: 'adjustItemMasterStock',
      params: [delta, itemMasterId],
      expectRows: 1,
      errorMessage: '找不到對應的品項主檔，庫存未調整',
    });
  }
  return steps;
}

/**
 * 序號品項（設備／硬體）的數量不該用這種方式改：
 * 一支序號就是一台，數量恆為 1，改數字並不會多出或少掉一台資產，
 * 只會讓單據與實際資產對不起來。
 */
export function isQtyEditable(item) {
  return !String(item?.sn ?? '').trim();
}

/** 已經被動用過的資產：出貨、維修、借測，或有硬體掛載在它上面 */
export function findUsedAssets(usageRows) {
  return (usageRows || []).filter(
    (r) => Number(r.outbound) || Number(r.repair) || Number(r.lab) || Number(r.mounted)
  );
}

/** 把「不能刪」的原因寫成看得懂的句子 */
export function describeUsage(row) {
  const parts = [];
  if (Number(row.outbound)) parts.push(`出貨或借用 ${row.outbound} 筆`);
  if (Number(row.repair)) parts.push(`維修 ${row.repair} 筆`);
  if (Number(row.lab)) parts.push(`借測調撥 ${row.lab} 筆`);
  if (Number(row.mounted)) parts.push(`有 ${row.mounted} 個硬體掛載於此`);
  return `${row.sn}：${parts.join('、')}`;
}

/**
 * 刪除整張進貨單的交易步驟，與 scripts/delete-inbound-order.mjs 同一套順序：
 *   1. 扣回入庫時加上的庫存
 *   2. 退回採購單的已入庫數量與狀態
 *   3. 刪除該單建立的資產
 *   4. 刪除進貨單（明細由外鍵連動刪除）
 *
 * 呼叫端必須先確認沒有任何資產被動用過（findUsedAssets）。
 */
export function buildInboundDeleteSteps({ orderId, items = [], assetSns = [] }) {
  const steps = [];

  for (const it of items) {
    if (!it.item_id) continue;
    steps.push({
      queryName: 'reverseStockQtyOnInboundDelete',
      params: [it.quantity, it.item_id],
      errorMessage: '扣回庫存失敗',
    });
  }

  for (const it of items) {
    if (!it.purchase_record_id) continue;
    steps.push({
      queryName: 'reversePurchaseRecordOnInboundDelete',
      params: [it.quantity, it.purchase_record_id],
      errorMessage: '退回採購單已入庫數量失敗',
    });
  }

  if (assetSns.length > 0) {
    steps.push({
      queryName: 'deleteAssetsBySnList',
      params: [assetSns],
      errorMessage: '刪除該單建立的資產失敗',
    });
  }

  steps.push({
    queryName: 'deleteInboundOrderById',
    params: [orderId],
    expectRows: 1,
    errorMessage: '刪除進貨單失敗',
  });

  return steps;
}

/**
 * 刪掉進貨單之後，哪些品項變成「從來沒真正進過貨」的孤兒。
 *
 * 進貨頁的「快速新增」會當場建出主檔，與送不送出單據無關。單子刪掉後
 * 那筆主檔仍會留在列表上，庫存 0、沒有任何單據用過 ——
 * 下次有人搜尋會以為系統裡真的有這個東西。
 *
 * 不自動刪除：品項定義本來就可以獨立於單據存在（下次進同一批貨還會用到），
 * 只是這一次很可能是跟著打錯的單一起建的。因此問一句，由使用者決定。
 */
export function describeOrphanMaster(m) {
  const name = [m.brand, m.type, m.model].filter(Boolean).join(' ');
  return `　· ${name}${m.specification ? ` / ${m.specification}` : ''}（${m.category_name || '未分類'}）`;
}

/** 這張單用到的品項主檔，去掉重複與空值 */
export function collectMasterIds(items) {
  return [...new Set((items || []).map((i) => i?.item_id).filter((id) => Number.isInteger(Number(id)) && Number(id) > 0).map(Number))];
}
