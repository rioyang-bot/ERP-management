-- ============================================================================
-- 客戶/廠商管理：夥伴類型新增「經銷商」
-- ----------------------------------------------------------------------------
-- partners.partner_type 原本只允許 CUSTOMER（客戶）與 SUPPLIER（供應商）。
-- 新增 DEALER（經銷商）：同時出現在客戶與供應商的下拉選單裡
-- （出貨單、借用單、維修單的客戶，採購單、進貨單的廠商）。
--
-- 只放寬檢查限制，不動既有資料。具冪等性，可重複執行。
-- ============================================================================

BEGIN;

ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_partner_type_check;
ALTER TABLE partners ADD CONSTRAINT partners_partner_type_check
    CHECK (partner_type IN ('CUSTOMER', 'SUPPLIER', 'DEALER'));

COMMIT;
