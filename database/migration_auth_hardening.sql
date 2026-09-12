-- ============================================================================
-- 登入安全強化：連線階段（Session）資料表
-- ----------------------------------------------------------------------------
-- 背景：
--   原本 /api/auth/login 只收帳號，並把 password_hash 回傳給瀏覽器，
--   由前端比對密碼。這代表只要知道帳號就能取得雜湊帶回去離線破解，
--   且比對在前端進行，改網頁即可繞過。此外所有 /api 端點皆無身分驗證，
--   同網段任何人都能直接讀寫資料庫。
--
--   改為：密碼一律在伺服器端驗證，成功後發給一組隨機連線代碼（token），
--   後續每個 API 請求都必須附上該代碼，由伺服器查驗。
--
-- 具冪等性，可重複執行。
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS user_sessions (
    token       VARCHAR(128) PRIMARY KEY,          -- 隨機產生，不含任何使用者資訊
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user    ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions (expires_at);

-- 記錄密碼雜湊演算法，供舊資料（未加鹽 SHA-256）漸進式升級為 bcrypt。
-- 使用者下次成功登入時會自動改寫為 bcrypt，無須全體重設密碼。
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_algo VARCHAR(20) NOT NULL DEFAULT 'sha256';

-- 既有資料若已是 bcrypt 格式（$2a$ / $2b$ / $2y$ 開頭）則標記為 bcrypt
UPDATE users SET password_algo = 'bcrypt'
 WHERE password_hash LIKE '$2%' AND password_algo <> 'bcrypt';

COMMIT;
