/**
 * 單據列表用品項搜尋：打類型／廠牌／型號（或規格、序號），找出含有這個品項的單據
 *
 * 列表查詢會帶出每張單的明細（item_lines：type / brand / model / spec / sn / qty）。
 * 關鍵字以空白分開，同一列明細要每個字都對得上才算，
 * 例如「DELL R750」不會因為單上分別有 DELL 的別款與別家的 R750 而誤中。
 */
const lower = (s) => String(s ?? '').toLowerCase();

const lineText = (l) => lower([l.type, l.brand, l.model, l.spec, l.sn].filter(Boolean).join(' '));

/** 這張單裡符合關鍵字的明細；沒打關鍵字回傳空陣列 */
export function matchingItems(lines, term) {
  const tokens = lower(term).split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || !Array.isArray(lines)) return [];
  return lines.filter((l) => {
    const text = lineText(l);
    return tokens.every((t) => text.includes(t));
  });
}

/**
 * 符合的明細依「類型 廠牌 型號」合併、數量加總，列表上顯示用
 * @returns {{ label: string, qty: number }[]}
 */
export function summarizeItems(lines) {
  const map = new Map();
  lines.forEach((l) => {
    const label = [l.type, l.brand, l.model].filter(Boolean).join(' ') || '（未命名品項）';
    map.set(label, (map.get(label) || 0) + (Number(l.qty) || 0));
  });
  return [...map].map(([label, qty]) => ({ label, qty }));
}
