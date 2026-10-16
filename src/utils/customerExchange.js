/**
 * 客戶換貨單
 *
 * 客戶拿東西來換別的，例如 10G-LR 換成 10G-SR。不指定原出貨單，直接挑客戶。
 * 確認後在同一個交易裡完成（任一步失敗全部退回）：
 *   - 換出的：產生一張已出貨的出貨單（可列印交貨簽收單）；耗材扣在庫，
 *     有序號的改成已出貨、帶入客戶與地點，掛在上面的硬體一起出貨（也列在出貨單上）
 *   - 換回的：一律是良品，直接回在庫。耗材加回在庫；有序號的回到在庫，
 *     客戶、地點與專案清空，掛在上面的硬體跟著回來
 *   - 寫一張換貨單，記下換回、換出的品項與產生的出貨單
 *
 * 換回的不開進貨單：進貨單是向廠商採購用的，客戶退回混進去會讓進貨統計與成本失真。
 *
 * 履歷：換出的靠出貨單那一段（出貨發貨），換回的靠事件紀錄（details.exchange = 'IN'
 * 分類成「客戶換貨退回」；耗材帶 itemMasterId 接回品項，有序號的以序號接回資產）。
 */

import { logCreate, logUpdate, logStatusChange } from './auditLogger';
import { createHwSyncTracker } from './mountedHwSync';

/** 換貨明細的一行：耗材 { kind: 'CONSUMABLE', itemId, qty, stock? }；有序號的 { kind: 'ASSET', assetId, sn, itemId, categoryName } */
export const lineLabel = (l) => {
  const name = [l.brand, l.model].filter(Boolean).join(' ') || '品項';
  return l.kind === 'ASSET' ? `${name} [${l.sn}]` : `${name} ×${l.qty}`;
};

const listText = (lines) => lines.map(lineLabel).join('、');

/**
 * 伺服器的參數過濾會刪掉半形的 ( ) & + ; % $ @ | 與換行（見 server/queryParams.js）。
 * 換貨原因是給人看的，先換成全形，「LR 換 SR (客戶下錯單)」才不會變成少了括號的一串。
 */
const FULL_WIDTH = { '(': '（', ')': '）', '&': '＆', '+': '＋', ';': '；', '%': '％', $: '＄', '@': '＠', '|': '｜' };
export const toSafeText = (s) => String(s ?? '')
  .replace(/[()&+;%$@|]/g, (c) => FULL_WIDTH[c])
  .replace(/\s*\r?\n\s*/g, '；')
  .trim();

/** @returns {string|null} 錯誤訊息；沒問題回傳 null */
export function validateExchange({ customer, date, reason, inLines = [], outLines = [] }) {
  if (!String(customer ?? '').trim()) return '請選擇客戶。';
  if (!date) return '請填寫換貨日期。';
  if (inLines.length === 0) return '請加入客戶換回的品項。';
  if (outLines.length === 0) return '請加入換給客戶的品項。';
  for (const l of [...inLines, ...outLines]) {
    if (l.kind === 'CONSUMABLE' && !(Number.isInteger(l.qty) && l.qty > 0)) {
      return `[${lineLabel(l)}] 數量要是正整數。`;
    }
  }
  // 換出的耗材不能超過在庫（資料庫也會擋，這裡先講清楚是哪一項）
  const outQty = new Map();
  for (const l of outLines.filter((x) => x.kind === 'CONSUMABLE')) {
    outQty.set(l.itemId, (outQty.get(l.itemId) || 0) + l.qty);
  }
  for (const l of outLines.filter((x) => x.kind === 'CONSUMABLE')) {
    if (l.stock !== undefined && outQty.get(l.itemId) > Number(l.stock)) {
      return `[${[l.brand, l.model].filter(Boolean).join(' ')}] 在庫只有 ${l.stock}，不夠換出 ${outQty.get(l.itemId)}。`;
    }
  }
  const sns = [...inLines, ...outLines].filter((l) => l.kind === 'ASSET').map((l) => String(l.sn).trim().toUpperCase());
  if (new Set(sns).size !== sns.length) return '同一個序號不能重複加入。';
  if (!String(reason ?? '').trim()) return '請填寫換貨原因。';
  return null;
}

/**
 * 交易步驟。
 * @returns {{ steps: object[], hwIn: object }} hwIn：換回設備上跟著回來的硬體，交易完成後用來記紀錄
 */
export function buildExchangeSteps({ exNo, dnNo, customer, location: rawLocation = '', contact = '', date, reason, remarks, userId, inLines, outLines }) {
  // 地點也是手打的，「台北 (機房)」的括號同樣會被伺服器刪掉
  const location = toSafeText(rawLocation);
  const dnRef = { $ref: 'dn.rows.0.id' };
  const exRef = { $ref: 'ex.rows.0.id' };
  const hwIn = createHwSyncTracker();
  const steps = [
    {
      id: 'dn',
      queryName: 'insertOutboundRequestWithProject',
      params: [dnNo, customer, location, date, userId || null, contact, 'SALE', null, null],
      expectRows: 1,
      errorMessage: '建立換貨出貨單失敗',
    },
    {
      id: 'ex',
      queryName: 'insertExchangeOrder',
      params: [exNo, customer, date, toSafeText(reason), toSafeText(remarks) || null, userId || null, dnRef, dnNo],
      expectRows: 1,
      errorMessage: '建立換貨單失敗',
    },
  ];

  // 換出：出貨單只列這次真的交給客戶的
  for (const l of outLines) {
    if (l.kind === 'CONSUMABLE') {
      steps.push(
        {
          queryName: 'updateStockQtyOnOutbound',
          params: [l.qty, l.itemId],
          expectRows: 1,
          errorMessage: `[${lineLabel(l)}] 在庫不足，無法換出。`,
        },
        { queryName: 'insertOutboundItem', params: [dnRef, l.itemId, null, l.qty, location] },
        { queryName: 'insertExchangeItem', params: [exRef, 'OUT', l.itemId, null, null, l.qty] },
      );
    } else {
      steps.push(
        {
          queryName: 'exchangeShipAsset',
          params: [l.assetId, customer, location, date, exNo],
          expectRows: 1,
          errorMessage: `[${l.sn}] 已經不在庫（可能剛被出貨或借出），請重新選擇。`,
        },
        // 掛在上面的硬體一起出貨：帶入客戶與日期、狀態跟著設備、列在出貨單上
        { queryName: 'exchangeShipMounted', params: [l.sn, customer, location, date] },
        { queryName: 'syncMountedHardwareToDevice', params: [l.sn] },
        { queryName: 'insertOutboundItem', params: [dnRef, l.itemId, l.sn, 1, location] },
        { queryName: 'insertSwapMountedOutboundItems', params: [dnRef, l.sn, location] },
        { queryName: 'insertExchangeItem', params: [exRef, 'OUT', l.itemId, l.assetId, l.sn, 1] },
      );
    }
  }

  // 換回：良品直接回在庫
  inLines.forEach((l, i) => {
    if (l.kind === 'CONSUMABLE') {
      steps.push(
        {
          queryName: 'exchangeReturnConsumable',
          params: [l.qty, l.itemId],
          expectRows: 1,
          errorMessage: `找不到品項 [${lineLabel(l)}]，無法換回。`,
        },
        { queryName: 'insertExchangeItem', params: [exRef, 'IN', l.itemId, null, null, l.qty] },
      );
    } else {
      steps.push(
        {
          id: `in-${i}`,
          queryName: 'exchangeReturnAsset',
          params: [l.assetId, exNo, date],
          expectRows: 1,
          errorMessage: `[${l.sn}] 不是已出貨的狀態，無法換回。`,
        },
        // 掛在上面的硬體跟著回來：清掉客戶與專案、狀態跟著變在庫
        { queryName: 'swapClearMountedOnBroken', params: [l.sn] },
        hwIn.step(l.sn),
        { queryName: 'insertExchangeItem', params: [exRef, 'IN', l.itemId, l.assetId, l.sn, 1] },
      );
    }
  });

  // 出貨單一建立就是已出貨：東西在換貨當下就交給客戶了
  steps.push({
    queryName: 'updateOutboundRequestStatus',
    params: ['SHIPPED', dnRef],
    expectRows: 1,
    errorMessage: '換貨出貨單狀態更新失敗',
  });
  return { steps, hwIn };
}

/**
 * 交易完成後寫事件紀錄。
 *   - 換貨單、出貨單各一筆
 *   - 換回的每一項各一筆（履歷上的「客戶換貨退回」）：耗材帶 itemMasterId 接回品項；
 *     有序號的記在序號底下（不帶 itemMasterId，否則同一筆會在履歷出現兩次）
 *   - 換回設備上跟著回來的硬體各一筆
 *   換出的不另外記：出貨單明細在履歷上就是那一筆「出貨發貨」
 */
export async function logExchange({ exNo, dnNo, customer, date, reason, inLines, outLines, results = {}, hwIn }) {
  const base = { exchangeNo: exNo, dnNumber: dnNo };
  await logCreate('EXCHANGE', exNo, customer,
    `建立換貨單 [${exNo}]，客戶 [${customer}]：換回 ${listText(inLines)}；換出 ${listText(outLines)}（出貨單 ${dnNo}）`,
    {
      ...base, customer, date, reason: toSafeText(reason),
      in: inLines.map((l) => ({ itemId: l.itemId, sn: l.sn || null, qty: l.kind === 'ASSET' ? 1 : l.qty, label: lineLabel(l) })),
      out: outLines.map((l) => ({ itemId: l.itemId, sn: l.sn || null, qty: l.kind === 'ASSET' ? 1 : l.qty, label: lineLabel(l) })),
    });
  await logCreate('OUTBOUND', dnNo, customer,
    `換貨單 [${exNo}] 自動建立出貨單 [${dnNo}]（已出貨）：${listText(outLines)}`,
    { ...base, customer, items: outLines.map((l) => ({ brand: l.brand, model: l.model, sn: l.sn || null, qty: l.kind === 'ASSET' ? 1 : l.qty })) });

  for (const [i, l] of inLines.entries()) {
    if (l.kind === 'CONSUMABLE') {
      await logUpdate('CONSUMABLE', exNo, [l.brand, l.model].filter(Boolean).join(' '),
        `換貨單 [${exNo}] 自客戶 [${customer}] 換回 ${lineLabel(l)}，回到在庫`,
        { ...base, exchange: 'IN', itemMasterId: l.itemId, quantity: l.qty });
    } else {
      const row = results[`in-${i}`]?.rows?.[0];
      await logStatusChange(l.categoryName === '硬體' ? 'HARDWARE' : 'DEVICE', l.sn, l.sn,
        row?.old_status || 'SHIPPED', 'ACTIVE',
        `換貨單 [${exNo}] 自客戶 [${customer}] 換回，回到在庫`,
        { ...base, exchange: 'IN' });
    }
  }
  await hwIn?.log(results, `換貨單 [${exNo}] 跟著設備換回`, base);
}
