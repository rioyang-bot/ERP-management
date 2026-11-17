/**
 * 單據作業順帶改寫的資產欄位：每一台記「變更前 → 變更後」
 *
 * 確認出貨、確認借出、撤銷出貨／借出、登記歸還、客戶換貨、修改 End-user，
 * 都會在交易裡順帶改寫資產（與搭載在上面的硬體）的客戶、放置位置、End-user、
 * 專案、安裝／出貨日期。先前只記了狀態，設備履歷上看不出地點、客戶被改成什麼、
 * 原本又是什麼。
 *
 * 做法：交易前讀一次（含搭載在這些序號上的硬體），交易成功後再讀一次，逐台比對，
 * 有變的欄位每台各記一筆 logFieldChanges（目標為序號；硬體記 HARDWARE，其餘記 DEVICE）。
 * 狀態不在這裡比對：狀態另有 logStatusChange 那一筆。
 * 讀取失敗不擋主要作業，只是少記這一段。
 *
 * 用法：
 *   const before = await snapshotAssets(sns);
 *   const txRes = await runTransaction(steps);
 *   await logAssetFieldChanges(before, `出貨單 [DN-...] 確認出貨`, { dnNumber });
 */
import { diffFields, logFieldChanges } from './auditLogger';
import { toLocalYmd } from './lentReturnDate';

const norm = (s) => String(s ?? '').trim().toUpperCase();
const ymd = (v) => toLocalYmd(v) || '';

/** 會被單據作業順帶改寫的資產欄位 */
export const ASSET_SIDE_EFFECT_FIELDS = [
  { key: 'client', label: '客戶' },
  { key: 'location', label: '放置位置' },
  { key: 'end_user', label: 'End-user' },
  { key: 'project_name', label: '專案名稱' },
  { key: 'installed_date', label: '安裝日期', format: ymd },
  { key: 'shipping_date', label: '出貨日期', format: ymd },
  { key: 'customer_warranty_expire', label: '客戶保固到期', format: ymd },
];

/**
 * 讀這些序號（與搭載在上面的硬體）目前的欄位
 * @returns {Promise<{ sns: string[], rows: Map<string, object> } | null>} 讀不到回傳 null
 */
export async function snapshotAssets(sns = []) {
  const list = [...new Set((sns || []).map((s) => String(s ?? '').trim()).filter(Boolean))];
  if (list.length === 0) return null;
  try {
    const res = await window.electronAPI.namedQuery('fetchAssetFieldSnapshotBySns', [list]);
    if (!res?.success) return null;
    const rows = new Map();
    for (const r of res.rows || []) {
      if (r?.sn) rows.set(norm(r.sn), r);
    }
    return { sns: list, rows };
  } catch (err) {
    console.warn('[assetFieldSnapshot] 讀取變更前的資產欄位失敗:', err);
    return null;
  }
}

/**
 * 交易成功後再讀一次，有變的欄位每台各記一筆
 * @param {object|null} before snapshotAssets 的回傳值
 * @param {string} title 敘述開頭，例如「出貨單 [DN-…] 確認出貨」
 * @returns {Promise<{ sn: string, changes: object[] }[]>} 記了哪些（測試與呼叫端參考用）
 */
export async function logAssetFieldChanges(before, title, details = {}) {
  if (!before || before.rows.size === 0) return [];
  const after = await snapshotAssets(before.sns);
  if (!after) return [];
  const logged = [];
  for (const [key, prev] of before.rows) {
    const next = after.rows.get(key);
    if (!next) continue;
    const changes = diffFields(prev, next, ASSET_SIDE_EFFECT_FIELDS);
    if (changes.length === 0) continue;
    const sn = String(next.sn ?? prev.sn).trim();
    const module = (next.category_name || prev.category_name) === '硬體' ? 'HARDWARE' : 'DEVICE';
    await logFieldChanges(module, sn, sn, title, changes, { ...details, sn, assetSideEffect: true });
    logged.push({ sn, changes });
  }
  return logged;
}
