/**
 * 卡片聚合與汰舊規則核心邏輯
 *
 * 聚合模式（由粗到細）：
 *   BRAND 依廠牌：只看廠牌，同一廠牌全部併成一張卡片
 *   TYPE  依類型：只看類型，同一類型全部併成一張卡片（不分廠牌、型號）
 *   MODEL 依型號：廠牌 ＋ 類型 ＋ 型號，同型號合併、不分規格
 *   SPEC  依規格：廠牌 ＋ 類型 ＋ 型號 ＋ 規格，規格不同即獨立卡片（預設）
 *
 * 依類型的卡片鍵值加上 TYPE:: 前綴，避免與「依廠牌」的純字串鍵值互相誤判
 * （例如某個廠牌名稱剛好與某個類型名稱相同時）。
 */

/** 依類型模式的卡片鍵值前綴 */
export const TYPE_KEY_PREFIX = 'TYPE::';

/**
 * 檢查項目是否屬於已汰舊 (Retired)
 * 當項目的 SPEC、MODEL、TYPE 或 BRAND 任一聚合鍵存在於 retiredKeys 中時，視為已汰舊
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

  const typeKey = TYPE_KEY_PREFIX + t;

  return retiredKeys.some(rk => rk === specKey || rk === modelKey || rk === brandKey || rk === typeKey);
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
  if (mode === 'TYPE') return TYPE_KEY_PREFIX + t;
  if (mode === 'MODEL') return `${b} - ${t} - ${m}`;
  return `${b} - ${t} - ${m} - ${s}`;
}

/**
 * 聚合統計卡片，徹底區分「正常使用 (activeStatsMap)」與「汰舊區塊 (retiredStatsMap)」
 * 確保在任一聚合規則（依規格 SPEC、依型號 MODEL、依類型 TYPE、依廠牌 BRAND）下，
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
        isRetired,
        // 這張卡片涵蓋到哪些廠牌／型號／規格。粗粒度的模式（依類型、依廠牌）
        // 一張卡片會蓋到多個廠牌或型號，搜尋時要能一起比對到
        brands: new Set(),
        models: new Set(),
        specs: new Set()
      };
    }

    targetMap[key].brands.add(brandStr);
    targetMap[key].models.add(modelStr);
    if (specStr) targetMap[key].specs.add(specStr);

    targetMap[key].total++;
    const s = curr.status || 'ACTIVE';
    if (s === 'ACTIVE') targetMap[key].active++;
    else if (s === 'SHIPPED') targetMap[key].shipped++;
    else if (s === 'LENT') targetMap[key].lent++;
    else if (s === 'REPAIR' || s === 'REPAIRING') targetMap[key].repair++;
    else if (s === 'SCRAPPED' || s === 'PENDING_SCRAP') targetMap[key].scrapped++;
  });

  // Set 只在統計過程中方便去重，對外一律回傳陣列
  [activeStatsMap, retiredStatsMap].forEach(map => {
    Object.values(map).forEach(st => {
      st.brands = [...st.brands];
      st.models = [...st.models];
      st.specs = [...st.specs];
    });
  });

  return { activeStatsMap, retiredStatsMap };
}

/**
 * 計算汰舊 / 復原卡片後的最新 retiredKeys 清單
 */
export function computeNewRetiredKeys(targetKey, isCurrentlyRetired, currentRetiredKeys = [], mode = 'SPEC') {
  if (isCurrentlyRetired) {
    // 復原「依類型」卡片：階層式鍵值的格式是「廠牌 - 類型 - 型號[ - 規格]」，
    // 類型不在開頭，因此比對第 2 段而不是用前綴判斷
    if (mode === 'TYPE') {
      const typeName = targetKey.startsWith(TYPE_KEY_PREFIX)
        ? targetKey.slice(TYPE_KEY_PREFIX.length)
        : targetKey;
      return currentRetiredKeys.filter(k => {
        if (k === targetKey) return false;
        if (k.startsWith(TYPE_KEY_PREFIX)) return true;
        return k.split(' - ')[1] !== typeName;
      });
    }
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

/**
 * 卡片標題要顯示什麼：「依類型」看的是類型，其餘模式看的是廠牌
 */
export function getCardTitle(stat, mode = 'SPEC') {
  if (!stat) return '';
  return mode === 'TYPE' ? (stat.type || '未分類') : (stat.brand || '未知');
}

/**
 * 卡片是否要顯示「類型 - 型號」副標題
 * 依廠牌、依類型這兩種模式本來就不分型號，顯示出來反而誤導
 */
export function showsModelSubtitle(mode = 'SPEC') {
  return mode === 'SPEC' || mode === 'MODEL';
}

/**
 * 卡片的搜尋比對字串
 *
 * 依類型或依廠牌時一張卡片會蓋到多個廠牌與型號，只比對卡片標題會讓使用者
 * 搜尋某個廠牌時找不到明明含有該廠牌的卡片，因此把涵蓋範圍一起納入比對。
 */
export function getCardSearchText(stat) {
  if (!stat) return '';
  return [
    stat.brand, stat.type, stat.model, stat.specification,
    ...(stat.brands || []), ...(stat.models || []), ...(stat.specs || []),
  ].filter(Boolean).join(' ').toLowerCase();
}
