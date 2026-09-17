-- ============================================================================
-- 出機檢查表 (Pre-delivery Checklist)
-- ----------------------------------------------------------------------------
-- 三張表分成「範本」與「設備實際套用的內容」兩塊：
--
--   checklist_groups  主項目，例如「BLACKCORE 出機檢查」。可綁定廠牌，
--                     設備套用時預設帶出自己廠牌的主項目。
--   checklist_items   主項目底下的兩組平行清單：
--                     MAIN   主要檢查功能（套用主項目時整組帶入）
--                     DETAIL 細項（由每台設備各自挑選）
--   asset_checklist_items
--                     設備實際套用到的項目。名稱以「快照」方式存下來，
--                     不是指向範本的外鍵 —— 範本日後被刪掉或改名，
--                     已經套用出去的檢查表仍須維持當初的內容。
--
-- 具冪等性，可重複執行。
-- ============================================================================

CREATE TABLE IF NOT EXISTS checklist_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    -- 廠牌取自設備列表上既有的廠牌；留空代表不分廠牌的通用主項目
    brand VARCHAR(100),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 同一個廠牌底下不允許重複的主項目名稱。
-- brand 為 NULL 時 UNIQUE 不會擋（NULL 彼此不相等），因此以 COALESCE 正規化後建索引。
CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_groups_brand_name
    ON checklist_groups (COALESCE(UPPER(TRIM(brand)), ''), UPPER(TRIM(name)));

CREATE TABLE IF NOT EXISTS checklist_items (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES checklist_groups(id) ON DELETE CASCADE,
    -- MAIN = 主要檢查功能、DETAIL = 細項
    kind VARCHAR(10) NOT NULL DEFAULT 'MAIN',
    name VARCHAR(300) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_checklist_item_kind CHECK (kind IN ('MAIN', 'DETAIL'))
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_group ON checklist_items (group_id, kind, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_items_unique
    ON checklist_items (group_id, kind, UPPER(TRIM(name)));

CREATE TABLE IF NOT EXISTS asset_checklist_items (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    -- 以下三欄是套用當下的快照，範本被刪除也不會影響已套用的內容
    group_name VARCHAR(200) NOT NULL,
    kind VARCHAR(10) NOT NULL DEFAULT 'MAIN',
    item_name VARCHAR(300) NOT NULL,
    -- 僅供追溯來源；範本刪除時設為 NULL，不連帶刪除這筆
    source_item_id INTEGER REFERENCES checklist_items(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    is_checked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_asset_checklist_kind CHECK (kind IN ('MAIN', 'DETAIL'))
);

CREATE INDEX IF NOT EXISTS idx_asset_checklist_asset ON asset_checklist_items (asset_id, sort_order);

-- 同一台設備、同一個主項目底下不重複套用同一個項目
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_checklist_unique
    ON asset_checklist_items (asset_id, UPPER(TRIM(group_name)), kind, UPPER(TRIM(item_name)));
