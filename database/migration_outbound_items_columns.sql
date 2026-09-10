-- 補齊出庫申請明細 (outbound_items) 與出庫單 (outbound_requests) 所需欄位
ALTER TABLE outbound_items ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE outbound_items ADD COLUMN IF NOT EXISTS purpose VARCHAR(255) DEFAULT '運作測試';

ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS project_name VARCHAR(100);
ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS signed_doc_url TEXT;
ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS signed_doc_name TEXT;
