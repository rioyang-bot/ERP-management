BEGIN;

-- ==========================================
-- ⚠️ 警告：此腳本將清除所有「設備」類別的資產與品項資料
-- （硬體與耗材資料均受保護，完全不受影響）
-- ==========================================

-- 1. 清理維修明細中「設備類別」的紀錄
DELETE FROM repair_items 
WHERE asset_id IN (
    SELECT a.id FROM assets a 
    JOIN item_master m ON a.item_master_id = m.id 
    WHERE m.category_id = (SELECT id FROM categories WHERE name = '設備')
) OR item_master_id IN (
    SELECT id FROM item_master 
    WHERE category_id = (SELECT id FROM categories WHERE name = '設備')
);

-- 2. 清除設備實體資產 (assets)
DELETE FROM assets 
WHERE item_master_id IN (
    SELECT id FROM item_master 
    WHERE category_id = (SELECT id FROM categories WHERE name = '設備')
);

-- 3. 清除關聯之出入庫明細與實驗室借用 (僅限設備)
DELETE FROM outbound_items 
WHERE item_id IN (
    SELECT id FROM item_master 
    WHERE category_id = (SELECT id FROM categories WHERE name = '設備')
);

DELETE FROM inbound_items 
WHERE item_id IN (
    SELECT id FROM item_master 
    WHERE category_id = (SELECT id FROM categories WHERE name = '設備')
);

DELETE FROM item_lab_assignments 
WHERE item_master_id IN (
    SELECT id FROM item_master 
    WHERE category_id = (SELECT id FROM categories WHERE name = '設備')
);

-- 4. 清除設備品項主檔 (item_master)
DELETE FROM item_master 
WHERE category_id = (SELECT id FROM categories WHERE name = '設備');

-- 5. 清除設備類別下的自訂型號 (item_models)
DELETE FROM item_models 
WHERE brand_id IN (
    SELECT id FROM item_brands 
    WHERE category_id = (SELECT id FROM categories WHERE name = '設備')
);

-- 6. 清除設備類別下的自訂廠牌 (item_brands)
DELETE FROM item_brands 
WHERE category_id = (SELECT id FROM categories WHERE name = '設備');

COMMIT;
