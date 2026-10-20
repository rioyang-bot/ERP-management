-- ============================================================================
-- 維修代用機：借用單連回維修單
-- ----------------------------------------------------------------------------
-- 客戶設備送修期間，借一台設備給客戶暫用。代用機走借用單（借出、借貨申請單、
-- 延長、歸還照舊），只是要知道它是借給哪張維修單的：
--   - 維修單上看得到代用機與它的狀態
--   - 借用列表標出「維修代用 RMA-…」
--   - 維修完工出貨時提醒收回代用機
--
-- 具冪等性，可重複執行。
-- ============================================================================

BEGIN;

ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS repair_id INTEGER REFERENCES repair_orders(id) ON DELETE SET NULL;
COMMENT ON COLUMN outbound_requests.repair_id IS '維修代用機：這張借用單是借給哪張維修單的';
CREATE INDEX IF NOT EXISTS idx_outbound_requests_repair_id ON outbound_requests(repair_id);

COMMIT;
