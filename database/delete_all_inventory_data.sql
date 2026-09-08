BEGIN;

-- ==========================================
-- ⚠️ 警告：此腳本將清除所有「設備、硬體、耗材」之庫存、資產與品項資料
-- （使用者帳號 users、合作夥伴 partners、三大分類 categories 受保護保留）
-- ==========================================

-- 1. 清理維修明細 (repair_items)
DELETE FROM repair_items;

-- 2. 清除資產實體 (assets - 包含設備與硬體序號資產)
DELETE FROM assets;

-- 3. 清除實驗室借用/領用分配 (item_lab_assignments)
DELETE FROM item_lab_assignments;

-- 4. 清除出庫申請明細 (outbound_items)
DELETE FROM outbound_items;

-- 5. 清除進貨單明細 (inbound_items)
DELETE FROM inbound_items;

-- 6. 清除所有品項主檔與庫存 (item_master - 設備、硬體、耗材)
DELETE FROM item_master;

-- 7. 清除自訂型號 (item_models)
DELETE FROM item_models;

-- 8. 清除自訂類型 (item_types)
DELETE FROM item_types;

-- 9. 清除自訂廠牌 (item_brands)
DELETE FROM item_brands;

COMMIT;
