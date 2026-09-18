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
 * 因此一律整組放進同一個交易：資產本身改不到（找不到、或新序號已被占用）
 * 就整批退回，不會留下改到一半的狀態。
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
 * 第一步帶 expectRows：找不到那筆資產時整個交易退回，
 * 不會只改掉單據上的序號、卻留下對不上的資產。
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
      id: 'asset',
      queryName: 'renameAssetSn',
      params: [to, from],
      expectRows: 1,
      errorMessage: `找不到序號 [${from}] 的資產，或新序號 [${to}] 已被其他資產使用；序號未變更。`,
    },
    // 這台設備底下掛的硬體，記的是設備序號
    { queryName: 'updateMountedHardwareServerSn', params: [to, from] },
    // 這顆硬體被哪些設備列在 mounted_hw_sns 裡
    { queryName: 'renameMountedHwSnOnDevices', params: [to, from] },
    { queryName: 'updateInboundItemsSn', params: [to, from] },
    { queryName: 'updateOutboundItemsSn', params: [to, from] },
    { queryName: 'updateRepairItemsSn', params: [to, from] },
  ];
}

export default buildSnRenameSteps;
