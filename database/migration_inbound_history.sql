-- 確保進貨單具備 order_date 欄位以支援歷程查詢
ALTER TABLE inbound_orders ADD COLUMN IF NOT EXISTS order_date DATE DEFAULT CURRENT_DATE;
