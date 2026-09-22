-- ============================================================================
-- 維修單：內部維修的供應商
-- ----------------------------------------------------------------------------
-- 公司內部維修沒有客戶，自然也沒有客戶聯絡人。要記的是「送去哪一家」——
-- 也就是這台設備的供應商，從客戶／廠商管理裡既有的 SUPPLIER 選取。
--
-- 存名稱而不是只存 partner_id：供應商資料若日後被停用或刪除，
-- 單據上仍看得出當初送去哪一家。partner_id 另存供追溯與帶出聯絡方式。
--
-- 具冪等性，可重複執行。
-- ============================================================================

ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS supplier_id INTEGER;
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(100);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'repair_orders_supplier_id_fkey'
  ) THEN
    ALTER TABLE repair_orders
      ADD CONSTRAINT repair_orders_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES partners(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 供應商只屬於內部維修。客戶送修記的是客戶與客戶聯絡人，
-- 兩者混在同一張單上會讓「這台送去哪」變得沒有定論。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'repair_orders_supplier_only_internal'
  ) THEN
    ALTER TABLE repair_orders
      ADD CONSTRAINT repair_orders_supplier_only_internal
      CHECK (
        is_internal = TRUE
        OR (supplier_id IS NULL AND COALESCE(TRIM(supplier_name), '') = '')
      );
  END IF;
END $$;
