-- ============================================================================
-- 進貨單改為兩段式：建立（待確認）→ 確認進貨
-- ----------------------------------------------------------------------------
-- 與出貨單相同：新增進貨單只是把單據記下來（status = 'DRAFT'），
-- 不加庫存、不建資產、不動採購單；在進貨單列表「已建立 (待確認)」按下
-- 「確認進貨」才入庫。待確認的單可以自由修改或刪除，庫存不受影響。
--
-- 訂單來源原本只存在資產上（custom_attributes.order_source），
-- 待確認的單還沒有資產，因此先記在明細上，確認進貨時再寫進資產。
--
-- 既有的進貨單都是建立當下就入庫的（status = 'COMPLETED'），不需轉換。
-- 具冪等性，可重複執行。
-- ============================================================================

BEGIN;

ALTER TABLE inbound_items ADD COLUMN IF NOT EXISTS order_source TEXT;
COMMENT ON COLUMN inbound_items.order_source IS '待確認進貨單的訂單來源；確認進貨時寫進資產的 custom_attributes.order_source';

CREATE INDEX IF NOT EXISTS idx_inbound_orders_status ON inbound_orders (status);

COMMIT;
