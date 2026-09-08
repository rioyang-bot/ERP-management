BEGIN;

-- ==========================================
-- ⚠️ 移除全系統事件紀錄 (system_audit_logs)
-- 將清空所有操作日誌與審計軌跡，並重設序號
-- ==========================================

TRUNCATE TABLE system_audit_logs RESTART IDENTITY;

COMMIT;
