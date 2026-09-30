-- ============================================================================
-- 出機檢查表：拍照項目
-- ----------------------------------------------------------------------------
-- 主機照片原本是整台設備一起上傳，人員不知道該拍哪些角度，拍漏了也看不出來。
--
-- 範本新增第三種項目 PHOTO（拍照項目），例如「正面」「背面」「機櫃內配線」。
-- 與主要檢查功能一樣自動套用到符合廠牌／型號的每一台設備；
-- 在設備上針對每一個拍照項目上傳照片，有照片就算完成。
--
-- asset_photos.checklist_item_id 記錄照片是為哪一個拍照項目拍的：
--   有值  屬於該拍照項目
--   NULL  其他照片（先前上傳的、或不屬於任何項目的）
-- 拍照項目從設備上移除時設為 NULL，照片本身留著、改列為其他照片。
--
-- 具冪等性，可重複執行。
-- ============================================================================

BEGIN;

ALTER TABLE checklist_items DROP CONSTRAINT IF EXISTS chk_checklist_item_kind;
ALTER TABLE checklist_items ADD CONSTRAINT chk_checklist_item_kind
    CHECK (kind IN ('MAIN', 'DETAIL', 'PHOTO'));

ALTER TABLE asset_checklist_items DROP CONSTRAINT IF EXISTS chk_asset_checklist_kind;
ALTER TABLE asset_checklist_items ADD CONSTRAINT chk_asset_checklist_kind
    CHECK (kind IN ('MAIN', 'DETAIL', 'PHOTO'));

ALTER TABLE asset_photos ADD COLUMN IF NOT EXISTS checklist_item_id INTEGER
    REFERENCES asset_checklist_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN asset_photos.checklist_item_id IS '這張照片是為哪一個拍照項目拍的；NULL 為其他照片';

CREATE INDEX IF NOT EXISTS idx_asset_photos_checklist_item ON asset_photos (checklist_item_id);

COMMIT;
