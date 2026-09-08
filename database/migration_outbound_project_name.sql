-- 遷移指令：為 outbound_requests 表新增專案名稱欄位 project_name
ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS project_name VARCHAR(100);
