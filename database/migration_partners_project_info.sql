-- 遷移指令：為 partners 表新增專案資訊欄位 project_info
ALTER TABLE partners ADD COLUMN IF NOT EXISTS project_info TEXT;
