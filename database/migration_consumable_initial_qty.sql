-- ============================================================================
-- 耗材初始數量
-- ----------------------------------------------------------------------------
-- 品項履歷的「初始庫存/批次匯入」那一列，原本拿 stock_qty（目前庫存）當數量：
-- 匯入 74、出貨 15，履歷卻寫「初始 59」，看起來像出貨沒扣。
-- 改用倒推（目前庫存 + 實驗室 + 借出 + 已出貨）也不可靠 —— 之後只要有盤點調整、
-- 覆蓋匯入、進貨數量更正，倒推出來的初始值就會跟著變。
--
-- 新增 initial_stock_qty，建立品項當下寫入一次，之後不再變動。
--
-- 既有品項以現況倒推回填：
--   目前庫存 + 實驗室 + 借出在外 + 已出貨的銷貨單 − 已完成的進貨
-- 借用單不計：借出中的已在 lent_qty，歸還的已回到 stock_qty。
--
-- 具冪等性：欄位用 IF NOT EXISTS，回填只補 NULL，不覆寫已經有值的品項。
-- ============================================================================

BEGIN;

-- 先不給預設值，既有資料才會是 NULL，回填時分得出哪些還沒補
ALTER TABLE item_master ADD COLUMN IF NOT EXISTS initial_stock_qty INTEGER;

COMMENT ON COLUMN item_master.initial_stock_qty IS '耗材建立當下的數量（批次匯入或手動建立），供品項履歷顯示初始庫存，建立後不再變動';

UPDATE item_master m
SET initial_stock_qty = GREATEST(
      COALESCE(m.stock_qty, 0) + COALESCE(m.lab_qty, 0) + COALESCE(m.lent_qty, 0)
      + COALESCE((
          SELECT SUM(oi.quantity)
          FROM outbound_items oi
          JOIN outbound_requests o ON oi.request_id = o.id
          WHERE oi.item_id = m.id
            AND o.status = 'SHIPPED'
            AND COALESCE(o.request_type, 'SALE') <> 'LEND'
        ), 0)
      - COALESCE((
          SELECT SUM(ii.quantity)
          FROM inbound_items ii
          JOIN inbound_orders io ON ii.inbound_order_id = io.id
          WHERE ii.item_id = m.id
            AND io.status = 'COMPLETED'
        ), 0),
      0)
FROM categories c
WHERE m.category_id = c.id
  AND c.name = '耗材'
  AND m.initial_stock_qty IS NULL;

-- 非耗材沒有初始數量的概念
UPDATE item_master SET initial_stock_qty = 0 WHERE initial_stock_qty IS NULL;

ALTER TABLE item_master ALTER COLUMN initial_stock_qty SET DEFAULT 0;

COMMIT;
