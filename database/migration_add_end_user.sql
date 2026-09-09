-- 新增 end_user 欄位至 assets 表
ALTER TABLE assets ADD COLUMN IF NOT EXISTS end_user VARCHAR(100);

-- 若已有存在於 custom_attributes 的 end_user 資料，回填至新欄位
UPDATE assets 
SET end_user = custom_attributes->>'end_user' 
WHERE custom_attributes->>'end_user' IS NOT NULL 
  AND (end_user IS NULL OR end_user = '');
