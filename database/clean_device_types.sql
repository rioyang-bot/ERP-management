-- ==============================================================================
-- 腳本名稱：clean_device_types.sql
-- 說明：清理設備 (Equipment) 誤匯入的 OS TYPE 項目，僅保留 SERVER 與 SWITCH
-- ==============================================================================

BEGIN;

-- 1. （選用保護）若既有設備資產尚未填寫 os 欄位，將誤寫在 type 的作業系統名稱回填至 os
UPDATE assets a
SET os = im.type
FROM item_master im
WHERE a.item_master_id = im.id
  AND im.category_id = (SELECT id FROM categories WHERE name = '設備')
  AND UPPER(TRIM(im.type)) NOT IN ('SERVER', 'SWITCH')
  AND (a.os IS NULL OR TRIM(a.os) = '');

-- 2. 將既有設備品項主檔 (item_master) 中誤填為 OS 的類型統一校正為 'SERVER'
--    （若型號名稱含有 Switch / 交換器相關字樣，可自動判定為 SWITCH，其餘為 SERVER）
UPDATE item_master
SET type = CASE 
  WHEN UPPER(model) LIKE '%SWITCH%' OR UPPER(specification) LIKE '%SWITCH%' THEN 'SWITCH'
  ELSE 'SERVER'
END
WHERE category_id = (SELECT id FROM categories WHERE name = '設備')
  AND UPPER(TRIM(type)) NOT IN ('SERVER', 'SWITCH');

-- 3. 確保 item_types 必定存在 'SERVER' 與 'SWITCH' 兩項
INSERT INTO item_types (category_id, name)
VALUES 
  ((SELECT id FROM categories WHERE name = '設備'), 'SERVER'),
  ((SELECT id FROM categories WHERE name = '設備'), 'SWITCH')
ON CONFLICT (category_id, name) DO NOTHING;

-- 4. 清除 item_types 中所有非 'SERVER' 與 'SWITCH' 的設備類型（清理下拉選單垃圾項目）
DELETE FROM item_types 
WHERE category_id = (SELECT id FROM categories WHERE name = '設備')
  AND UPPER(TRIM(name)) NOT IN ('SERVER', 'SWITCH');

COMMIT;

-- 查詢驗證清理後的結果
SELECT id, name FROM item_types WHERE category_id = (SELECT id FROM categories WHERE name = '設備') ORDER BY name;
SELECT type, COUNT(*) as device_count FROM item_master WHERE category_id = (SELECT id FROM categories WHERE name = '設備') GROUP BY type;
