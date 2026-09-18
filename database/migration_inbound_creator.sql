-- ============================================================================
-- 進貨單：記錄建立者
-- ----------------------------------------------------------------------------
-- 出貨單、借用單、維修單都存了 creator_id，進貨單沒有 ——
-- 入庫資料有疑問時查不出是誰經手的。欄位比照其他單據命名，
-- 進貨單列表才能用同一種方式顯示「建立者」。
--
-- 既有單據沒有可回填的來源（稽核紀錄裡沒有 INBOUND 的建立事件），
-- 因此舊單的建立者會是空的，列表上顯示為「－」。
--
-- 具冪等性，可重複執行。
-- ============================================================================

ALTER TABLE inbound_orders ADD COLUMN IF NOT EXISTS creator_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inbound_orders_creator_id_fkey'
  ) THEN
    ALTER TABLE inbound_orders
      ADD CONSTRAINT inbound_orders_creator_id_fkey
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
