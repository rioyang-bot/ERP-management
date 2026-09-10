-- 將耗材中的廠牌名稱 METech / MEtech 一律更新為 METECH
BEGIN;

-- 1. 更新品項主檔 (item_master) 中的耗材廠牌名稱
UPDATE item_master 
SET brand = 'METECH' 
WHERE category_id = (SELECT id FROM categories WHERE name = '耗材') 
  AND brand IN ('METech', 'MEtech');

-- 2. 更新採購紀錄 (purchase_records) 中屬於耗材的廠牌名稱
UPDATE purchase_records 
SET brand = 'METECH' 
WHERE category_id = (SELECT id FROM categories WHERE name = '耗材') 
  AND brand IN ('METech', 'MEtech');

-- 3. 整合廠牌維護表 (item_brands) 與關聯型號 (item_models)，避免唯一鍵 (category_id, name) 衝突
DO $$
DECLARE
    v_cat_id INTEGER;
    v_target_brand_id INTEGER;
BEGIN
    SELECT id INTO v_cat_id FROM categories WHERE name = '耗材';
    
    -- 取得大寫 METECH 的 ID
    SELECT id INTO v_target_brand_id 
    FROM item_brands 
    WHERE category_id = v_cat_id AND name = 'METECH';
    
    IF v_target_brand_id IS NULL THEN
        -- 若無 METECH，將第一個 METech/MEtech 更名為 METECH
        UPDATE item_brands 
        SET name = 'METECH' 
        WHERE id = (
            SELECT id FROM item_brands 
            WHERE category_id = v_cat_id AND name IN ('METech', 'MEtech') 
            ORDER BY id ASC LIMIT 1
        )
        RETURNING id INTO v_target_brand_id;
    END IF;

    -- 若已存在 METECH，將其餘舊廠牌下的型號指向 METECH
    IF v_target_brand_id IS NOT NULL THEN
        UPDATE item_models 
        SET brand_id = v_target_brand_id 
        WHERE brand_id IN (
            SELECT id FROM item_brands 
            WHERE category_id = v_cat_id AND name IN ('METech', 'MEtech') AND id <> v_target_brand_id
        );
        
        -- 刪除重複的舊廠牌
        DELETE FROM item_brands 
        WHERE category_id = v_cat_id AND name IN ('METech', 'MEtech') AND id <> v_target_brand_id;
    END IF;
END $$;

COMMIT;
