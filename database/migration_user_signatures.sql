-- ============================================================================
-- 個人簽名檔（ISO 表單線上簽核用，見 server/isoSignatureRoutes.js）
-- ----------------------------------------------------------------------------
-- 每個帳號一筆，自己上傳或手寫存下；簽核時直接用自己帳號的簽名檔。
-- 只有本人能讀寫（伺服器依連線階段判定），帳號刪除時一併刪除。
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_signatures (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  signature_png TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
