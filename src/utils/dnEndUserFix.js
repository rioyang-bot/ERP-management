/**
 * 出貨單明細修改 End-user
 *
 * 改單頭的 End-user；單上有設備／硬體（有序號的品項）時，一併覆蓋那些資產的 End-user，
 * 設備上搭載的硬體也一起覆蓋。任何狀態都能改（只改 End-user，不動品項與庫存）。
 * 同一個交易，並寫一筆事件紀錄（改之前、改之後、覆蓋了哪些序號）。
 *
 * 資產的 End-user 有欄位與 custom_attributes 兩處，查詢兩處一起寫（見 updateAssetEndUserBySn）。
 */
import { logUpdate } from './auditLogger';

/** 單上有序號的品項（設備／硬體）；同一支序號只算一次 */
export const serialItems = (items = []) => {
  const seen = new Set();
  return items.filter((it) => {
    const sn = String(it.sn ?? '').trim();
    if (!sn || seen.has(sn.toUpperCase())) return false;
    seen.add(sn.toUpperCase());
    return true;
  });
};

export function buildEndUserFixSteps(dnId, endUser, items = []) {
  const steps = [{
    id: 'header',
    queryName: 'updateOutboundRequestEndUser',
    params: [endUser, dnId],
    expectRows: 1,
    errorMessage: '找不到這張出貨單，可能已被刪除。',
  }];
  serialItems(items).forEach((it, i) => {
    const sn = String(it.sn).trim();
    steps.push(
      { id: `asset-${i}`, queryName: 'updateAssetEndUserBySn', params: [endUser, sn] },
      // 設備上搭載的硬體一起覆蓋（硬體本身沒有搭載，0 筆）
      { id: `mounted-${i}`, queryName: 'updateMountedHardwareEndUser', params: [endUser, sn] },
    );
  });
  return steps;
}

/**
 * @returns {Promise<{ assetSns: string[] }>} 實際覆蓋到的資產序號（含搭載的硬體）
 */
export async function fixDnEndUser(dn, items, newEndUser) {
  const next = String(newEndUser ?? '').trim();
  const before = String(dn.end_user ?? '').trim();
  const res = await window.electronAPI.runTransaction(buildEndUserFixSteps(dn.id, next, items));
  if (!res.success) throw new Error(res.error || '修改 End-user 失敗');

  const assetSns = [...new Set(Object.entries(res.results || {})
    .filter(([id]) => id.startsWith('asset-') || id.startsWith('mounted-'))
    .flatMap(([, r]) => (r?.rows || []).map((row) => row.sn))
    .filter(Boolean))];
  await logUpdate('OUTBOUND', dn.request_no, dn.customer || '出貨單',
    `修改出貨單 [${dn.request_no}] End-user：[${before || '未填'}] → [${next || '未填'}]`
      + (assetSns.length ? `，覆蓋資產 ${assetSns.length} 件` : ''),
    { dnId: dn.id, dnNumber: dn.request_no, before, after: next, endUserSns: assetSns });
  return { assetSns };
}
