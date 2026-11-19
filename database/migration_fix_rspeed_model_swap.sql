-- ============================================================================
-- METECH RSPEED 型號對調：當初建檔時 MERSP-S 與 MERSP-A 填反了
-- ----------------------------------------------------------------------------
--   規格 X8 的品項：MERSP-S -> MERSP-A
--   規格 X2 的品項：MERSP-A -> MERSP-S
--
-- 設備、進貨單、出貨單、月結庫存都是以 item_master.id 指向品項，不另存型號文字，
-- 所以只要改品項主檔這兩筆，設備列表與所有單據就一起顯示正確的型號。
-- 每台設備仍掛在原本那一筆品項上：規格、檢查表、照片、MAC 等都不動。
--
-- 一併對調、讓它們繼續跟著同一批設備：
--   * 出機檢查表主項目綁的型號（「RSpeed X8」原綁 MERSP-S、「RSpeed X2」原綁 MERSP-A），
--     不對調的話，X8 的設備會被套上 X2 的檢查表
--   * 各使用者設備列表的卡片排列（以「廠牌 - 類型 - 型號 - 規格」當鍵），不對調會失去原本的位置
-- 事件紀錄是歷史，不改；另外各寫一筆這次更正的紀錄。
--
-- 以「廠牌 + 型號 + 規格」比對，對調完再執行一次條件就不成立，不會又換回去（具冪等性）。
-- ============================================================================

DO $$
DECLARE
    v_x8 INTEGER;  -- 規格 X8，原本填 MERSP-S
    v_x2 INTEGER;  -- 規格 X2，原本填 MERSP-A
    v_x8_devices INTEGER := 0;
    v_x2_devices INTEGER := 0;
BEGIN
    SELECT id INTO v_x8 FROM item_master
     WHERE UPPER(TRIM(brand)) = 'METECH RSPEED' AND UPPER(TRIM(model)) = 'MERSP-S'
       AND UPPER(TRIM(COALESCE(specification, ''))) = 'X8';
    SELECT id INTO v_x2 FROM item_master
     WHERE UPPER(TRIM(brand)) = 'METECH RSPEED' AND UPPER(TRIM(model)) = 'MERSP-A'
       AND UPPER(TRIM(COALESCE(specification, ''))) = 'X2';

    IF v_x8 IS NULL AND v_x2 IS NULL THEN
        RAISE NOTICE 'METECH RSPEED 型號已是正確的（或沒有這兩個品項），略過。';
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_x8_devices FROM assets WHERE item_master_id = v_x8;
    SELECT COUNT(*) INTO v_x2_devices FROM assets WHERE item_master_id = v_x2;

    -- 品項主檔：同一個 UPDATE 依舊值判斷，兩筆同時對調
    UPDATE item_master
       SET model = CASE WHEN id = v_x8 THEN 'MERSP-A' ELSE 'MERSP-S' END,
           updated_at = CURRENT_TIMESTAMP
     WHERE id IN (v_x8, v_x2);

    -- 出機檢查表主項目：跟著同一批設備
    UPDATE checklist_groups
       SET model = CASE
                     WHEN UPPER(TRIM(model)) = 'MERSP-S' AND v_x8 IS NOT NULL THEN 'MERSP-A'
                     WHEN UPPER(TRIM(model)) = 'MERSP-A' AND v_x2 IS NOT NULL THEN 'MERSP-S'
                     ELSE model
                   END,
           updated_at = CURRENT_TIMESTAMP
     WHERE UPPER(TRIM(brand)) = 'METECH RSPEED' AND UPPER(TRIM(model)) IN ('MERSP-S', 'MERSP-A');

    -- 設備列表的卡片排列（鍵為「廠牌 - 類型 - 型號 - 規格」）；兩個鍵的規格不同，依序取代不會互相干擾
    UPDATE user_preferences
       SET value = (
             CASE WHEN v_x2 IS NOT NULL
                  THEN replace(
                         CASE WHEN v_x8 IS NOT NULL
                              THEN replace(value::text, ' - MERSP-S - X8"', ' - MERSP-A - X8"')
                              ELSE value::text END,
                         ' - MERSP-A - X2"', ' - MERSP-S - X2"')
                  ELSE replace(value::text, ' - MERSP-S - X8"', ' - MERSP-A - X8"')
             END)::jsonb,
           updated_at = CURRENT_TIMESTAMP
     WHERE value::text LIKE '%METECH RSPEED - % - MERSP-%';

    -- 事件紀錄：每個品項一筆更正紀錄
    IF v_x8 IS NOT NULL THEN
        INSERT INTO system_audit_logs (user_name, user_role, action_type, module, module_label, target_id, target_name, summary, details, ip_address)
        VALUES ('系統資料修正', 'SYSTEM', 'UPDATE', 'DEVICE', '設備管理', v_x8::text, 'METECH RSPEED MERSP-A (X8)',
                format('資料修正：METECH RSPEED 規格 X8 的型號：MERSP-S → MERSP-A（當初建檔時兩個型號填反；%s 台設備與進貨單、出貨單一併更正，出機檢查表「RSpeed X8」改綁 MERSP-A）', v_x8_devices),
                jsonb_build_object('itemMasterId', v_x8, 'specification', 'X8', 'devices', v_x8_devices,
                  'changes', jsonb_build_array(jsonb_build_object('field', 'model', 'label', '型號', 'from', 'MERSP-S', 'to', 'MERSP-A'))),
                'Migration');
    END IF;
    IF v_x2 IS NOT NULL THEN
        INSERT INTO system_audit_logs (user_name, user_role, action_type, module, module_label, target_id, target_name, summary, details, ip_address)
        VALUES ('系統資料修正', 'SYSTEM', 'UPDATE', 'DEVICE', '設備管理', v_x2::text, 'METECH RSPEED MERSP-S (X2)',
                format('資料修正：METECH RSPEED 規格 X2 的型號：MERSP-A → MERSP-S（當初建檔時兩個型號填反；%s 台設備與進貨單、出貨單一併更正，出機檢查表「RSpeed X2」改綁 MERSP-S）', v_x2_devices),
                jsonb_build_object('itemMasterId', v_x2, 'specification', 'X2', 'devices', v_x2_devices,
                  'changes', jsonb_build_array(jsonb_build_object('field', 'model', 'label', '型號', 'from', 'MERSP-A', 'to', 'MERSP-S'))),
                'Migration');
    END IF;

    RAISE NOTICE 'METECH RSPEED 型號已對調：X8 -> MERSP-A（% 台）、X2 -> MERSP-S（% 台）', v_x8_devices, v_x2_devices;
END $$;
