/**
 * 維修單：以庫存設備換貨
 *
 * 客戶的設備故障，直接從公司庫存拿一台換給客戶，故障的那台取回。
 * 在維修單上一次完成（同一個交易）：
 *   - 維修單結案，維修結果記下「哪一台換成哪一台」與出貨單號
 *   - 新設備出貨：客戶、End-user、地點、專案、客戶保固沿用故障的那一台；
 *     它身上的搭載硬體一起出貨
 *   - 換回來的設備：先回到在庫（不標維修中；確定要送修再另開內部維修單），
 *     客戶、地點、出貨日期清空；搭載硬體跟著取回
 *   - 自動產生一張已出貨的出貨單，可列印交貨簽收單、上傳客戶簽收
 *
 * 搭載硬體可以逐件選擇（例如 NIC 不帶回，其餘帶回）：
 *   - 舊機的硬體：跟舊機取回（預設），或留在客戶端、移到新設備（不列出貨單 —— 本來就在客戶端）
 *   - 新設備的硬體：一起出貨（預設），或拆下留在公司（解除掛載、回到在庫）
 *
 * 取回之後要送原廠修，另開一張「內部維修」單即可。
 */

const norm = (s) => String(s ?? '').trim().toUpperCase();

/**
 * 候選設備排序：同一個品項（同廠牌型號規格）最前面，其次同廠牌型號、同類型、同類別。
 * @returns {object[]} 每筆多一個 match：'item' | 'model' | 'type' | 'category' | null
 */
export function rankSwapCandidates(candidates = [], broken = {}) {
  const matchOf = (c) => {
    if (broken.item_master_id && c.item_master_id === broken.item_master_id) return 'item';
    if (norm(c.brand) === norm(broken.brand) && norm(c.model) === norm(broken.model) && norm(broken.model)) return 'model';
    if (norm(c.type) && norm(c.type) === norm(broken.type)) return 'type';
    if (broken.category_name && c.category_name === broken.category_name) return 'category';
    return null;
  };
  const order = { item: 0, model: 1, type: 2, category: 3 };
  return candidates
    .map((c) => ({ ...c, match: matchOf(c) }))
    .sort((a, b) => (order[a.match] ?? 9) - (order[b.match] ?? 9));
}

export const MATCH_LABEL = { item: '同品項', model: '同型號', type: '同類型', category: '同類別' };

/**
 * @param {object} p
 * @param {{ id: number, sn: string }[]} p.items 維修單上的設備（有序號的）
 * @param {Record<number, object>} p.picks 每一台選了哪一台新設備（key 是維修單明細 id）
 * @returns {string|null} 錯誤訊息；沒問題回傳 null
 */
export function validateSwap({ items = [], picks = {}, date, reason }) {
  if (items.length === 0) return '這張維修單沒有可換貨的設備（明細沒有序號）。';
  const missing = items.filter((it) => !picks[it.id]);
  if (missing.length > 0) return `請為每一台故障設備選擇要換給客戶的設備：${missing.map((it) => it.sn).join('、')}`;
  const chosen = items.map((it) => norm(picks[it.id].sn));
  if (new Set(chosen).size !== chosen.length) return '同一台庫存設備不能同時換給兩台故障設備。';
  const same = items.find((it) => norm(picks[it.id].sn) === norm(it.sn));
  if (same) return `[${same.sn}] 不能換成它自己。`;
  if (!date) return '請填寫換貨日期。';
  if (!String(reason ?? '').trim()) return '請填寫換貨原因 / 故障說明。';
  return null;
}

/** 搭載硬體清單的摘要，例如「NIC ×2（A、B）」 */
const hwSummary = (list) => {
  const byType = new Map();
  for (const h of list) {
    const t = String(h.type || '').trim() || '硬體';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(h.sn);
  }
  return [...byType.entries()].map(([t, sns]) => `${t} ×${sns.length}（${sns.join('、')}）`).join('、');
};

/**
 * 維修結果的文字：原因加上換貨對照與出貨單號；有搭載硬體留在客戶端或拆下的一併寫上。
 * 用全形分號分隔而不是換行：伺服器的參數過濾會刪掉換行，幾段會黏在一起。
 */
export function swapResultsText(reason, pairs, dnNo) {
  const map = pairs.map((p) => `${p.oldSn} → ${p.newSn}`).join('、');
  const parts = [`${String(reason).trim()}；【以庫存設備換貨】${map}（出貨單 ${dnNo}）`];
  for (const p of pairs) {
    if (p.moveHw?.length) parts.push(`${p.oldSn} 的搭載硬體留在客戶端、移到 ${p.newSn}：${hwSummary(p.moveHw)}`);
    if (p.detachHw?.length) parts.push(`${p.newSn} 原本的搭載硬體拆下留在公司：${hwSummary(p.detachHw)}`);
  }
  return parts.join('；');
}

/**
 * 交易步驟。順序有講究：
 *   - 新設備要先出貨、再處理換回來的那台 —— 新設備的客戶、地點是從舊機讀的，先清掉就讀不到
 *   - 新設備「拆下留在公司」的硬體先拆，出貨單才不會列到它
 *   - 出貨單明細在「舊機硬體移過來」之前寫入：那些硬體本來就在客戶端，這次沒有出貨，不列在出貨單上
 *   - 舊機硬體移過來之後，再取回舊機（剩下的硬體才跟著舊機回到在庫）
 *
 * @param {object} p
 * @param {object} p.order 維修單（id, repair_no）
 * @param {{ repairItemId, oldAssetId, oldSn, newAssetId, newSn, newItemMasterId,
 *           moveHw?: {id, sn}[], detachHw?: {id, sn}[] }[]} p.pairs
 *        moveHw：舊機上留在客戶端、移到新設備的硬體；detachHw：新設備上拆下留在公司的硬體
 * @param {{ customer, location, contact, project }} p.dn 出貨單單頭
 */
export function buildSwapSteps({ order, pairs, date, results, remarks, dnNo, userId, dn }) {
  const dnRef = { $ref: 'dn.rows.0.id' };
  const steps = [
    {
      id: 'repair',
      queryName: 'updateRepairSwapCompleted',
      params: [date, results, remarks || null, order.id, dnNo],
      expectRows: 1,
      errorMessage: '這張維修單已經不在「現場處理」階段，或不是客戶送修，無法換貨。請重新整理後再試。',
    },
    {
      id: 'dn',
      queryName: 'insertOutboundRequestWithProject',
      params: [dnNo, dn.customer, dn.location || '', date, userId || null, dn.contact || '', 'SALE', null, dn.project || null],
      expectRows: 1,
      errorMessage: '建立換貨出貨單失敗',
    },
  ];
  for (const p of pairs) {
    steps.push({
      queryName: 'swapShipReplacementAsset',
      params: [p.newAssetId, p.oldAssetId, date, order.repair_no],
      expectRows: 1,
      errorMessage: `[${p.newSn}] 已經不在庫（可能剛被別人出貨或借出），請重新選擇。`,
    });
    // 新設備上拆下留在公司的硬體
    for (const h of p.detachHw || []) {
      steps.push(
        {
          queryName: 'swapDetachHardwareFromDevice',
          params: [h.id, p.newSn],
          expectRows: 1,
          errorMessage: `硬體 [${h.sn}] 已經不在 [${p.newSn}] 上，請重新開啟換貨視窗。`,
        },
        { queryName: 'removeSnFromMountedHwList', params: [p.newSn, h.sn] },
      );
    }
    steps.push(
      { queryName: 'swapShipMountedOnReplacement', params: [p.newSn, p.oldAssetId, date] },
      // 搭載硬體的狀態跟著設備：新設備上的變已出貨
      { queryName: 'syncMountedHardwareToDevice', params: [p.newSn] },
      // 出貨單只列這次真的出貨的：新設備與它身上留著的硬體
      { queryName: 'insertOutboundItem', params: [dnRef, p.newItemMasterId, p.newSn, 1, dn.location || ''] },
      { queryName: 'insertSwapMountedOutboundItems', params: [dnRef, p.newSn, dn.location || ''] },
    );
    // 舊機上留在客戶端的硬體移到新設備（不列出貨單）
    for (const h of p.moveHw || []) {
      steps.push(
        {
          queryName: 'swapMoveHardwareToDevice',
          params: [h.id, p.oldSn, p.newSn],
          expectRows: 1,
          errorMessage: `硬體 [${h.sn}] 已經不在 [${p.oldSn}] 上，請重新開啟換貨視窗。`,
        },
        { queryName: 'removeSnFromMountedHwList', params: [p.oldSn, h.sn] },
        { queryName: 'addSnToMountedHwList', params: [p.newSn, h.sn] },
      );
    }
    if ((p.moveHw || []).length > 0) {
      steps.push({ queryName: 'syncMountedHardwareToDevice', params: [p.newSn] });
    }
    steps.push(
      {
        queryName: 'swapReturnBrokenAsset',
        params: [p.oldAssetId, p.newSn, date, order.repair_no],
        expectRows: 1,
        errorMessage: `換回來的設備 [${p.oldSn}] 不是維修中或已出貨的狀態，無法取回。`,
      },
      { queryName: 'swapClearMountedOnBroken', params: [p.oldSn] },
      // 換回來的設備上剩下的硬體跟著取回，變在庫
      { queryName: 'syncMountedHardwareToDevice', params: [p.oldSn] },
      {
        queryName: 'updateRepairItemReplacement',
        params: [p.repairItemId, p.newSn, p.newAssetId],
        expectRows: 1,
        errorMessage: `維修單上找不到 [${p.oldSn}] 這一筆`,
      },
    );
  }
  // 出貨單一建立就是已出貨：東西在換貨當下就交給客戶了
  steps.push({
    queryName: 'updateOutboundRequestStatus',
    params: ['SHIPPED', dnRef],
    expectRows: 1,
    errorMessage: '換貨出貨單狀態更新失敗',
  });
  return steps;
}
