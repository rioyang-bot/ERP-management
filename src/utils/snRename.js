/**
 * 更正資產序號
 *
 * 序號在這套系統裡是以「字串」被好幾個地方記著的，改一處而漏掉其他處，
 * 那些地方就會留著一個已經不存在的序號：
 *
 *   assets.sn                                  資產本身
 *   custom_attributes.server_sn                掛在這台設備上的硬體
 *   custom_attributes.mounted_hw_sns           這台設備掛了哪些硬體（逗號分隔）
 *   inbound_items.sn / outbound_items.sn       進貨、出貨明細
 *   repair_items.sn                            維修單明細
 *
 * 因此一律整組放進同一個交易，全部成功才提交。
 */

/** 前後空白與大小寫不影響是否算同一個序號 */
export const isSameSn = (a, b) =>
  String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase();

/**
 * 更正序號的檢查結果。
 *
 * @param {string} oldSn 目前的序號
 * @param {string} newSn 要改成的序號
 * @returns {string} 不能執行的原因；可以執行時回傳空字串
 */
export function validateSnRename(oldSn, newSn) {
  const from = String(oldSn ?? '').trim();
  const to = String(newSn ?? '').trim();
  if (!from) return '這一筆沒有序號，無法更正';
  if (!to) return '請輸入新的序號';
  if (isSameSn(from, to)) return '新序號與原本相同';
  if (/[,\s]/.test(to)) return '序號不可包含空白或逗號';
  return '';
}

/**
 * 組出更正序號要執行的交易步驟。
 *
 * 擋下來的只有兩種情況：新序號已經被別的資產用走，以及這張單據上根本
 * 沒有那個序號。至於資產列表裡有沒有這個序號則不強制 —— 單據上的序號
 * 未必都建成了資產（例如尚未入庫、或當初就建錯成別的字串），
 * 這時候把單據更正過來仍然是對的，改了幾處會回報給使用者。
 *
 * 每一步都給 id，交易執行器才會保留該步的 rowCount 供事後回報。
 *
 * @param {string} oldSn
 * @param {string} newSn
 * @returns {Array} runTransaction 用的步驟
 */
export function buildSnRenameSteps(oldSn, newSn) {
  const from = String(oldSn ?? '').trim();
  const to = String(newSn ?? '').trim();

  return [
    {
      id: 'guard',
      queryName: 'assertAssetSnFree',
      params: [to],
      expectRows: 1,
      errorMessage: `序號 [${to}] 已經被其他資產使用，請改用別的序號；這次未做任何變更。`,
    },
    { id: 'asset', queryName: 'renameAssetSn', params: [to, from] },
    // 這台設備底下掛的硬體，記的是設備序號
    { id: 'mountedHw', queryName: 'updateMountedHardwareServerSn', params: [to, from] },
    // 這顆硬體被哪些設備列在 mounted_hw_sns 裡
    { id: 'devices', queryName: 'renameMountedHwSnOnDevices', params: [to, from] },
    {
      id: 'inbound',
      queryName: 'updateInboundItemsSn',
      params: [to, from],
      expectRows: 1,
      errorMessage: `進貨明細上找不到序號 [${from}]，可能已經被改過；這次未做任何變更。`,
    },
    { id: 'outbound', queryName: 'updateOutboundItemsSn', params: [to, from] },
    { id: 'repair', queryName: 'updateRepairItemsSn', params: [to, from] },
  ];
}

/** 交易結果裡每一步對應的中文說法，順序即回報順序 */
const RESULT_LABELS = [
  ['asset', '資產'],
  ['mountedHw', '底下掛載的硬體'],
  ['devices', '設備的硬體清單'],
  ['inbound', '進貨明細'],
  ['outbound', '出貨明細'],
  ['repair', '維修明細'],
];

/**
 * 把交易結果整理成一句「改了哪些地方」，讓使用者看得到實際異動。
 *
 * 資產那一項是 0 的時候會特別點出來：單據改好了，但資產列表裡沒有這個
 * 序號，多半是當初入庫時建成了別的字串，需要另外處理。
 *
 * @param {object} results runTransaction 回傳的 results
 * @returns {{ text: string, assetChanged: boolean }}
 */
export function summariseSnRename(results) {
  const counts = RESULT_LABELS.map(([key, label]) => [label, results?.[key]?.rowCount || 0]);
  const changed = counts.filter(([, n]) => n > 0);
  const assetChanged = (results?.asset?.rowCount || 0) > 0;

  const text = changed.length
    ? changed.map(([label, n]) => `${label} ${n} 筆`).join('、')
    : '沒有任何資料符合';

  return { text, assetChanged };
}

export default buildSnRenameSteps;
