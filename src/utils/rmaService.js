/**
 * 原廠 RMA 換新序號核心服務 (RMA Serial Replacement Service)
 * 支援雙模式更換：
 * 1. 模式一：直接更換序號 (In-place Replacement / 承接歷程)
 * 2. 模式二：RMA 一換一更換 (1-to-1 Replacement / 舊品報廢換出 + 新品入庫承接)
 */

import { logUpdate, logStatusChange } from './auditLogger';

/**
 * 檢核新序號是否重複且合法
 * @param {string} newSn 新序號
 * @param {number|null} excludeAssetId 排除的自身資產 ID（模式一就地換號時傳入）
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
export async function validateNewSn(newSn, excludeAssetId = null) {
  const cleanSn = (newSn || '').trim();
  if (!cleanSn) {
    return { valid: false, error: '請輸入原廠新品序號！' };
  }

  try {
    let checkRes;
    if (excludeAssetId) {
      checkRes = await window.electronAPI.namedQuery('checkAssetSnExistsExcludeSelf', [cleanSn, excludeAssetId]);
    } else {
      checkRes = await window.electronAPI.namedQuery('checkAssetSnExists', [cleanSn]);
    }

    if (checkRes.success && checkRes.rows && checkRes.rows.length > 0) {
      return { valid: false, error: `序號「${cleanSn}」已存在於系統中，請勿重複使用！` };
    }

    return { valid: true };
  } catch (err) {
    console.error('Validate SN error:', err);
    return { valid: false, error: '序號檢查異常：' + err.message };
  }
}

/**
 * 模式一：直接更換序號（就地換號 / 承接歷史歷程）
 * 原資產序號直接更新為原廠新序號，自動繼承掛載硬體零組件，並記錄換號日誌
 */
export async function performInPlaceReplacement(asset, newSn, rmaDetails = {}) {
  const cleanNewSn = (newSn || '').trim();
  const oldSn = (asset.sn || '').trim();
  const replaceDate = rmaDetails.date || new Date().toISOString().split('T')[0];
  const rmaNo = (rmaDetails.rmaNo || '').trim();
  const remarks = (rmaDetails.remarks || '').trim();
  const isHardware = asset.category_name === '硬體' || asset.type === '網卡' || asset.type === 'CPU' || asset.type === 'RAM' || asset.type === '硬碟';
  const moduleName = isHardware ? 'HARDWARE' : 'DEVICE';

  // 1. 序號驗證
  const validation = await validateNewSn(cleanNewSn, asset.id);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 2. 準備客製屬性中的 RMA 歷程紀錄
  const prevCustomAttrs = asset.custom_attributes || {};
  const prevRmaHistory = Array.isArray(prevCustomAttrs.rma_history) ? prevCustomAttrs.rma_history : [];

  const rmaRecord = {
    type: 'IN_PLACE',
    date: replaceDate,
    old_sn: oldSn || '無序號',
    new_sn: cleanNewSn,
    rma_no: rmaNo,
    remarks: remarks || '原廠更換良品/新品寄回 (就地更換序號)',
    timestamp: new Date().toISOString()
  };

  const updatedCustomAttrs = {
    ...prevCustomAttrs,
    last_rma_date: replaceDate,
    last_rma_no: rmaNo,
    last_rma_type: 'IN_PLACE',
    rma_history: [...prevRmaHistory, rmaRecord]
  };

  // 3. 更新目標資產資料庫欄位 (包含設定為在庫 ACTIVE)
  const updateRes = await window.electronAPI.namedQuery('updateAssetDetails', [
    cleanNewSn,
    asset.client || null,
    asset.hostname || null,
    asset.location || null,
    asset.installed_date || null,
    asset.customer_warranty_expire || null,
    asset.system_date || null,
    asset.warranty_expire || null,
    asset.os || null,
    asset.nic || null,
    updatedCustomAttrs,
    asset.ownership || 'FOR_SALE',
    asset.id
  ]);

  if (!updateRes.success) {
    throw new Error(updateRes.error || '更新資產序號失敗');
  }

  // 將狀態設為在庫 (ACTIVE)
  await window.electronAPI.namedQuery('updateAssetStatus', ['ACTIVE', asset.id]);

  // 4. 連動更新掛載零組件、維修明細與出庫明細
  if (oldSn) {
    try {
      await window.electronAPI.namedQuery('updateMountedHardwareServerSn', [cleanNewSn, oldSn]);
      await window.electronAPI.namedQuery('updateRepairItemsSn', [cleanNewSn, oldSn]);
      await window.electronAPI.namedQuery('updateOutboundItemsSn', [cleanNewSn, oldSn]);
    } catch (syncErr) {
      console.warn('Mounted hardware sync note:', syncErr);
    }
  }

  // 5. 寫入稽核日誌
  await logUpdate(
    moduleName,
    cleanNewSn,
    `${asset.brand || ''} ${asset.model || ''}`,
    `原廠 RMA 換新序號：[${oldSn || '無序號'}] → [${cleanNewSn}]（直接換號，承接歷史），RMA單號: ${rmaNo || '無'}`,
    { oldSn, newSn: cleanNewSn, rmaNo, replaceDate, remarks, mode: 'IN_PLACE' }
  );

  window.dispatchEvent(new CustomEvent('db-update'));

  return {
    success: true,
    mode: 'IN_PLACE',
    oldSn,
    newSn: cleanNewSn
  };
}

/**
 * 模式二：RMA 一換一更換（舊品報廢換出 + 新品入庫承接）
 * 舊資產狀態轉為 SCRAPPED 並留存對照關聯；
 * 建立新資產入庫，承接舊品之客戶、規格、End-user，並將原設備掛載之硬體轉移至新資產！
 */
export async function performOneToOneReplacement(asset, newSn, rmaDetails = {}) {
  const cleanNewSn = (newSn || '').trim();
  const oldSn = (asset.sn || '').trim();
  const replaceDate = rmaDetails.date || new Date().toISOString().split('T')[0];
  const rmaNo = (rmaDetails.rmaNo || '').trim();
  const remarks = (rmaDetails.remarks || '').trim();
  const isHardware = asset.category_name === '硬體' || asset.type === '網卡' || asset.type === 'CPU' || asset.type === 'RAM' || asset.type === '硬碟';
  const moduleName = isHardware ? 'HARDWARE' : 'DEVICE';

  // 1. 序號驗證 (檢查新序號全域是否已存在)
  const validation = await validateNewSn(cleanNewSn);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 2. 處置舊資產 (Old Asset) -> 標記為 SCRAPPED 報廢換出
  const prevCustomAttrs = asset.custom_attributes || {};
  const prevRmaHistory = Array.isArray(prevCustomAttrs.rma_history) ? prevCustomAttrs.rma_history : [];

  const oldRmaRecord = {
    type: 'ONE_TO_ONE',
    action: 'SCRAPPED_REPLACED',
    date: replaceDate,
    old_sn: oldSn || '無序號',
    new_sn: cleanNewSn,
    rma_no: rmaNo,
    remarks: remarks || '原廠 RMA 一換一換出結案',
    timestamp: new Date().toISOString()
  };

  const oldAssetUpdatedAttrs = {
    ...prevCustomAttrs,
    rma_status: 'REPLACED_BY_RMA',
    replaced_by_sn: cleanNewSn,
    rma_history: [...prevRmaHistory, oldRmaRecord]
  };

  const updateOldRes = await window.electronAPI.namedQuery('updateAssetStatusAndAttributes', [
    'SCRAPPED',
    oldAssetUpdatedAttrs,
    asset.id
  ]);

  if (!updateOldRes.success) {
    throw new Error(updateOldRes.error || '更新舊資產報廢狀態失敗');
  }

  // 3. 建立新資產 (New Asset) -> 承接規格屬性、客戶、End-user，設為 ACTIVE
  const newRmaRecord = {
    type: 'ONE_TO_ONE',
    action: 'NEW_REPLACEMENT_INBOUND',
    date: replaceDate,
    old_sn: oldSn || '無序號',
    new_sn: cleanNewSn,
    rma_no: rmaNo,
    remarks: remarks || '原廠 RMA 換回新品入庫',
    timestamp: new Date().toISOString()
  };

  const newAssetAttrs = {
    ...prevCustomAttrs,
    replaced_from_sn: oldSn || '無序號',
    rma_status: 'NEW_FROM_RMA',
    rma_history: [newRmaRecord]
  };

  const insertRes = await window.electronAPI.namedQuery('insertRmaAssetRecord', [
    asset.item_master_id,
    cleanNewSn,
    asset.client || null,
    asset.end_user || prevCustomAttrs.end_user || null,
    asset.hostname || null,
    asset.location || null,
    replaceDate, // 新安裝/入庫日期
    asset.customer_warranty_expire || null,
    asset.system_date || null,
    asset.warranty_expire || null,
    asset.os || null,
    asset.nic || null,
    newAssetAttrs,
    asset.ownership || 'FOR_SALE',
    'ACTIVE'
  ]);

  if (!insertRes.success) {
    throw new Error(insertRes.error || '建立原廠新品資產失敗');
  }

  const newAssetId = insertRes.rows?.[0]?.id;

  // 4. 掛載硬體自動轉移：若舊機有掛載硬體零組件，將其 server_sn 移轉綁定至新機！
  if (oldSn) {
    try {
      await window.electronAPI.namedQuery('updateMountedHardwareServerSn', [cleanNewSn, oldSn]);
      await window.electronAPI.namedQuery('updateRepairItemsSn', [cleanNewSn, oldSn]);
    } catch (syncErr) {
      console.warn('Mounted hardware transfer note:', syncErr);
    }
  }

  // 5. 寫入稽核日誌
  await logStatusChange(
    moduleName,
    oldSn || asset.id,
    `${asset.brand || ''} ${asset.model || ''}`,
    asset.status,
    'SCRAPPED',
    `原廠 RMA 一換一：舊品 [${oldSn || '無序號'}] 換出結案報廢，由原廠新品 [${cleanNewSn}] 承接。RMA單號: ${rmaNo || '無'}`
  );

  await logUpdate(
    moduleName,
    cleanNewSn,
    `${asset.brand || ''} ${asset.model || ''}`,
    `原廠 RMA 一換一：新品 [${cleanNewSn}] 入庫建立，成功承接舊品 [${oldSn || '無序號'}] 之客戶、規格與掛載硬體零組件`,
    { oldSn, newSn: cleanNewSn, newAssetId, rmaNo, replaceDate, remarks, mode: 'ONE_TO_ONE' }
  );

  window.dispatchEvent(new CustomEvent('db-update'));

  return {
    success: true,
    mode: 'ONE_TO_ONE',
    oldSn,
    newSn: cleanNewSn,
    newAssetId
  };
}

export default {
  validateNewSn,
  performInPlaceReplacement,
  performOneToOneReplacement
};
