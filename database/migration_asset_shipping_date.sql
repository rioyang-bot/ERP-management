-- 遷移指令：為 assets 表新增出貨日期欄位 shipping_date
ALTER TABLE assets ADD COLUMN IF NOT EXISTS shipping_date DATE;
