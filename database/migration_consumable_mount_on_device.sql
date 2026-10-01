-- ============================================================================
-- 耗材掛載到設備上
-- ----------------------------------------------------------------------------
-- 掛載＝把耗材從庫存移到 LAB，並記在某一台設備上（item_lab_assignments）。
-- 出貨單／借用單加入設備時，它掛載的耗材一併帶入，出貨時從 LAB 扣除。
--
-- 1. item_lab_assignments 改為有正負號的流水帳：
--      + 掛上（移到 LAB）、借用歸還回到設備上
--      − 卸下（移回庫存）、隨設備出貨、隨設備借出
--    某台設備目前掛了多少 = SUM(quantity)。
--    原本的 CHECK (quantity > 0) 讓「移回庫存」的負數那筆一直寫不進去
--    （錯誤被吞掉），帳只增不減；改為不得為 0。
--
-- 2. outbound_items.lab_asset_id：這一列耗材是掛在哪一台設備上、隨設備一起出的。
--    有值的列在出貨時從 LAB 扣（並扣掉那台設備的掛載數量），沒有值的照舊從庫存扣。
--    設備刪除時設為 NULL，明細本身保留。
--
-- 具冪等性，可重複執行。既有資料不需轉換（目前沒有任何耗材放在 LAB）。
-- ============================================================================

BEGIN;

ALTER TABLE item_lab_assignments DROP CONSTRAINT IF EXISTS item_lab_assignments_quantity_check;
ALTER TABLE item_lab_assignments ADD CONSTRAINT item_lab_assignments_quantity_check CHECK (quantity <> 0);

CREATE INDEX IF NOT EXISTS idx_item_lab_assignments_asset ON item_lab_assignments (asset_id, item_master_id);

ALTER TABLE outbound_items ADD COLUMN IF NOT EXISTS lab_asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL;
COMMENT ON COLUMN outbound_items.lab_asset_id IS '掛載在這台設備上、隨設備出貨的耗材；出貨時從 LAB 扣除';

COMMIT;
