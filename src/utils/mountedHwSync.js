/**
 * 交易裡「搭載硬體狀態跟著設備」的步驟，以及交易完成後的事件紀錄。
 *
 * 出貨、借出、歸還、撤銷借出都把 syncMountedHardwareToDevice 放進交易，
 * 硬體的狀態跟著改了卻沒有任何紀錄 —— 硬體自己的履歷看不出它出貨、借出過。
 * 交易裡的步驟要具名才拿得到回傳的硬體，這裡負責編號並在完成後逐件記錄。
 *
 * 用法：
 *   const hwSync = createHwSyncTracker();
 *   steps.push(hwSync.step(item.sn));
 *   const txRes = await runTransaction(steps);
 *   await hwSync.log(txRes.results, `出貨單 [DN-...] 確認出貨`, { dnNo }, { skipSns });
 */

import { logMountedHwStatusSync, logStatusChange } from './auditLogger';

const norm = (s) => String(s ?? '').trim().toUpperCase();

export function createHwSyncTracker() {
  const devices = [];
  /** 交易完成後，每台設備上狀態有變的硬體 */
  const synced = (results = {}) => devices.map(({ id, deviceSn }) => ({ deviceSn, rows: results?.[id]?.rows || [] }));
  return {
    /** 交易步驟：同步這台設備上的硬體狀態 */
    step(deviceSn) {
      const id = `hwsync-${devices.length}`;
      devices.push({ id, deviceSn: String(deviceSn ?? '').trim() });
      return { id, queryName: 'syncMountedHardwareToDevice', params: [deviceSn] };
    },
    synced,
    /**
     * 交易完成後，狀態有變的硬體各記一筆。
     * @param {object} results runTransaction 回傳的 results
     * @param {string[]} [opts.skipSns] 單據上自己列了的硬體：它在履歷上已經有出貨／借出那一筆，
     *        或另外記了自己的紀錄，不再重複記
     */
    async log(results = {}, note = '', details = {}, { skipSns = [] } = {}) {
      const skip = new Set(skipSns.map(norm).filter(Boolean));
      for (const { deviceSn, rows: all } of synced(results)) {
        const rows = all.filter((h) => !skip.has(norm(h.sn)));
        if (rows.length > 0) await logMountedHwStatusSync(deviceSn, rows, note, details);
      }
    },
  };
}

/**
 * 歸還、撤銷借出、撤銷出貨：單據上列的設備／硬體改回在庫，掛在設備上的硬體跟著。
 * 交易完成後設備與硬體各記一筆 —— 先前只有借用單本身記一筆，
 * 設備歷程上看得到借出，卻看不到它回來了。
 *
 * @param {object} [opts]
 * @param {string|null} [opts.revertShipDate] 撤銷出貨時給這張出貨單的出貨日期：只改「目前還是已出貨」的，
 *        並清掉這次出貨寫入的安裝／出貨日期（設備與它上面的硬體），見 revertShippedAssetBySn。
 *        這時搭載硬體的同步不放在各品項裡，要在所有品項之後呼叫 syncSteps()：
 *        出貨單常把設備和它上面的硬體都列出來，設備先改回在庫、硬體跟著變在庫，
 *        輪到硬體自己那一列時就不是「已出貨」而被擋下
 */
export function createBackToStockTracker({ revertShipDate } = {}) {
  const revertingShipment = revertShipDate !== undefined;
  const pendingSync = [];
  const hwSync = createHwSyncTracker();
  const assets = [];
  return {
    /** 一個品項的交易步驟：改回在庫，再同步它上面的硬體 */
    steps(item) {
      const id = `back-${assets.length}`;
      assets.push({ id, sn: String(item.sn ?? '').trim(), module: item.category_name === '硬體' ? 'HARDWARE' : 'DEVICE' });
      if (revertingShipment) {
        pendingSync.push(item.sn);
        return [
          {
            id,
            queryName: 'revertShippedAssetBySn',
            params: [item.sn, revertShipDate],
            expectRows: 1,
            errorMessage: `序號 [${item.sn}] 目前不是「已出貨」（可能已經維修、換貨或歸還），無法撤銷出貨。`,
          },
          { queryName: 'revertMountedHardwareShipDates', params: [revertShipDate, item.sn] },
        ];
      }
      return [
        {
          id,
          queryName: 'updateAssetStatusAndLocationBySn',
          params: ['ACTIVE', '', item.sn],
          expectRows: 1,
          errorMessage: `序號 [${item.sn}] 找不到對應資產，無法恢復為在庫。`,
        },
        hwSync.step(item.sn),
      ];
    },
    /** 撤銷出貨：所有品項都改回在庫之後，搭載硬體再跟著各自的設備 */
    syncSteps() {
      return pendingSync.splice(0).map((sn) => hwSync.step(sn));
    },
    async log(results = {}, note = '', details = {}) {
      // 單據上也列了的硬體，可能已經先跟著它的設備改回在庫，
      // 輪到它自己那一步時讀到的「改之前」已經是在庫 —— 以跟著設備改的那一次為準
      const syncedOld = new Map();
      for (const { rows } of hwSync.synced(results)) {
        for (const h of rows) if (!syncedOld.has(norm(h.sn))) syncedOld.set(norm(h.sn), h.old_status);
      }
      for (const a of assets) {
        const row = results?.[a.id]?.rows?.[0];
        if (!row) continue;
        const oldStatus = syncedOld.get(norm(a.sn)) || row.old_status || 'UNKNOWN';
        await logStatusChange(a.module, a.sn, a.sn, oldStatus, 'ACTIVE', note, details);
      }
      await hwSync.log(results, note, details, { skipSns: assets.map((a) => a.sn) });
    },
  };
}
