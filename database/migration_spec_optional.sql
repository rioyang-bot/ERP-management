BEGIN;

-- ==========================================
-- 將 item_master 規格欄位 (specification) 改為非必填 (選填)
-- ==========================================

ALTER TABLE item_master ALTER COLUMN specification DROP NOT NULL;
ALTER TABLE item_master ALTER COLUMN specification SET DEFAULT '';

COMMIT;
