-- ============================================================================
-- 出機檢查表：拍照項目的預設照片
-- ----------------------------------------------------------------------------
-- 有些拍照項目在同一種設備上拍出來都一樣（例如背板標示、配件）。
-- 在範本的拍照項目上傳一張預設照片：
--   - 設備上這一項還沒上傳照片時，顯示並使用預設照片，算已完成；
--   - 匯出 Word 時印預設照片，圖說加註「預設照片」；
--   - 設備上傳自己的照片後就改用自己的，預設照片不再顯示。
-- 預設照片存在範本項目上，設備經由 asset_checklist_items.source_item_id 取用；
-- 範本換照片，還沒上傳自己照片的設備跟著換。
-- 具冪等性，可重複執行。
-- ============================================================================

BEGIN;

ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS default_photo_file VARCHAR(300);
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS default_photo_name VARCHAR(300);
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS default_photo_mime VARCHAR(100);
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS default_photo_size BIGINT;
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS default_photo_by VARCHAR(100);
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS default_photo_at TIMESTAMP;

COMMENT ON COLUMN checklist_items.default_photo_file IS '拍照項目的預設照片（存檔名）；設備上這一項沒有照片時使用';
COMMENT ON COLUMN checklist_items.default_photo_name IS '預設照片的原始檔名';

COMMIT;
