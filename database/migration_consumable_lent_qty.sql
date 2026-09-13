-- ============================================================================
-- 耗材借出中數量
-- ----------------------------------------------------------------------------
-- 在此之前，耗材借出只是把 stock_qty 扣掉，系統沒有任何地方記得「這批是借出去
-- 的、之後會還回來」，因此：
--   1. 登記歸還時無從得知要加回多少，程式也確實沒有加回，庫存永久短少。
--   2. 耗材列表看不出目前有多少數量在外面借著，與賣掉的無法區分。
--
-- 新增 lent_qty 記錄「目前借出在外的數量」：
--   確認借出：stock_qty 減、lent_qty 加
--   登記歸還：stock_qty 加、lent_qty 減
--
-- 並回填既有的借出中單據（request_type = LEND 且狀態為 SHIPPED 的耗材明細），
-- 這些單子當初已經扣過 stock_qty，若不回填，日後歸還時 lent_qty 會被減成負數。
--
-- 具冪等性，可重複執行：欄位用 IF NOT EXISTS，回填是以彙總結果覆寫而非累加。
-- ============================================================================

BEGIN;

ALTER TABLE item_master ADD COLUMN IF NOT EXISTS lent_qty INTEGER DEFAULT 0;

COMMENT ON COLUMN item_master.lent_qty IS '目前借出在外的數量（借用單確認借出時增加、登記歸還時減少）';

-- 既有未歸還的借用單：把已扣掉的數量補記成借出中
UPDATE item_master m
SET lent_qty = COALESCE(sub.qty, 0)
FROM (
    SELECT oi.item_id, SUM(oi.quantity) AS qty
    FROM outbound_items oi
    JOIN outbound_requests r ON oi.request_id = r.id
    JOIN item_master im ON oi.item_id = im.id
    JOIN categories c ON im.category_id = c.id
    WHERE r.request_type = 'LEND'
      AND r.status = 'SHIPPED'
      AND c.name = '耗材'
    GROUP BY oi.item_id
) sub
WHERE m.id = sub.item_id;

-- 沒有借出中單據的品項一律歸零，重複執行時才不會殘留舊值
UPDATE item_master m
SET lent_qty = 0
WHERE COALESCE(m.lent_qty, 0) <> 0
  AND NOT EXISTS (
      SELECT 1
      FROM outbound_items oi
      JOIN outbound_requests r ON oi.request_id = r.id
      WHERE oi.item_id = m.id
        AND r.request_type = 'LEND'
        AND r.status = 'SHIPPED'
  );

COMMIT;
