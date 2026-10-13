/**
 * 維修流程裡改設備狀態，並寫進事件紀錄（設備歷程讀的就是這些紀錄，以序號接回資產）。
 *
 * 建單、送修原廠、原廠返還、完工出貨、自行維修完工、刪除維修單都走這裡：
 *   - 設備改好之後，掛在上面的硬體跟著（syncMountedHardwareToDevice）
 *   - 設備記一筆，狀態有變的硬體各記一筆
 *
 * 先前各流程自己寫，紀錄裡的「原狀態」一律寫死成在庫 ——
 * 但設備從建單起就是維修中，送修、完工的紀錄都寫成「在庫 ➔ …」；
 * 硬體的狀態跟著改了卻沒有任何紀錄。
 */

import { logStatusChange, logUpdate, logMountedHwStatusSync } from './auditLogger';

/**
 * 狀態已經改好了：搭載硬體跟上，設備與硬體各記一筆。
 * 狀態沒變（例如維修中送出原廠，還是維修中）就記成一般異動，不寫「維修中 ➔ 維修中」。
 */
export async function logRepairAssetStatus(sn, prevStatus, newStatus, note, details = {}) {
  const key = String(sn ?? '').trim();
  if (!key) return;
  const hw = await window.electronAPI.namedQuery('syncMountedHardwareToDevice', [key]);
  if (prevStatus && prevStatus !== newStatus) {
    await logStatusChange('DEVICE', key, key, prevStatus, newStatus, note, details);
  } else {
    await logUpdate('DEVICE', key, key, note, { ...details, status: newStatus });
  }
  await logMountedHwStatusSync(key, hw?.success ? hw.rows : [], note, details);
}

/**
 * 改設備狀態並記錄。
 * @param {object} opts
 * @param {string} [opts.prevStatus] 改之前的狀態；不給就用資料庫裡改之前的值
 *        （原廠就地換號會先把設備改成在庫，那時資料庫裡的已經不是原本的狀態）
 * @returns {Promise<boolean>} 系統裡有沒有這支序號；沒有（建單時手打的）就沒有設備歷程可寫
 */
export async function setRepairAssetStatus(sn, newStatus, { prevStatus, note, details = {} } = {}) {
  const key = String(sn ?? '').trim();
  if (!key) return false;
  const res = await window.electronAPI.namedQuery('updateAssetStatusBySn', [newStatus, key]);
  const row = res?.success ? res.rows?.[0] : null;
  if (!row) return false;
  await logRepairAssetStatus(key, prevStatus || row.old_status, newStatus, note, details);
  return true;
}
