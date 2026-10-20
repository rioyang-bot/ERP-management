/**
 * 借用單登記歸還（借用列表與維修完工共用）
 *
 * 整張單放在同一個交易：
 *   - 隨設備借出的掛載耗材：回到 LAB，重新掛回原來那台設備
 *   - 耗材：借出時扣掉的數量加回庫存
 *   - 設備／硬體：改回在庫，掛在設備上的硬體跟著（見 utils/mountedHwSync.js）
 *   - 單據改成已歸還並寫入歸還日
 * 交易完成後，設備／硬體與跟著回來的硬體各記一筆，借用單本身也記一筆。
 */
import { logStatusChange } from './auditLogger';
import { createBackToStockTracker } from './mountedHwSync';
import { isMountedRow, lendReturnMountedSteps } from './mountedConsumables';

/**
 * @param {{ id: number, request_no: string, customer?: string }} dn 借用單
 * @param {string} date 歸還日 YYYY-MM-DD
 * @param {object} [opts]
 * @param {string} [opts.note] 寫在事件紀錄後面的說明（例如「維修單 [RMA-…] 完工時一併歸還」）
 * @returns {Promise<{ itemsCount: number }>}
 */
export async function returnLendOrder(dn, date, { note = '' } = {}) {
  const res = await window.electronAPI.namedQuery('fetchDNItems', [dn.id]);
  if (!res.success) throw new Error('讀取明細失敗');
  const items = res.rows || [];

  const steps = [];
  const back = createBackToStockTracker();
  for (const item of items) {
    if (isMountedRow(item)) {
      steps.push(...lendReturnMountedSteps(item, dn.request_no, '歸還'));
    } else if (item.category_name === '耗材') {
      // 耗材沒有序號可以改狀態，借出時扣掉的數量要在這裡加回庫存，
      // 否則單子雖然標記為已歸還，庫存卻永遠短少那些數量
      steps.push({
        queryName: 'updateStockQtyOnLendReturn',
        params: [item.quantity, item.item_id],
        expectRows: 1,
        errorMessage: `回補耗材 [${item.brand} ${item.model}] 庫存失敗，查無此品項。`,
      });
    } else if ((item.category_name === '硬體' || item.category_name === '設備') && item.sn) {
      steps.push(...back.steps(item));
    }
  }
  steps.push({
    queryName: 'updateOutboundRequestReturned',
    params: [dn.id, date],
    expectRows: 1,
    errorMessage: '變更借用單狀態失敗。',
  });

  const txRes = await window.electronAPI.runTransaction(steps);
  if (!txRes.success) {
    throw new Error((txRes.error || '登記歸還失敗。') + '\n\n所有變更已全部退回，庫存與單據狀態維持原樣。');
  }

  const suffix = note ? `（${note}）` : '';
  await back.log(txRes.results, `借用單 [${dn.request_no}] 歸還入庫（歸還日 ${date}）${suffix}`,
    { dnNumber: dn.request_no, returnDate: date });
  await logStatusChange(
    'LENT', dn.request_no, dn.customer || '借用單', 'SHIPPED', 'RETURNED',
    `登記借用單 [${dn.request_no}] 歸還入庫 (歸還日: ${date}, 共 ${items.length} 項品項)${suffix}`,
    { dnId: dn.id, dnNumber: dn.request_no, customer: dn.customer, returnDate: date, itemsCount: items.length, items: items.map((i) => ({ model: i.model, brand: i.brand, sn: i.sn })) }
  );
  return { itemsCount: items.length };
}
