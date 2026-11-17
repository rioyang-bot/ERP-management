-- ============================================================================
-- 個人簽名檔記下檔名（事件紀錄用，見 server/isoSignatureRoutes.js）
-- ----------------------------------------------------------------------------
-- 事件紀錄要寫得出「簽名檔：舊檔名 → 新檔名」。先前只存圖片（data: 網址），
-- 沒有檔名可記。上傳的記原始檔名，手寫的記「手寫簽名」。
-- 既有的簽名檔沒有檔名（NULL），第一次更換時變更前顯示空白。
--
-- 公司範本的 LOGO 檔名存在 system_configs 的 company_presets 文件裡（logoName），
-- 不需要改資料表，見 src/utils/companyPresets.js。
-- ============================================================================

BEGIN;

ALTER TABLE user_signatures ADD COLUMN IF NOT EXISTS signature_name VARCHAR(255);

COMMIT;
