-- ============================================================================
-- 類型 / 廠牌 / 型號 主檔正規化與去重
-- ----------------------------------------------------------------------------
-- 背景：
--   1. item_types 的唯一鍵原為 UNIQUE (category_id, brand_id, name)，但新增類型
--      時並不會填入 brand_id。PostgreSQL 的唯一鍵中 NULL 永不相等，因此
--      「ON CONFLICT DO NOTHING」從未觸發，每次匯入都會新增重複列，
--      導致下拉選單出現大量重複選項。
--   2. 名稱未統一大小寫，Cisco / CISCO、NeoMux ACL / NeoMUX ACL 會被視為
--      不同項目，造成品項卡片分裂。
--
-- 本 migration：
--   a. 將三張主檔表與 item_master 的類型/廠牌/型號正規化（去頭尾空白、
--      連續空白收斂為單一空白、英文轉大寫）。
--   b. 合併正規化後重複的資料，並將外鍵指向保留列（保留 id 最小者）。
--   c. 重建正確的唯一鍵，讓 ON CONFLICT DO NOTHING 之後真的生效。
--
-- 具冪等性，可重複執行。請在有資料庫備份的前提下執行。
-- ============================================================================

BEGIN;

-- 正規化函式：與前端 src/utils/normalizeMasterData.js 及
-- database/queries.js 的 UPPER(TRIM(REGEXP_REPLACE(...))) 行為一致。
CREATE OR REPLACE FUNCTION norm_master_name(v TEXT) RETURNS TEXT AS $$
  SELECT UPPER(TRIM(REGEXP_REPLACE(COALESCE(v, ''), '[[:space:]]+', ' ', 'g')));
$$ LANGUAGE SQL IMMUTABLE;

-- ---------------------------------------------------------------------------
-- 步驟 1：先移除唯一鍵，避免正規化過程中途違反約束
-- ---------------------------------------------------------------------------
ALTER TABLE item_brands DROP CONSTRAINT IF EXISTS item_brands_category_id_name_key;
ALTER TABLE item_types  DROP CONSTRAINT IF EXISTS item_types_category_id_brand_id_name_key;
ALTER TABLE item_types  DROP CONSTRAINT IF EXISTS item_types_category_id_name_key;
ALTER TABLE item_models DROP CONSTRAINT IF EXISTS item_models_brand_id_name_key;
ALTER TABLE item_models DROP CONSTRAINT IF EXISTS item_models_type_id_name_key;

-- ---------------------------------------------------------------------------
-- 步驟 2：正規化名稱
-- ---------------------------------------------------------------------------
UPDATE item_brands SET name = norm_master_name(name) WHERE name IS DISTINCT FROM norm_master_name(name);
UPDATE item_types  SET name = norm_master_name(name) WHERE name IS DISTINCT FROM norm_master_name(name);
UPDATE item_models SET name = norm_master_name(name) WHERE name IS DISTINCT FROM norm_master_name(name);

-- item_master 的類型/廠牌/型號（規格 specification 不在正規化範圍）
UPDATE item_master
   SET brand = norm_master_name(brand),
       type  = norm_master_name(type),
       model = norm_master_name(model)
 WHERE brand IS DISTINCT FROM norm_master_name(brand)
    OR type  IS DISTINCT FROM norm_master_name(type)
    OR model IS DISTINCT FROM norm_master_name(model);

-- ---------------------------------------------------------------------------
-- 步驟 3：合併重複的廠牌，外鍵改指向保留列
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE brand_keep ON COMMIT DROP AS
  SELECT id AS dup_id,
         MIN(id) OVER (PARTITION BY category_id, name) AS keep_id
    FROM item_brands;

UPDATE item_types t SET brand_id = k.keep_id
  FROM brand_keep k WHERE t.brand_id = k.dup_id AND k.dup_id <> k.keep_id;

UPDATE item_models m SET brand_id = k.keep_id
  FROM brand_keep k WHERE m.brand_id = k.dup_id AND k.dup_id <> k.keep_id;

DELETE FROM item_brands b USING brand_keep k
 WHERE b.id = k.dup_id AND k.dup_id <> k.keep_id;

-- ---------------------------------------------------------------------------
-- 步驟 4：合併重複的類型，外鍵改指向保留列
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE type_keep ON COMMIT DROP AS
  SELECT id AS dup_id,
         MIN(id) OVER (PARTITION BY category_id, name) AS keep_id
    FROM item_types;

UPDATE item_models m SET type_id = k.keep_id
  FROM type_keep k WHERE m.type_id = k.dup_id AND k.dup_id <> k.keep_id;

DELETE FROM item_types t USING type_keep k
 WHERE t.id = k.dup_id AND k.dup_id <> k.keep_id;

-- ---------------------------------------------------------------------------
-- 步驟 5：合併重複的型號（型號隸屬於廠牌）
-- ---------------------------------------------------------------------------
DELETE FROM item_models m
 USING (SELECT id AS dup_id, MIN(id) OVER (PARTITION BY brand_id, name) AS keep_id
          FROM item_models) k
 WHERE m.id = k.dup_id AND k.dup_id <> k.keep_id;

-- ---------------------------------------------------------------------------
-- 步驟 6：重建正確的唯一鍵
--   item_types 改為 (category_id, name)：類型是通用庫，不綁定廠牌，
--   這樣 insertDeviceType 的 ON CONFLICT DO NOTHING 才會真正生效。
--   約束名稱須與 queries.js 的 ON CONFLICT ON CONSTRAINT 一致。
-- ---------------------------------------------------------------------------
ALTER TABLE item_brands ADD CONSTRAINT item_brands_category_id_name_key UNIQUE (category_id, name);
ALTER TABLE item_types  ADD CONSTRAINT item_types_category_id_name_key  UNIQUE (category_id, name);
ALTER TABLE item_models ADD CONSTRAINT item_models_brand_id_name_key    UNIQUE (brand_id, name);

COMMIT;
