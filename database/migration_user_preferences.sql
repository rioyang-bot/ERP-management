-- ============================================================================
-- 使用者個人偏好設定
-- ----------------------------------------------------------------------------
-- 既有的 system_settings 是全域共用的，一個人改動會影響所有人。
-- 「自訂顯示欄位」這類設定必須每個使用者各自保存，因此另建一張表。
--
-- 以 user_id 為範圍，使用者換裝置登入仍會沿用自己的設定
-- （放在瀏覽器 localStorage 則做不到，且同一台電腦多人共用時會互相覆蓋）。
--
-- 具冪等性，可重複執行。
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pref_key   VARCHAR(100) NOT NULL,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, pref_key)
);

COMMENT ON TABLE user_preferences IS '使用者個人偏好設定（例如各列表的顯示欄位）';

COMMIT;
