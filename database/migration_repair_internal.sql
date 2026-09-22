-- ============================================================================
-- 維修單：公司內部維修
-- ----------------------------------------------------------------------------
-- 維修單原本一定要填客戶名稱，但庫存裡有 389 台設備／硬體沒有客戶
-- （公司資產 6 台、尚未出貨的一般銷售品 383 台）。這些送修時只能在必填欄位
-- 硬編一個名字，久了就會出現「本公司」「METECH」「自有」各種寫法混在客戶清單裡。
--
-- 改為在單上明確記錄這是客戶送修還是公司內部：
--   is_internal = FALSE  客戶送修，customer_name 必填（既有行為）
--   is_internal = TRUE   公司內部，customer_name 留空
--
-- 既有單據都是客戶送修，預設值 FALSE 正好，不需要轉換資料。
--
-- 具冪等性，可重複執行。
-- ============================================================================

ALTER TABLE repair_orders
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE;

-- 內部維修沒有客戶，這個欄位不能再強制有值。
-- 該不該填改由 is_internal 決定，見下方的檢查條件。
ALTER TABLE repair_orders ALTER COLUMN customer_name DROP NOT NULL;

-- 兩者必須一致：客戶送修一定要有客戶名稱，內部維修一定沒有。
-- 只靠前端擋的話，之後任何一條新的寫入路徑都可能繞過去。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'repair_orders_customer_matches_scope'
  ) THEN
    ALTER TABLE repair_orders
      ADD CONSTRAINT repair_orders_customer_matches_scope
      CHECK (
        (is_internal = TRUE  AND COALESCE(TRIM(customer_name), '') = '')
        OR
        (is_internal = FALSE AND COALESCE(TRIM(customer_name), '') <> '')
      );
  END IF;
END $$;
