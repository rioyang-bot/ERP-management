/**
 * 出機檢查表主項目的適用範圍
 *
 * 主項目可以綁廠牌，也可以再綁該廠牌底下的某個型號：
 *   廠牌 + 型號   只套用到該型號的設備（例如 LDA · NEOTAP）
 *   只有廠牌      整個廠牌的設備都套用
 *   都沒有        通用，所有設備都套用
 *
 * 實際套用由資料庫的 syncBrandChecklistToAssets 決定，這裡只負責畫面上的
 * 顯示與「預設先看哪一組」，比對規則必須與那支查詢一致。
 */

const norm = (v) => (v || '').trim().toUpperCase();

/** 主項目的範圍標籤，例如「LDA · NEOTAP」「LDA」「通用」 */
export function groupScopeLabel(group) {
  const brand = (group?.brand || '').trim();
  const model = (group?.model || '').trim();
  if (!brand) return '通用';
  return model ? `${brand} · ${model}` : brand;
}

/**
 * 這個主項目是否套用到這台設備。
 * @returns {'model'|'brand'|'generic'|null} 符合的層級；不符合回傳 null
 */
export function groupMatchLevel(group, device) {
  const gBrand = norm(group?.brand);
  if (!gBrand) return 'generic';
  if (gBrand !== norm(device?.brand)) return null;
  const gModel = norm(group?.model);
  if (!gModel) return 'brand';
  return gModel === norm(device?.model) ? 'model' : null;
}

/**
 * 挑細項時預設先看哪一組：這台設備的型號 > 廠牌 > 通用 > 第一組。
 */
export function pickDefaultGroup(groups, device) {
  const list = groups || [];
  return list.find((g) => groupMatchLevel(g, device) === 'model')
    || list.find((g) => groupMatchLevel(g, device) === 'brand')
    || list.find((g) => groupMatchLevel(g, device) === 'generic')
    || list[0]
    || null;
}
