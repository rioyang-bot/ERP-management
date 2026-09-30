-- ============================================================================
-- 出機檢查表：拍照項目說明與範例
-- ----------------------------------------------------------------------------
-- 1. 拍照項目只有名稱（例如「正面」），拍的人不知道要拍到什麼程度才算數。
--    新增 description，寫下拍攝指示（例如「關機狀態、正面平視，看得到序號貼紙」），
--    設備上每一個拍照項目底下直接顯示。
--
--    checklist_items.description        範本上的說明
--    asset_checklist_items.description  套用到設備時的快照；範本改說明時跟著更新，
--                                       範本被刪掉時仍保留，與名稱的處理一致
--
-- 2. checklist_photo_examples：使用者自己維護的常用拍照項目（項目 + 說明），
--    新增拍照項目時可以直接選取，不必每個主項目重打一次。
--    範例只是新增時的來源，從範例加進去之後就是獨立的一筆，改範例不會回頭改它。
--
-- 具冪等性，可重複執行。
-- ============================================================================

BEGIN;

ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE asset_checklist_items ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN checklist_items.description IS '項目說明，拍照項目用來寫拍攝指示';
COMMENT ON COLUMN asset_checklist_items.description IS '套用當下的項目說明快照';

CREATE TABLE IF NOT EXISTS checklist_photo_examples (
    id SERIAL PRIMARY KEY,
    name VARCHAR(300) NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_photo_examples_name
    ON checklist_photo_examples (UPPER(TRIM(name)));

COMMIT;
