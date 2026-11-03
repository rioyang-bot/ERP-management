/**
 * 出機檢查表：拍照項目的預設照片
 *
 * 範本的拍照項目可以上傳一張預設照片（同一種設備拍出來都一樣的項目）。
 * 設備上這一項還沒上傳自己的照片時：
 *   - 顯示並使用預設照片，標明「預設照片」，看得出不是這台自己拍的；
 *   - 算已完成（設備列表、檢查表標題的拍照進度）；
 *   - 匯出 Word 印預設照片，圖說加註「預設照片」。
 * 上傳了自己的照片就改用自己的。
 *
 * 設備端的資料來自 fetchAssetChecklist（default_photo_* 從範本帶過來）。
 */

/** 範本上有沒有設預設照片 */
export const hasDefaultPhoto = (item) => !!(item && String(item.default_photo_file || '').trim());

/**
 * 這一項要不要用預設照片：自己沒有照片、範本有預設照片
 * @param {object} item 設備上的拍照項目
 * @param {number} [ownCount] 自己的照片張數；不給就用 item.photo_count
 */
export const usesDefaultPhoto = (item, ownCount) => {
  const n = ownCount === undefined ? Number(item?.photo_count || 0) : ownCount;
  return n === 0 && hasDefaultPhoto(item);
};

/** 拍照項目是否完成：有自己的照片，或用預設照片 */
export const isPhotoItemDone = (item, ownCount) => {
  const n = ownCount === undefined ? Number(item?.photo_count || 0) : ownCount;
  return n > 0 || hasDefaultPhoto(item);
};

/**
 * 預設照片包成跟 asset_photos 一樣的形狀，縮圖、預覽、下載、匯出都能沿用同一套。
 * isDefault 為 true：不能在設備上刪除（要改去範本）
 */
export const defaultPhotoOf = (item) => (hasDefaultPhoto(item) ? {
  // id 帶上檔名：範本換了照片，縮圖快取才不會沿用舊的那張
  id: `default-${item.id}-${item.default_photo_file}`,
  file_name: item.default_photo_file,
  original_name: item.default_photo_name || item.default_photo_file,
  file_size: item.default_photo_size ?? null,
  uploaded_by_name: item.default_photo_by || null,
  checklist_item_id: item.id,
  isDefault: true,
} : null);

/** 預設照片的標示文字 */
export const DEFAULT_PHOTO_LABEL = '預設照片';
