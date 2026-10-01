/**
 * 掛載在設備上的耗材
 *
 * 掛載＝把耗材從庫存移到 LAB，並記在某一台設備上（item_lab_assignments 流水帳，
 * 某台設備目前掛了多少 = SUM(quantity)）。
 *
 * 出貨單／借用單加入設備時，掛載的耗材跟著帶進明細（outbound_items.lab_asset_id
 * 記著是哪一台設備的），而且「掛多少出多少」：單上不能改、不能拿掉，
 * 要調整只能到設備上卸載。確認出貨／借出時從 LAB 扣，並扣掉那台設備的掛載數量。
 *
 * 這裡集中產生那些資料庫步驟，出貨單與借用單用同一套規則。
 */

const nameOf = (row) => `${row.brand || ''} ${row.model || ''}`.trim();

/** 這一列明細是不是隨設備一起出的掛載耗材 */
export const isMountedRow = (row) => row?.category_name === '耗材' && !!row.lab_asset_id;

/**
 * 確認出貨／借出前核對：單上的數量要與設備上目前掛的一致。
 * 建單之後有人到設備上卸載或加掛，就要先編輯單據同步一次（編輯時會重新抓掛載數量）。
 *
 * @returns {Promise<string[]>} 不一致的說明；空陣列代表都對得上
 */
export async function findMountedMismatches(rows) {
  const byDevice = new Map();
  rows.filter(isMountedRow).forEach((r) => {
    if (!byDevice.has(r.lab_asset_id)) byDevice.set(r.lab_asset_id, { sn: r.lab_device_sn, rows: [] });
    byDevice.get(r.lab_asset_id).rows.push(r);
  });

  const problems = [];
  for (const [assetId, { sn, rows: deviceRows }] of byDevice) {
    const res = await window.electronAPI.namedQuery('fetchMountedConsumables', [assetId]);
    if (!res.success) throw new Error(res.error || '讀取設備掛載的耗材失敗');
    const mountedRows = new Map((res.rows || []).map((m) => [m.item_master_id, m]));
    const mounted = new Map((res.rows || []).map((m) => [m.item_master_id, Number(m.quantity) || 0]));
    const onSheet = new Map();
    deviceRows.forEach((r) => onSheet.set(r.item_id, (onSheet.get(r.item_id) || 0) + (Number(r.quantity) || 0)));

    for (const [itemId, qty] of onSheet) {
      const now = mounted.get(itemId) || 0;
      if (now !== qty) {
        const row = deviceRows.find((r) => r.item_id === itemId);
        problems.push(`設備 [${sn || assetId}] 的 ${nameOf(row)}：單上 ${qty}，設備上目前掛 ${now}`);
      }
    }
    for (const [itemId, now] of mounted) {
      if (!onSheet.has(itemId)) problems.push(`設備 [${sn || assetId}] 另外掛了 ${nameOf(mountedRows.get(itemId))} ${now} 個，不在單上`);
    }
  }
  return problems;
}

/** 隨設備出貨：LAB 扣掉，並從那台設備上扣掉 */
export const shipMountedSteps = (row, requestNo) => [
  {
    queryName: 'updateLabQtyOnOutbound',
    params: [row.quantity, row.item_id],
    expectRows: 1,
    errorMessage: `耗材 [${nameOf(row)}] 的 LAB 數量不足，無法隨設備 [${row.lab_device_sn || ''}] 出貨。`,
  },
  {
    queryName: 'deductLabAssignment',
    params: [row.item_id, row.lab_asset_id, row.quantity, `出貨單 ${requestNo} 隨設備出貨`],
    expectRows: 1,
    errorMessage: `設備 [${row.lab_device_sn || ''}] 上掛載的 ${nameOf(row)} 不足 ${row.quantity}，請先編輯出貨單同步掛載數量。`,
  },
];

/** 隨設備借出：LAB 減、借出中加，並從那台設備上扣掉 */
export const lendOutMountedSteps = (row, requestNo) => [
  {
    queryName: 'updateLabQtyOnLendOut',
    params: [row.quantity, row.item_id],
    expectRows: 1,
    errorMessage: `耗材 [${nameOf(row)}] 的 LAB 數量不足，無法隨設備 [${row.lab_device_sn || ''}] 借出。`,
  },
  {
    queryName: 'deductLabAssignment',
    params: [row.item_id, row.lab_asset_id, row.quantity, `借用單 ${requestNo} 隨設備借出`],
    expectRows: 1,
    errorMessage: `設備 [${row.lab_device_sn || ''}] 上掛載的 ${nameOf(row)} 不足 ${row.quantity}，請先編輯借用單同步掛載數量。`,
  },
];

/** 借用歸還（或退回待借出）：回到 LAB，重新掛回原來那台設備 */
export const lendReturnMountedSteps = (row, requestNo, note = '歸還') => [
  {
    queryName: 'updateLabQtyOnLendReturn',
    params: [row.quantity, row.item_id],
    expectRows: 1,
    errorMessage: `回補耗材 [${nameOf(row)}] 失敗，查無此品項。`,
  },
  {
    queryName: 'insertLabAssignment',
    params: [row.item_id, row.lab_asset_id, row.quantity, `借用單 ${requestNo} ${note}，掛回設備`],
    expectRows: 1,
    errorMessage: `耗材 [${nameOf(row)}] 掛回設備 [${row.lab_device_sn || ''}] 失敗。`,
  },
];

/** 單據上顯示用：「掛載耗材」清單的文字 */
export const mountedLabel = (m) => `${m.type ? `${m.type} - ` : ''}${m.brand || ''} ${m.model || ''}`.trim();
