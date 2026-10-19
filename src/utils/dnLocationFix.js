/**
 * 更正出貨單的出貨地點
 *
 * 修改出貨單只開放「待確認」的單；已出貨的單打錯地點就沒有地方改。
 * 這裡只改地點，不動品項與庫存，所以任何狀態都可以改：
 *   - 單頭的出貨地點
 *   - 品項的發送位置：原本跟單頭一樣的才改（個別指定別處的不動）
 *   - 單上有序號、還在客戶端（已出貨）且地點還是舊地點的資產
 * 三步在同一個交易裡，並寫一筆事件紀錄（改之前、改之後、連帶改了哪些）。
 */
import { logUpdate } from './auditLogger';

export function buildLocationFixSteps(dnId, oldLocation, newLocation) {
  return [
    {
      id: 'header',
      queryName: 'fixOutboundRequestLocation',
      params: [newLocation, dnId],
      expectRows: 1,
      errorMessage: '找不到這張出貨單，可能已被刪除。',
    },
    { id: 'items', queryName: 'fixOutboundItemsLocation', params: [newLocation, dnId, oldLocation] },
    { id: 'assets', queryName: 'fixShippedAssetsLocation', params: [newLocation, dnId, oldLocation] },
  ];
}

/**
 * @returns {Promise<{ itemsUpdated: number, assetSns: string[] }>}
 */
export async function fixDnLocation(dn, newLocation) {
  const next = String(newLocation ?? '').trim();
  const before = String(dn.location ?? '').trim();
  const res = await window.electronAPI.runTransaction(buildLocationFixSteps(dn.id, before, next));
  if (!res.success) throw new Error(res.error || '更正出貨地點失敗');

  const oldLocation = res.results?.header?.rows?.[0]?.old_location ?? before;
  const itemsUpdated = res.results?.items?.rows?.length || 0;
  const assetSns = (res.results?.assets?.rows || []).map((r) => r.sn).filter(Boolean);
  await logUpdate('OUTBOUND', dn.request_no, dn.customer || '出貨單',
    `更正出貨單 [${dn.request_no}] 出貨地點：[${oldLocation || '未填'}] → [${next || '未填'}]`
      + `（品項 ${itemsUpdated} 筆${assetSns.length ? `、資產 ${assetSns.join('、')}` : ''}）`,
    { dnId: dn.id, dnNumber: dn.request_no, before: oldLocation, after: next, itemsUpdated, assetSns });
  return { itemsUpdated, assetSns };
}
