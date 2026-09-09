/**
 * 卡片聚合與汰舊規則核心邏輯
 */

/**
 * 檢查項目是否屬於已汰舊 (Retired)
 * 當項目的 SPEC、MODEL 或 BRAND 任一聚合鍵存在於 retiredKeys 中時，視為已汰舊
 */
export function isItemRetired(item, retiredKeys = []) {
  if (!retiredKeys || retiredKeys.length === 0 || !item) return false;
  const b = item.brand || '未知';
  const t = item.type || '未分類';
  const m = item.model || '未設定型號';
  const s = (item.specification || '').trim();

  const specKey = `${b} - ${t} - ${m} - ${s}`;
  const modelKey = `${b} - ${t} - ${m}`;
  const brandKey = `${b}`;

  return retiredKeys.some(rk => rk === specKey || rk === modelKey || rk === brandKey);
}

/**
 * 依據聚合模式取得項目的卡片 Key
 */
export function getItemAggregationKey(item, mode = 'SPEC') {
  const b = item.brand || '未知';
  const t = item.type || '未分類';
  const m = item.model || '未設定型號';
  const s = (item.specification || '').trim();

  if (mode === 'BRAND') return `${b}`;
  if (mode === 'MODEL') return `${b} - ${t} - ${m}`;
  return `${b} - ${t} - ${m} - ${s}`;
}

/**
 * 聚合統計卡片，徹底區分「正常使用 (activeStatsMap)」與「汰舊區塊 (retiredStatsMap)」
 * 確保在任一聚合規則（依規格 SPEC、依型號 MODEL、依廠牌 BRAND）下，
 * 移至汰舊區的項目不會被加入使用中卡片的計算
 */
export function aggregateCards(items = [], mode = 'SPEC', retiredKeys = []) {
  const activeStatsMap = {};
  const retiredStatsMap = {};

  items.forEach(curr => {
    const key = getItemAggregationKey(curr, mode);
    const brandStr = curr.brand || '未知';
    const typeStr = curr.type || '未分類';
    const modelStr = curr.model || '未設定型號';
    const specStr = (curr.specification || '').trim();

    const isRetired = isItemRetired(curr, retiredKeys);
    const targetMap = isRetired ? retiredStatsMap : activeStatsMap;

    if (!targetMap[key]) {
      targetMap[key] = {
        key,
        brand: brandStr,
        type: typeStr,
        model: modelStr,
        specification: specStr,
        total: 0,
        active: 0,
        shipped: 0,
        lent: 0,
        repair: 0,
        scrapped: 0,
        isRetired
      };
    }

    targetMap[key].total++;
    const s = curr.status || 'ACTIVE';
    if (s === 'ACTIVE') targetMap[key].active++;
    else if (s === 'SHIPPED') targetMap[key].shipped++;
    else if (s === 'LENT') targetMap[key].lent++;
    else if (s === 'REPAIR' || s === 'REPAIRING') targetMap[key].repair++;
    else if (s === 'SCRAPPED' || s === 'PENDING_SCRAP') targetMap[key].scrapped++;
  });

  return { activeStatsMap, retiredStatsMap };
}

/**
 * 計算汰舊 / 復原卡片後的最新 retiredKeys 清單
 */
export function computeNewRetiredKeys(targetKey, isCurrentlyRetired, currentRetiredKeys = [], mode = 'SPEC') {
  if (isCurrentlyRetired) {
    // 復原此卡片：若在 BRAND 或 MODEL 模式下，一併解除其底下的階層式鍵值
    if (mode === 'BRAND' || mode === 'MODEL') {
      return currentRetiredKeys.filter(k => k !== targetKey && !k.startsWith(`${targetKey} - `));
    }
    return currentRetiredKeys.filter(k => k !== targetKey);
  } else {
    // 移至汰舊區
    return currentRetiredKeys.includes(targetKey) ? currentRetiredKeys : [...currentRetiredKeys, targetKey];
  }
}
