-- ============================================================================
-- 耗材品項主檔的唯一鍵：廠牌 + 類型 + 型號
-- ----------------------------------------------------------------------------
-- 2026-09-29 有六筆耗材從耗材列表誤建，其中四筆讓同一個品項多出一筆主檔。
-- 應用層其實有擋重複，但它比對的是「廠牌＋類型＋型號＋備註」——
-- 備註是自由文字（那幾筆既有資料的內容根本就是廠牌名重複一次），
-- 只要備註不同就被當成不同品項放行。
--
-- 實測：78 筆耗材主檔，把備註排除在識別鍵外之後，0 組相撞 ——
-- 代表備註對「這是不是同一個品項」毫無貢獻。
--
-- 只靠應用層檢查不夠：匯入、腳本或任何新寫的程式繞過那段就會再生出重複。
-- 這裡在資料庫層補上唯一索引，任何路徑都擋得住。
--
-- 只限耗材：設備與硬體的 specification 是真的規格（26C / 256G、2 Port），
-- 有識別意義。實測若套用到全部類別，設備會有 2 組衝突。
--
-- 索引條件不能寫子查詢（必須 IMMUTABLE），因此用 DO 區塊在套用當下
-- 把耗材的 category_id 寫死進去。
--
-- 具冪等性，可重複執行。
-- ============================================================================

DO $$
DECLARE
  consumable_id INTEGER;
  dup_count INTEGER;
  sample TEXT;
BEGIN
  SELECT id INTO consumable_id FROM categories WHERE name = '耗材';
  IF consumable_id IS NULL THEN
    RAISE NOTICE '找不到「耗材」類別，略過此索引';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_item_master_consumable_unique') THEN
    RAISE NOTICE '索引已存在，略過';
    RETURN;
  END IF;

  -- 先檢查有沒有既有的衝突。直接建索引失敗的話訊息很難懂，
  -- 這裡把實際撞在一起的品項印出來，才知道要先合併哪幾筆。
  SELECT COUNT(*), STRING_AGG(k, '；')
    INTO dup_count, sample
    FROM (
      SELECT UPPER(TRIM(COALESCE(brand, ''))) || ' / ' ||
             UPPER(TRIM(COALESCE(type, ''))) || ' / ' ||
             UPPER(TRIM(COALESCE(model, ''))) || ' ×' || COUNT(*) AS k
        FROM item_master
       WHERE category_id = consumable_id
       GROUP BY UPPER(TRIM(COALESCE(brand, ''))),
                UPPER(TRIM(COALESCE(type, ''))),
                UPPER(TRIM(COALESCE(model, '')))
      HAVING COUNT(*) > 1
    ) d;

  IF dup_count > 0 THEN
    RAISE EXCEPTION '耗材主檔已有 % 組重複（%），請先合併或刪除再套用此索引。'
                    '可用 scripts/delete-consumable-masters.mjs 檢查與刪除誤建的那一筆。',
                    dup_count, sample;
  END IF;

  EXECUTE format(
    'CREATE UNIQUE INDEX idx_item_master_consumable_unique ON item_master ' ||
    '(UPPER(TRIM(COALESCE(brand, ''''))), UPPER(TRIM(COALESCE(type, ''''))), UPPER(TRIM(COALESCE(model, '''')))) ' ||
    'WHERE category_id = %s', consumable_id);

  RAISE NOTICE '已建立耗材主檔唯一索引（廠牌＋類型＋型號）';
END $$;

COMMENT ON COLUMN item_master.specification IS
  '規格或備註。耗材：僅為備註，不參與「是否為同一品項」的判斷；設備／硬體：是真的規格，有識別意義';
