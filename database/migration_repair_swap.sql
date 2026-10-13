-- ============================================================================
-- 維修單：以庫存設備換貨
-- ----------------------------------------------------------------------------
-- 客戶的設備故障，直接從公司庫存拿一台換給客戶，故障的那台取回。
-- 在維修單上一次完成：新設備出貨給客戶、故障設備取回（維修中）、維修單結案，
-- 並自動產生一張已出貨的出貨單（可列印交貨簽收單）。
--
--   repair_items.replacement_sn / replacement_asset_id：這一台換成了哪一台
--   repair_orders.swap_dn_no：換貨時產生的出貨單號
--
-- 具冪等性，可重複執行。
-- ============================================================================

BEGIN;

ALTER TABLE repair_items ADD COLUMN IF NOT EXISTS replacement_sn VARCHAR(100);
ALTER TABLE repair_items ADD COLUMN IF NOT EXISTS replacement_asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL;
COMMENT ON COLUMN repair_items.replacement_sn IS '以庫存設備換貨時，換給客戶的那一台序號';

ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS swap_dn_no VARCHAR(50);
COMMENT ON COLUMN repair_orders.swap_dn_no IS '以庫存設備換貨時自動產生的出貨單號';

COMMIT;
