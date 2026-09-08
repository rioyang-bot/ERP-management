BEGIN;

-- 1. 在 item_models 加入 brand_id 欄位（直屬於廠牌）
ALTER TABLE item_models ADD COLUMN IF NOT EXISTS brand_id INTEGER REFERENCES item_brands(id) ON DELETE CASCADE;

-- 2. 從歷史 item_types 回填 item_models.brand_id
UPDATE item_models m
SET brand_id = t.brand_id
FROM item_types t
WHERE m.type_id = t.id AND m.brand_id IS NULL AND t.brand_id IS NOT NULL;

-- 3. 解除硬體既有型號與舊 item_types 外鍵綁定，避免後續清理舊類型時誤刪型號主檔
UPDATE item_models 
SET type_id = NULL 
WHERE type_id IN (SELECT id FROM item_types WHERE category_id = (SELECT id FROM categories WHERE name = '硬體'));

-- 4. 放寬 item_types 的約束：取消 brand_id 限制，改為 (category_id, name) 唯一通用庫
ALTER TABLE item_types DROP CONSTRAINT IF EXISTS item_types_category_id_brand_id_name_key;
ALTER TABLE item_types ALTER COLUMN brand_id DROP NOT NULL;

DELETE FROM item_types a USING item_types b
WHERE a.id > b.id AND a.category_id = b.category_id AND LOWER(a.name) = LOWER(b.name);

ALTER TABLE item_types DROP CONSTRAINT IF EXISTS item_types_category_id_name_key;
ALTER TABLE item_types ADD CONSTRAINT item_types_category_id_name_key UNIQUE (category_id, name);

-- 5. 清除設備與硬體的舊預設類型（依需求由使用者自行於介面點選 + 新增）
DELETE FROM item_types WHERE category_id = (SELECT id FROM categories WHERE name = '設備');
DELETE FROM item_types WHERE category_id = (SELECT id FROM categories WHERE name = '硬體');

-- 6. 建立 item_models (brand_id, name) 唯一約束
DELETE FROM item_models a USING item_models b
WHERE a.id > b.id AND a.brand_id = b.brand_id AND LOWER(a.name) = LOWER(b.name) AND a.brand_id IS NOT NULL;

ALTER TABLE item_models DROP CONSTRAINT IF EXISTS item_models_brand_id_name_key;
ALTER TABLE item_models ADD CONSTRAINT item_models_brand_id_name_key UNIQUE (brand_id, name);

COMMIT;
