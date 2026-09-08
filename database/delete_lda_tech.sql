BEGIN;

-- 1. 清理維修明細中該廠牌設備的紀錄 (若有)
DELETE FROM repair_items 
WHERE asset_id IN (
    SELECT a.id FROM assets a 
    JOIN item_master m ON a.item_master_id = m.id 
    WHERE LOWER(TRIM(m.brand)) LIKE 'lda%' 
      AND m.category_id = (SELECT id FROM categories WHERE name = '設備')
) OR (
    LOWER(TRIM(brand)) LIKE 'lda%' 
    AND item_master_id IN (SELECT id FROM item_master WHERE category_id = (SELECT id FROM categories WHERE name = '設備'))
);

-- 2. 清除資產實體 (assets)
DELETE FROM assets 
WHERE item_master_id IN (
    SELECT id FROM item_master 
    WHERE LOWER(TRIM(brand)) LIKE 'lda%' 
      AND category_id = (SELECT id FROM categories WHERE name = '設備')
);

-- 3. 清除關聯之出入庫明細與實驗室借用
DELETE FROM outbound_items 
WHERE item_id IN (
    SELECT id FROM item_master 
    WHERE LOWER(TRIM(brand)) LIKE 'lda%' 
      AND category_id = (SELECT id FROM categories WHERE name = '設備')
);

DELETE FROM inbound_items 
WHERE item_id IN (
    SELECT id FROM item_master 
    WHERE LOWER(TRIM(brand)) LIKE 'lda%' 
      AND category_id = (SELECT id FROM categories WHERE name = '設備')
);

DELETE FROM item_lab_assignments 
WHERE item_master_id IN (
    SELECT id FROM item_master 
    WHERE LOWER(TRIM(brand)) LIKE 'lda%' 
      AND category_id = (SELECT id FROM categories WHERE name = '設備')
);

-- 4. 清除設備品項主檔 (item_master)
DELETE FROM item_master 
WHERE LOWER(TRIM(brand)) LIKE 'lda%' 
  AND category_id = (SELECT id FROM categories WHERE name = '設備');

-- 5. 清除 LDA 旗下關聯的設備型號 (item_models)
DELETE FROM item_models 
WHERE brand_id IN (
    SELECT id FROM item_brands 
    WHERE LOWER(TRIM(name)) LIKE 'lda%' 
      AND category_id = (SELECT id FROM categories WHERE name = '設備')
);

-- 6. 清除 LDA 設備廠牌主檔 (item_brands)
DELETE FROM item_brands 
WHERE LOWER(TRIM(name)) LIKE 'lda%' 
  AND category_id = (SELECT id FROM categories WHERE name = '設備');

COMMIT;
