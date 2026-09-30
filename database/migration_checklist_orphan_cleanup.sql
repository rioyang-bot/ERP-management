-- ============================================================================
-- 出機檢查表：清理範本已刪除、設備上還留著的舊項目
-- ----------------------------------------------------------------------------
-- 先前刪除範本項目時，設備上已套用的同一項一律保留（source_item_id 變成 NULL）。
-- 結果是：
--   1. 範本刪掉的項目，設備上一直還在
--   2. 用同一個名稱重建範本項目時，同步看到同名舊列就跳過，
--      新的範本項目與它的說明永遠套不上去
--
-- 程式已改為「刪範本時一併清掉設備上沒有紀錄的那一項」，並在同步時接回同名舊列。
-- 這支腳本把既有資料整理成同樣的狀態：
--   步驟 1  同名舊列接回目前的範本項目（勾選、內容、照片都保留）
--   步驟 2  接不回去、而且沒有任何紀錄的主要檢查功能與拍照項目刪除
--
-- 只動主要檢查功能（MAIN）與拍照項目（PHOTO）：這兩種只會由範本同步產生，
-- 沒有來源就一定是範本刪掉後留下的。細項（DETAIL）可以逐台自訂，
-- 沒有來源不代表是舊項目，一律不動。
-- 有勾選、有內容或有照片的舊列不刪，設備上仍可自行移除。
--
-- 可重複執行：第二次執行時已經沒有符合條件的列。
-- ============================================================================

BEGIN;

-- 步驟 1：接回同名的範本項目（比對規則與 syncBrandChecklistToAssets 相同）
UPDATE asset_checklist_items x
SET source_item_id = t.item_id, description = t.description,
    sort_order = t.sort_order, updated_at = CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (a.id, UPPER(TRIM(g.name)), i.kind, UPPER(TRIM(i.name)))
           a.id AS asset_id, g.name AS group_name, i.kind, i.name, i.id AS item_id,
           i.description, COALESCE(i.sort_order, 0) AS sort_order
    FROM checklist_groups g
    JOIN checklist_items i ON i.group_id = g.id
                          AND (i.kind IN ('MAIN', 'PHOTO') OR COALESCE(i.auto_apply, FALSE))
    JOIN item_master m ON m.category_id = (SELECT id FROM categories WHERE name = '設備' LIMIT 1)
                      AND (
                        COALESCE(NULLIF(TRIM(g.brand), ''), '') = ''
                        OR (
                          UPPER(TRIM(COALESCE(m.brand, ''))) = UPPER(TRIM(g.brand))
                          AND (
                            COALESCE(NULLIF(TRIM(g.model), ''), '') = ''
                            OR UPPER(TRIM(COALESCE(m.model, ''))) = UPPER(TRIM(g.model))
                          )
                        )
                      )
    JOIN assets a ON a.item_master_id = m.id
    ORDER BY a.id, UPPER(TRIM(g.name)), i.kind, UPPER(TRIM(i.name)), i.id
) t
WHERE x.asset_id = t.asset_id
  AND x.source_item_id IS NULL
  AND x.kind = t.kind
  AND UPPER(TRIM(x.group_name)) = UPPER(TRIM(t.group_name))
  AND UPPER(TRIM(x.item_name)) = UPPER(TRIM(t.name));

-- 步驟 2：接不回去、也沒有任何紀錄的舊列
DELETE FROM asset_checklist_items a
WHERE a.source_item_id IS NULL
  AND a.kind IN ('MAIN', 'PHOTO')
  AND NOT COALESCE(a.is_checked, FALSE)
  AND NULLIF(TRIM(COALESCE(a.content, '')), '') IS NULL
  AND NOT EXISTS (SELECT 1 FROM asset_photos p WHERE p.checklist_item_id = a.id);

COMMIT;
