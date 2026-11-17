-- ============================================================================
-- 出機檢查表：MAC Address Information（LDA FIREWALL 等設備）
-- ----------------------------------------------------------------------------
-- 有些設備出貨要附一頁 MAC 位址表：Pair（P1,P2、P5,P6 …）、Server Port、
-- Exchange Port，最後一列是 MGT(LAN,IPMI)。各埠的 MAC 都從 P1 往上加，
-- 因此每台設備只存 P1；其餘在畫面與輸出時即時算出，不會前後不一致。
-- MGT 的 LAN、IPMI 由管理者自行填寫，可以留空。
--
--   checklist_groups.mac_table  主項目勾選「需要 MAC 表」，符合這個主項目的設備
--                               在出機檢查表會多一個 MAC 表區塊
--   asset_mac_info              每台設備一筆：P1 與 MGT 兩個 MAC（一律小寫、冒號分隔）
--
-- 第一次套用時把既有的「LDA · FIREWALL」主項目勾起來；之後由使用者在範本頁自行調整。
-- 具冪等性，可重複執行。
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_groups' AND column_name = 'mac_table'
  ) THEN
    ALTER TABLE checklist_groups ADD COLUMN mac_table BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE checklist_groups SET mac_table = TRUE
    WHERE UPPER(TRIM(COALESCE(brand, ''))) = 'LDA' AND UPPER(TRIM(COALESCE(model, ''))) = 'FIREWALL';
  END IF;
END $$;

COMMENT ON COLUMN checklist_groups.mac_table IS '符合這個主項目的設備需要 MAC Address Information 表';

CREATE TABLE IF NOT EXISTS asset_mac_info (
    asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
    base_mac VARCHAR(17),
    mgt_lan_mac VARCHAR(17),
    mgt_ipmi_mac VARCHAR(17),
    updated_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE asset_mac_info IS '設備的 MAC Address Information：只存 P1，其餘各埠由 P1 往上加算出';
COMMENT ON COLUMN asset_mac_info.base_mac IS 'P1 的 MAC（小寫、冒號分隔）';
COMMENT ON COLUMN asset_mac_info.mgt_lan_mac IS 'MGT LAN 的 MAC，管理者自行填寫';
COMMENT ON COLUMN asset_mac_info.mgt_ipmi_mac IS 'MGT IPMI 的 MAC，管理者自行填寫';
