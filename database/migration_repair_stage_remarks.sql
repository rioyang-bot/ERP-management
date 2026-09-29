-- ============================================================================
-- 維修單：每個階段各有自己的說明欄位
-- ----------------------------------------------------------------------------
-- 原本整張單共用一個 remarks 欄位，四個階段的動作彈窗都會寫它，而且寫法是
-- remarks = COALESCE($n, remarks) —— 送修時填的物流單號，到完工出貨那一步
-- 重打就被蓋掉，資料庫也不知道哪一筆是在哪一步填的。
--
-- 改成四個階段各有一欄：
--   現場處理／取回   on_site_status      現場狀況／故障描述（已存在）
--   送修原廠         send_oem_remarks    送修備註（本次新增）
--   原廠返還／修復   results             維修與檢測結果（已存在）
--   客戶完工出貨     completion_remarks  出貨備註（本次新增）
--
-- remarks 保留為「建單備註」：建單表單的提示文字是「聯絡窗口、派工工程師、
-- 特殊注意規範」，本來就是單據層級的事，不屬於任何一個階段。
--
-- 既有資料依「最後走到的階段」搬到對應欄位 —— 覆寫它的必然是最後執行的那一步，
-- 這樣推是準的。只走到現場處理的單沒有人覆寫過，那就是原本的建單備註，留在原欄位。
-- 走到原廠返還但還沒出貨的單，那一階段的欄位是 results（另外必填），
-- 備註歸到同一段原廠行程的 send_oem_remarks。
--
-- 具冪等性，可重複執行：只在目標欄位還是空的時候搬。
-- ============================================================================

ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS send_oem_remarks TEXT;
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS completion_remarks TEXT;

-- 已完工出貨的 → 出貨備註
UPDATE repair_orders
   SET completion_remarks = remarks,
       remarks = NULL
 WHERE completion_date IS NOT NULL
   AND NULLIF(TRIM(COALESCE(remarks, '')), '') IS NOT NULL
   AND NULLIF(TRIM(COALESCE(completion_remarks, '')), '') IS NULL;

-- 走過原廠但還沒出貨的 → 送修備註
UPDATE repair_orders
   SET send_oem_remarks = remarks,
       remarks = NULL
 WHERE completion_date IS NULL
   AND (send_oem_date IS NOT NULL OR oem_return_date IS NOT NULL)
   AND NULLIF(TRIM(COALESCE(remarks, '')), '') IS NOT NULL
   AND NULLIF(TRIM(COALESCE(send_oem_remarks, '')), '') IS NULL;

COMMENT ON COLUMN repair_orders.remarks IS '建單備註：聯絡窗口、派工工程師等單據層級的事，不屬於任何階段';
COMMENT ON COLUMN repair_orders.send_oem_remarks IS '送修備註：送修原廠那一步填寫，例如物流單號、原廠 RMA 編號';
COMMENT ON COLUMN repair_orders.completion_remarks IS '出貨備註：完工出貨那一步填寫';
