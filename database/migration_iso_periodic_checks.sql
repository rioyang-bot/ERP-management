-- ============================================================================
-- ISO 27001 定期檢查紀錄（見 server/isoPeriodicCheckRoutes.js）
-- ----------------------------------------------------------------------------
-- 雙周檢視一次的表單，每次檢查新增一筆，用 form_code 區分：
--   S-409-01 備份檢查紀錄表：防火牆、Core Switch 組態檔案備份
--   S-409-02 日誌審查紀錄表：防火牆、Core Switch 的 System Log／Event Log
--
-- results 是每個項目的結果：
--   [{ "key": "FIREWALL", "status": "NORMAL"|"ABNORMAL", "note": "異常說明", "lastBackup": "最後備份日（備份檢查才有）" }]
-- 檢查人員一律取自新增時登入的帳號（伺服器寫入），不能代填別人的名字。
-- ============================================================================

CREATE TABLE IF NOT EXISTS iso_periodic_checks (
  id SERIAL PRIMARY KEY,
  form_code VARCHAR(20) NOT NULL,
  check_date DATE NOT NULL,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewer_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_iso_periodic_checks_form_date ON iso_periodic_checks (form_code, check_date DESC, id DESC);
