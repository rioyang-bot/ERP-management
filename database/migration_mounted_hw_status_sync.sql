-- ============================================================================
-- 資料修正：搭載硬體的狀態跟著所掛的設備
-- ----------------------------------------------------------------------------
-- 先前只有「設備列表手動改狀態」會連動掛在上面的硬體。確認出貨、借出／歸還、
-- 維修、換貨，以及設備出貨後才掛上去的硬體都不會，結果出現
-- 「設備已出貨、硬體還在庫」「設備在庫、硬體已出貨」等不一致，
-- 硬體的在庫數量也因此灌水。
--
-- 程式已改為每次設備狀態變動都同步（syncMountedHardwareToDevice），
-- 這支把既有的不一致一次對齊：掛在設備上的硬體，狀態設為與設備相同。
--   - 只對齊在庫／已出貨／借出／維修中這四種設備狀態
--   - 報廢、待報廢的硬體不動
--
-- 重複執行沒有副作用（已經一致的不會再改）。
-- ============================================================================

BEGIN;

UPDATE assets h
SET status = d.status, updated_at = CURRENT_TIMESTAMP
FROM assets d
WHERE d.sn IS NOT NULL AND TRIM(d.sn) <> ''
  AND TRIM(LOWER(h.custom_attributes->>'server_sn')) = TRIM(LOWER(d.sn))
  AND d.status IN ('ACTIVE', 'SHIPPED', 'LENT', 'REPAIRING')
  AND COALESCE(h.status, '') NOT IN ('SCRAPPED', 'PENDING_SCRAP')
  AND h.status IS DISTINCT FROM d.status;

COMMIT;
