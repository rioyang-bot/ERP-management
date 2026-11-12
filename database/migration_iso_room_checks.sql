-- ============================================================================
-- ISO 27001「S-408-03 機房檢查表」：每週檢查一次（見 server/isoRoomCheckRoutes.js）
-- ----------------------------------------------------------------------------
-- 每次檢查一筆：日期時間、溫度、溼度，監視設備／門禁管理／設備管理／機房環境
-- 勾正常或異常（results：{ CCTV: 'NORMAL' | 'ABNORMAL', ... }），有異常寫說明與處理方式。
-- period（YYYY-MM）與 week_no（1～7 日第 1 周…29 日以後第 5 周）由伺服器依日期算，
-- 同一個月的同一周只能有一筆。
-- 填寫人取自登入帳號，不印在表單上。
--
-- 每月由「檢查人」「單位主管」線上簽核（iso_form_signatures），簽核角色多一個 INSPECTOR（檢查人）。
-- ============================================================================

CREATE TABLE IF NOT EXISTS iso_room_checks (
  id SERIAL PRIMARY KEY,
  check_date DATE NOT NULL,
  check_time TIME NOT NULL,
  period CHAR(7) NOT NULL,
  week_no SMALLINT NOT NULL CHECK (week_no BETWEEN 1 AND 5),
  temperature NUMERIC(4, 1) NOT NULL,
  humidity NUMERIC(4, 1) NOT NULL,
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  abnormal_note TEXT NOT NULL DEFAULT '',
  abnormal_action TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (period, week_no)
);

CREATE INDEX IF NOT EXISTS idx_iso_room_checks_date ON iso_room_checks (check_date DESC, check_time DESC, id DESC);

-- 簽核角色：機房管理員、權責主管（設備攜出入單）＋ 檢查人（機房檢查表；單位主管沿用 SUPERVISOR）
ALTER TABLE iso_form_signatures DROP CONSTRAINT IF EXISTS iso_form_signatures_signer_role_check;
ALTER TABLE iso_form_signatures ADD CONSTRAINT iso_form_signatures_signer_role_check
  CHECK (signer_role IN ('ROOM_ADMIN', 'SUPERVISOR', 'INSPECTOR'));
