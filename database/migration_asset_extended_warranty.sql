-- ============================================================================
-- 設備／硬體：一次延保 (1st EWS)、二次延保 (2nd EWS)
-- ----------------------------------------------------------------------------
-- 兩個選填的延保到期日，在設備／硬體列表的編輯視窗手動填。
-- 各自有自己的保固標記；判斷「完全過保」時也算一種保固 ——
-- 有填的每一種保固（原廠、客戶、一次延保、二次延保）都過期才算過保。
-- 具冪等性，可重複執行。
-- ============================================================================

BEGIN;

ALTER TABLE assets ADD COLUMN IF NOT EXISTS ews1_expire DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ews2_expire DATE;

COMMENT ON COLUMN assets.ews1_expire IS '一次延保 (1st EWS) 到期日，選填';
COMMENT ON COLUMN assets.ews2_expire IS '二次延保 (2nd EWS) 到期日，選填';

COMMIT;
