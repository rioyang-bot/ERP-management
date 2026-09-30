-- ============================================================================
-- 設備主機照片 (Asset Photos)
-- ----------------------------------------------------------------------------
-- 出機檢查表上傳的主機照片。照片是掛在「某一台設備」而不是型號上 ——
-- 同型號的兩台機器，機況、配置、外觀都不會一樣，之後要據以開驗收單的
-- 也是那一台的照片。
--
-- 檔案本身放在 uploads/，這裡只記檔名與原始檔名：
--   file_name     伺服器上的實際檔名（上傳時會加時間戳避免覆蓋）
--   original_name 使用者原本的檔名，下載時用它當檔名，不然存下來是一串亂碼
--
-- asset_id 為 ON DELETE CASCADE：設備刪掉時這些紀錄跟著走。
-- 磁碟上的檔案不會一起刪 —— 誤刪設備時檔案還在，是刻意保留的餘地。
--
-- 具冪等性，可重複執行。
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_photos (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    file_name VARCHAR(300) NOT NULL,
    original_name VARCHAR(300) NOT NULL,
    mime_type VARCHAR(100),
    file_size BIGINT,
    -- 上傳者離職、帳號被刪掉時，照片與當初記下的姓名都要留著
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_by_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_photos_asset ON asset_photos (asset_id, id);
