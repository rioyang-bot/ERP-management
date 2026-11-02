-- ============================================================================
-- 設備／硬體：進貨日期、原廠保固(年)、客戶保固(年)
-- ----------------------------------------------------------------------------
-- 保固到期日改成可以由年數自動算出：
--   原廠保固到期 (warranty_expire)          = 進貨日期 (stock_date)     + 原廠保固(年)
--   客戶保固到期 (customer_warranty_expire) = 安裝日期 (installed_date) + 客戶保固(年)
-- 年數沒選的資產維持原本的做法，到期日照舊手動填寫，既有資料不受影響。
--
-- 進貨日期在「確認進貨」時由進貨單的進貨日期寫入；這裡替既有資產補上：
-- 以序號對到已入庫（非待確認）的進貨單，同一支序號進過多次取最早那一張。
-- 只補空白的，沒有序號的資產對不到是哪一張單，維持空白。
-- 具冪等性，可重複執行。
-- ============================================================================

BEGIN;

ALTER TABLE assets ADD COLUMN IF NOT EXISTS stock_date DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS warranty_years SMALLINT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS customer_warranty_years SMALLINT;

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_warranty_years_check;
ALTER TABLE assets ADD CONSTRAINT assets_warranty_years_check CHECK (warranty_years BETWEEN 1 AND 5);
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_customer_warranty_years_check;
ALTER TABLE assets ADD CONSTRAINT assets_customer_warranty_years_check CHECK (customer_warranty_years BETWEEN 1 AND 5);

COMMENT ON COLUMN assets.stock_date IS '進貨日期：確認進貨時寫入進貨單的進貨日期，可再編輯';
COMMENT ON COLUMN assets.warranty_years IS '原廠保固(年) 1~5；有值時原廠保固到期 = 進貨日期 + 年數';
COMMENT ON COLUMN assets.customer_warranty_years IS '客戶保固(年) 1~5；有值時客戶保固到期 = 安裝日期 + 年數';

UPDATE assets a SET stock_date = src.stock_date
FROM (
  SELECT DISTINCT ON (UPPER(TRIM(ii.sn)))
         UPPER(TRIM(ii.sn)) AS sn_key,
         COALESCE(io.order_date, io.created_at::date) AS stock_date
  FROM inbound_items ii
  JOIN inbound_orders io ON io.id = ii.inbound_order_id
  WHERE ii.sn IS NOT NULL AND TRIM(ii.sn) <> '' AND COALESCE(io.status, '') <> 'DRAFT'
  ORDER BY UPPER(TRIM(ii.sn)), COALESCE(io.order_date, io.created_at::date) ASC
) src
WHERE a.stock_date IS NULL
  AND a.sn IS NOT NULL AND TRIM(a.sn) <> ''
  AND UPPER(TRIM(a.sn)) = src.sn_key;

COMMIT;
