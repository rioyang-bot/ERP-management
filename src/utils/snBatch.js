/**
 * 批次序號清單的解析與檢查
 *
 * 進貨入庫單一次要登記多筆同款設備時，逐格貼序號很慢。改為一次貼上整份清單，
 * 但必須確保「行數與數量一致」：少貼會留下空序號，多貼則會有序號被無聲丟棄，
 * 兩種都會讓系統的庫存與實際收到的機器對不起來。
 *
 * 規則放在這裡而不是畫面裡，才能單獨驗證，也方便其他地方沿用。
 */

/** 解析貼上的內容：一行一個序號，空行與前後空白忽略 */
export function parseSnLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * 檢查批次序號是否可以套用。
 *
 * @param {string} text        使用者貼上的內容
 * @param {number} qty         這一列的數量
 * @param {string[]} [usedSns] 本單其他明細已經使用的序號，用來擋重複
 * @returns {{ok: boolean, sns: string[], message: string}}
 */
export function validateSnBatch(text, qty, usedSns = []) {
  const sns = parseSnLines(text);

  if (sns.length === 0) {
    return { ok: false, sns, message: '請貼上序號清單（每行一個）。' };
  }

  if (sns.length !== qty) {
    return {
      ok: false,
      sns,
      message: `序號行數與數量不符：目前 ${sns.length} 行，數量為 ${qty} 筆。請調整後再套用。`,
    };
  }

  // 清單內重複（忽略大小寫，因為序號寫法常常大小寫混用）
  const seen = new Set();
  const dupes = new Set();
  for (const sn of sns) {
    const key = sn.toUpperCase();
    if (seen.has(key)) dupes.add(sn);
    seen.add(key);
  }
  if (dupes.size > 0) {
    return { ok: false, sns, message: `清單中有重複的序號：${[...dupes].join(', ')}` };
  }

  // 與本單其他明細重複
  const used = (usedSns || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  const clash = sns.filter((sn) => used.includes(sn.toUpperCase()));
  if (clash.length > 0) {
    return { ok: false, sns, message: `這些序號在本單其他明細已經出現：${clash.join(', ')}` };
  }

  return { ok: true, sns, message: '' };
}
