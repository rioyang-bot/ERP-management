-- ============================================================================
-- 耗材廠牌拼字修正：PANDUTI -> PANDUIT
-- ----------------------------------------------------------------------------
-- PANDUTI 是 PANDUIT（實際廠商名稱）的拼字錯誤，兩者被當成不同廠牌，
-- 導致同一家廠商的品項被拆成兩張卡片。
--
-- 本腳本具冪等性，並可應付各種既有狀態：
--   * 兩個廠牌都存在 -> 合併（型號改指向 PANDUIT，刪除 PANDUTI）
--   * 只有 PANDUTI    -> 直接更名為 PANDUIT
--   * 只有 PANDUIT    -> 不做任何事
--
-- 一併修正品項主檔的廠牌與規格欄位，以及採購紀錄中的廠牌。
-- 規格欄位平時不在正規化範圍內，但這裡是同一個拼字錯誤，一併更正。
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_cat_id      INTEGER;
    v_correct_id  INTEGER;  -- PANDUIT
    v_typo_id     INTEGER;  -- PANDUTI
BEGIN
    SELECT id INTO v_cat_id FROM categories WHERE name = '耗材';
    IF v_cat_id IS NULL THEN
        RAISE NOTICE '找不到「耗材」類別，略過。';
        RETURN;
    END IF;

    SELECT id INTO v_correct_id FROM item_brands
     WHERE category_id = v_cat_id AND UPPER(TRIM(name)) = 'PANDUIT';
    SELECT id INTO v_typo_id FROM item_brands
     WHERE category_id = v_cat_id AND UPPER(TRIM(name)) = 'PANDUTI';

    IF v_typo_id IS NULL THEN
        RAISE NOTICE '廠牌主檔中沒有 PANDUTI，無需合併。';

    ELSIF v_correct_id IS NULL THEN
        -- 只有錯的拼法：直接更名，不會違反 (category_id, name) 唯一鍵
        UPDATE item_brands SET name = 'PANDUIT' WHERE id = v_typo_id;
        RAISE NOTICE '已將廠牌 PANDUTI 更名為 PANDUIT。';

    ELSE
        -- 兩者並存：先處理型號，避免 (brand_id, name) 唯一鍵衝突，
        -- 刪除 PANDUTI 底下名稱已存在於 PANDUIT 的型號，其餘改指向 PANDUIT
        DELETE FROM item_models t
         WHERE t.brand_id = v_typo_id
           AND EXISTS (SELECT 1 FROM item_models k
                        WHERE k.brand_id = v_correct_id AND k.name = t.name);

        UPDATE item_models SET brand_id = v_correct_id WHERE brand_id = v_typo_id;

        -- item_types.brand_id 為相容用的舊欄位，一般為 NULL，仍一併處理
        UPDATE item_types SET brand_id = v_correct_id WHERE brand_id = v_typo_id;

        DELETE FROM item_brands WHERE id = v_typo_id;
        RAISE NOTICE '已將廠牌 PANDUTI 合併至 PANDUIT。';
    END IF;
END $$;

-- 品項主檔：廠牌名稱
UPDATE item_master
   SET brand = 'PANDUIT'
 WHERE category_id = (SELECT id FROM categories WHERE name = '耗材')
   AND UPPER(TRIM(COALESCE(brand, ''))) = 'PANDUTI';

-- 品項主檔：規格欄位中同樣的拼字錯誤（既有正確資料使用 'Panduit'）
UPDATE item_master
   SET specification = REGEXP_REPLACE(specification, 'Panduti', 'Panduit', 'gi')
 WHERE category_id = (SELECT id FROM categories WHERE name = '耗材')
   AND specification ILIKE '%panduti%';

-- 採購紀錄：廠牌名稱
UPDATE purchase_records
   SET brand = 'PANDUIT'
 WHERE category_id = (SELECT id FROM categories WHERE name = '耗材')
   AND UPPER(TRIM(COALESCE(brand, ''))) = 'PANDUTI';

COMMIT;
