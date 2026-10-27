-- ============================================================================
-- ISO 表單線上簽核（目前用在 S-408-02 設備攜出入單，見 server/isoSignatureRoutes.js）
-- ----------------------------------------------------------------------------
-- 每張表單、每個月份、每個簽核角色（機房管理員／權責主管）一筆。
-- 簽名是手寫的 PNG（data: 網址）；content_hash 記簽名當下表單內容的雜湊，
-- 之後內容不同就視為「簽核後資料有異動」，匯出時不帶這個簽名，要重新簽。
-- 撤銷＝刪除這一筆；誰簽、誰撤銷都寫在事件紀錄裡。
-- ============================================================================

CREATE TABLE IF NOT EXISTS iso_form_signatures (
  id SERIAL PRIMARY KEY,
  form_code VARCHAR(20) NOT NULL,
  period CHAR(7) NOT NULL,
  signer_role VARCHAR(20) NOT NULL CHECK (signer_role IN ('ROOM_ADMIN', 'SUPERVISOR')),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(255) NOT NULL,
  signature_png TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  signed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (form_code, period, signer_role)
);
