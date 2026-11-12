-- ============================================================================
-- ISO 27001「S-413-02 威脅情資自我檢核表」：每月上傳、檢核人線上簽核（見 server/isoThreatIntelRoutes.js）
-- ----------------------------------------------------------------------------
-- 檢核表由威脅情資檢核專案每月產生（Word 檔），任何登入帳號都能上傳（每月 1 日）。
-- period 是檢核日期所在的月份（例如 115/11/01 檢核 → 2026-11），一個月一份；
-- 原檔存在 file_data，下載時再把檢核人的簽名與簽核日期填進「檢核人（簽章）」那一行。
-- rows：解析出來的各列 [{ no, checkDate, source, item, applicable, update }]（頁面顯示用）。
--
-- 檢核人：任何登入帳號都能簽，一份只簽一次（signed_*）；替換檔案時簽名清除，要重簽。
-- ============================================================================

CREATE TABLE IF NOT EXISTS iso_threat_checklists (
  id SERIAL PRIMARY KEY,
  period CHAR(7) NOT NULL UNIQUE,
  check_date DATE NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_data BYTEA NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash CHAR(64) NOT NULL,
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_name VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  signed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  signed_by_name VARCHAR(255),
  signature_png TEXT,
  signed_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
