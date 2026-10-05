/**
 * 廠牌更名
 *
 * 廠牌打錯時（例如「元景資訊」打成「光景資訊」），用到它的品項主檔可能有好幾張，
 * 而且跨硬體與耗材。逐筆到各列表改不切實際，硬體列表的編輯還會把共用主檔的
 * 資產拆成新的卡片。這裡一次把所有用到舊名稱的品項主檔與廠牌清單改掉。
 *
 * 改名後若會跟既有的品項撞在一起（同類別、類型、型號，硬體另比規格），
 * 一律擋下來，不做合併 —— 合併牽涉資產、單據與庫存，要另外處理。
 */

/** 與資料庫新增品項時相同的正規化：去頭尾與重複空白、英文轉大寫 */
export const normalizeBrand = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

/**
 * @returns {string|null} 錯誤訊息；沒問題回傳 null
 */
export function validateBrandRename(oldBrand, newBrand) {
  const next = normalizeBrand(newBrand);
  if (!next) return '請輸入正確的廠牌名稱。';
  if (next === normalizeBrand(oldBrand)) return '新的名稱與目前的廠牌相同，不需要更名。';
  return null;
}

/**
 * 更名的交易步驟。品項主檔那一步要改到預期的張數，
 * 少一張（有人同時在改）就整批退回。
 */
export function buildBrandRenameSteps(oldBrand, newBrand, expectedMasters) {
  const params = [oldBrand, newBrand];
  return [
    {
      queryName: 'renameItemMasterBrand',
      params,
      expectRows: expectedMasters,
      errorMessage: '品項主檔的數量和剛才查到的不一樣，可能有人同時在修改，請重新開啟後再試',
    },
    // 廠牌清單：新名稱已經存在的類別先合併，其餘直接改名
    { queryName: 'mergeBrandModelsDropDuplicates', params },
    { queryName: 'mergeBrandModelsAndTypes', params },
    { queryName: 'deleteMergedBrands', params },
    { queryName: 'renameItemBrands', params },
  ];
}

/** 用到這個廠牌的品項，依類別統計 */
export function summarizeBrandUsage(rows = []) {
  const byCategory = {};
  let assets = 0;
  const orders = new Set();
  for (const r of rows) {
    const cat = r.category_name || '未分類';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    assets += Number(r.asset_count) || 0;
    String(r.inbound_orders || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((o) => orders.add(o));
  }
  return { masters: rows.length, byCategory, assets, orders: [...orders].sort() };
}

/** 寫事件紀錄用的模組：依品項類別 */
export const auditModuleFor = (category) => ({ 設備: 'DEVICE', 硬體: 'HARDWARE', 耗材: 'CONSUMABLE' }[category] || 'SETTING');
