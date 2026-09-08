BEGIN;

-- ==========================================
-- ⚠️ 警告：此腳本將清除所有「耗材」類別的庫存、品項與關聯紀錄
-- （「設備」與「硬體」資料均受保護，完全不受影響）
-- ==========================================

-- 1. 清除實驗室耗材借用/領用分配紀錄 (item_lab_assignments)
DELETE FROM item_lab_assignments 
WHERE item_master_id IN (
    SELECT id FROM item_master 
    WHERE category_id = (SELECT id FROM categories WHERE name = '耗材')
);

-- 2. 清除進貨單明細中屬於耗材的紀錄 (inbound_items)
DELETE FROM inbound_items 
WHERE item_id IN (
    SELECT id FROM item_master 
    WHERE category_id = (SELECT id FROM categories WHERE name = '耗材')
);

-- 3. 清除出庫申請明細中屬於耗材的紀錄 (outbound_items)
DELETE FROM outbound_items 
WHERE item_id IN (
    SELECT id FROM item_master 
    WHERE category_id = (SELECT id FROM categories WHERE name = '耗材')
);

-- 4. 清理維修明細中可能關聯之耗材紀錄 (repair_items)
DELETE FROM repair_items 
WHERE item_master_id IN (
    SELECT id FROM item_master 
    WHERE category_id = (SELECT id FROM categories WHERE name = '耗材')
);

-- 5. 清除耗材品項主檔與實體/實驗室庫存 (item_master)
DELETE FROM item_master 
WHERE category_id = (SELECT id FROM categories WHERE name = '耗材');

-- ==========================================
-- 選用區塊：清除耗材相關之自訂型號、類型與廠牌清單
-- （若希望保留下拉選單中的廠牌/類型/型號選項，可將下方 6~8 段落略過或註解）
-- ==========================================

-- 6. 清除耗材類別下的型號 (item_models)
DELETE FROM item_models 
WHERE brand_id IN (
    SELECT id FROM item_brands 
    WHERE category_id = (SELECT id FROM categories WHERE name = '耗材')
) OR type_id IN (
    SELECT id FROM item_types 
    WHERE category_id = (SELECT id FROM categories WHERE name = '耗材')
);

-- 7. 清除耗材類別下的類型 (item_types)
DELETE FROM item_types 
WHERE category_id = (SELECT id FROM categories WHERE name = '耗材');

-- 8. 清除耗材類別下的廠牌 (item_brands)
DELETE FROM item_brands 
WHERE category_id = (SELECT id FROM categories WHERE name = '耗材');

COMMIT;
