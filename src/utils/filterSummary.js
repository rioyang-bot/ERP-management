/**
 * 篩選結果的統計
 *
 * 列表篩選後只看得到「第 X 頁 / 共 Y 頁」，要知道某位客戶到底有幾台，
 * 只能把每頁筆數調到最大再自己數。而且搜客戶名稱時上方的統計卡片會整排消失 ——
 * 卡片比對的是類型／廠牌／型號／規格，不含客戶。
 *
 * 因此在表格上方補一行總數與狀態分佈。拆狀態是因為「這位客戶有幾台」
 * 通常問的是已經出給客戶的，跟還在自家庫房的混在一起意義不同。
 */

/** 狀態的顯示順序與樣式。與列表內既有的狀態標籤一致。 */
export const STATUS_SUMMARY_GROUPS = [
  { key: 'ACTIVE', label: '在庫', color: '#047857' },
  { key: 'SHIPPED', label: '已出貨', color: '#1d4ed8' },
  { key: 'LENT', label: '借出', color: '#b45309' },
  // 硬體那邊的舊資料有用 REPAIR 的，兩種都算同一組
  { key: 'REPAIRING', label: '維修中', color: '#d97706', aliases: ['REPAIR'] },
  { key: 'PENDING_SCRAP', label: '待報廢', color: '#595959' },
  { key: 'SCRAPPED', label: '報廢', color: '#6b7280' },
];

const OTHER = { key: 'OTHER', label: '其他', color: '#6b7280' };

/**
 * 依狀態統計篩選結果。
 *
 * 認不得的狀態一律歸到「其他」而不是默默丟掉 ——
 * 各組加起來一定等於總數，不然這行字反而會讓人算不清楚。
 *
 * @returns {{ total: number, groups: Array<{key, label, color, count}> }}
 *          groups 只含有數量的組，並依 STATUS_SUMMARY_GROUPS 的順序排列
 */
export function summariseByStatus(items) {
  const list = Array.isArray(items) ? items : [];
  const counts = new Map();

  for (const item of list) {
    const status = String(item?.status ?? '').trim().toUpperCase();
    const group = STATUS_SUMMARY_GROUPS.find(
      (g) => g.key === status || (g.aliases || []).includes(status)
    );
    const key = group ? group.key : OTHER.key;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const groups = [...STATUS_SUMMARY_GROUPS, OTHER]
    .filter((g) => counts.get(g.key))
    .map(({ key, label, color }) => ({ key, label, color, count: counts.get(key) }));

  return { total: list.length, groups };
}

/**
 * 這次篩選的條件敘述，用在「以 ___ 篩選」。
 * 沒有任何條件時回空字串，呼叫端就只顯示總數。
 */
export function describeFilters({ searchTerm, brandFilter, cardLabel } = {}) {
  return [
    (searchTerm || '').trim(),
    (brandFilter || '').trim(),
    (cardLabel || '').trim(),
  ].filter(Boolean).join('、');
}
