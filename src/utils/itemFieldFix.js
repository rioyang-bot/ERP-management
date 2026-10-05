/**
 * 品項欄位更正：廠牌、型號、規格
 *
 * 打錯時有兩種改法（進貨單明細的表頭與每一列各一顆按鈕）：
 *   - 一次改全部：用到這個值的品項主檔全部改
 *   - 只改這個品項：只改那一張品項主檔，同值的其他品項不動
 *
 * 廠牌另外要維護廠牌清單（item_brands），沿用 utils/brandRename.js；
 * 型號與規格的查詢在 database/queries.js 由同一個樣板產生。
 */
import {
  normalizeBrand, buildBrandRenameSteps, buildSingleBrandRenameSteps,
} from './brandRename';

/** 規格是說明文字，只去頭尾空白，不轉大寫 */
const normalizeSpec = (s) => String(s ?? '').trim();

export const ITEM_FIX_FIELDS = {
  brand: {
    key: 'brand',
    label: '廠牌',
    inputLabel: '正確的廠牌名稱',
    normalize: normalizeBrand,
    allowEmpty: false,
    usageQuery: 'fetchBrandUsage',
    conflictsQuery: 'fetchBrandRenameConflicts',
    singleConflictQuery: 'fetchItemMasterBrandConflict',
    buildAllSteps: buildBrandRenameSteps,
    buildSingleSteps: buildSingleBrandRenameSteps,
  },
  model: {
    key: 'model',
    label: '型號',
    inputLabel: '正確的型號',
    normalize: normalizeBrand,
    allowEmpty: false,
    usageQuery: 'fetchModelUsage',
    conflictsQuery: 'fetchModelRenameConflicts',
    singleConflictQuery: 'fetchItemMasterModelConflict',
    buildAllSteps: (oldValue, newValue, expected) => [{
      queryName: 'renameItemMasterModel',
      params: [oldValue, newValue],
      expectRows: expected,
      errorMessage: '品項的數量和剛才查到的不一樣，可能有人同時在修改，請重新開啟後再試',
    }],
    buildSingleSteps: (id, oldValue, newValue) => [{
      queryName: 'renameSingleItemMasterModel',
      params: [id, newValue, oldValue],
      expectRows: 1,
      errorMessage: '這個品項的型號已經被修改過，請重新開啟後再試',
    }],
  },
  specification: {
    key: 'specification',
    label: '規格',
    inputLabel: '正確的規格',
    normalize: normalizeSpec,
    // 規格是選填：只改一個品項時可以清空
    allowEmpty: true,
    usageQuery: 'fetchSpecUsage',
    conflictsQuery: 'fetchSpecRenameConflicts',
    singleConflictQuery: 'fetchItemMasterSpecConflict',
    buildAllSteps: (oldValue, newValue, expected) => [{
      queryName: 'renameItemMasterSpec',
      params: [oldValue, newValue],
      expectRows: expected,
      errorMessage: '品項的數量和剛才查到的不一樣，可能有人同時在修改，請重新開啟後再試',
    }],
    buildSingleSteps: (id, oldValue, newValue) => [{
      queryName: 'renameSingleItemMasterSpec',
      params: [id, newValue, oldValue],
      expectRows: 1,
      errorMessage: '這個品項的規格已經被修改過，請重新開啟後再試',
    }],
  },
};

/**
 * @param {'brand'|'model'|'specification'} field
 * @param {boolean} single 只改一個品項
 * @returns {string|null} 錯誤訊息；沒問題回傳 null
 */
export function validateFieldFix(field, oldValue, newValue, single) {
  const f = ITEM_FIX_FIELDS[field];
  const next = f.normalize(newValue);
  if (!next && !(single && f.allowEmpty)) return `請輸入${f.inputLabel}。`;
  if (next === f.normalize(oldValue)) return `新的${f.label}與目前的相同，不需要更正。`;
  return null;
}

/** 這張單上某個欄位出現過的值（表頭「一次改全部」用），去掉空值與重複 */
export function distinctFieldValues(items, field) {
  return [...new Set((items || []).map((it) => String(it?.[field] ?? '').trim()).filter(Boolean))];
}
