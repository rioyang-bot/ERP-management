-- ============================================================================
-- 資料更正：RMA-20261022-01 以庫存設備換貨的出貨日選錯（10/29 → 10/22）
-- ----------------------------------------------------------------------------
-- 2026-10-27 以庫存設備換貨結案時，出貨日誤選 2026-10-29，應為 2026-10-22。
-- 一併更正（客戶、序號都從資料庫查出，不寫死在腳本裡）：
--   - 自動建立的出貨單：出貨日，單號 DN-20261029-01 → DN-20261022-01
--     （10/22 若已有出貨單，依序取下一個號碼）
--   - 維修單：完工日、連結的出貨單號、維修結果裡寫的單號
--   - 出貨單上的設備與搭載硬體：出貨日
--   - 新舊兩台設備記的換貨日
-- 過去的事件紀錄保留原樣不改寫，另外補一筆更正紀錄（維修單、出貨單、每支序號各一筆）。
--
-- 只在資料還是「10/29、DN-20261029-01」時才動作，重複執行或資料已被改過都不會再改。
-- ============================================================================

DO $$
DECLARE
  v_old_no CONSTANT TEXT := 'DN-20261029-01';
  v_wrong  CONSTANT DATE := DATE '2026-10-29';
  v_right  CONSTANT DATE := DATE '2026-10-22';
  v_dn_id  INTEGER;
  v_ro_id  INTEGER;
  v_new_no TEXT;
  v_seq    INTEGER;
  v_sns    TEXT[];
  v_cust   TEXT;
  v_old_sn TEXT;
  v_new_sn TEXT;
  r        RECORD;
BEGIN
  SELECT id INTO v_dn_id FROM outbound_requests
  WHERE request_no = v_old_no AND shipping_date = v_wrong;

  SELECT id, customer_name INTO v_ro_id, v_cust FROM repair_orders
  WHERE repair_no = 'RMA-20261022-01' AND swap_dn_no = v_old_no;

  -- 換貨的新舊兩台設備（從維修單上的設備取得）
  SELECT sn, replacement_sn INTO v_old_sn, v_new_sn FROM repair_items
  WHERE repair_id = v_ro_id AND replacement_sn IS NOT NULL
  ORDER BY id LIMIT 1;

  IF v_dn_id IS NULL OR v_ro_id IS NULL THEN
    RAISE NOTICE 'RMA-20261022-01 / % 不是待更正的狀態，略過', v_old_no;
    RETURN;
  END IF;

  -- 10/22 的下一個出貨單號
  SELECT COALESCE(MAX(NULLIF(regexp_replace(request_no, '^DN-20261022-', ''), '')::INTEGER), 0) + 1
  INTO v_seq
  FROM outbound_requests
  WHERE request_no ~ '^DN-20261022-[0-9]+$';
  v_new_no := 'DN-20261022-' || lpad(v_seq::TEXT, 2, '0');

  -- 出貨單上的序號（設備與搭載硬體）
  SELECT array_agg(DISTINCT sn) INTO v_sns
  FROM outbound_items
  WHERE request_id = v_dn_id AND sn IS NOT NULL AND TRIM(sn) <> '';

  UPDATE outbound_requests
  SET request_no = v_new_no, shipping_date = v_right
  WHERE id = v_dn_id;

  UPDATE repair_orders
  SET completion_date = v_right,
      swap_dn_no = v_new_no,
      results = replace(results, v_old_no, v_new_no),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = v_ro_id;

  -- 設備與硬體：只改還是 10/29 的那幾支，之後另外出貨過的不動
  FOR r IN
    SELECT a.sn,
           CASE WHEN a.sn = v_new_sn THEN 'DEVICE' ELSE 'HARDWARE' END AS module
    FROM assets a
    WHERE a.sn = ANY(v_sns) AND a.shipping_date = v_wrong
  LOOP
    UPDATE assets SET shipping_date = v_right, updated_at = CURRENT_TIMESTAMP WHERE sn = r.sn;
    INSERT INTO system_audit_logs (user_name, user_role, action_type, module, module_label, target_id, target_name, summary, details, ip_address)
    VALUES (
      '系統更正', 'SYSTEM', 'UPDATE', r.module,
      CASE WHEN r.module = 'DEVICE' THEN '設備管理' ELSE '硬體零組件' END,
      r.sn, r.sn,
      '更正出貨日 2026-10-29 → 2026-10-22（維修單 [RMA-20261022-01] 以庫存設備換貨，出貨單 [' || v_old_no || '] 改為 [' || v_new_no || ']）',
      jsonb_build_object('repairNo', 'RMA-20261022-01', 'dnNo', v_new_no, 'oldDnNo', v_old_no,
                         'field', 'shipping_date', 'before', '2026-10-29', 'after', '2026-10-22', 'correction', true),
      'migration'
    );
  END LOOP;

  -- 新舊兩台設備記的換貨日
  UPDATE assets
  SET custom_attributes = jsonb_set(custom_attributes, '{swap_date}', to_jsonb('2026-10-22'::TEXT)),
      updated_at = CURRENT_TIMESTAMP
  WHERE sn IN (v_old_sn, v_new_sn)
    AND custom_attributes->>'swap_repair_no' = 'RMA-20261022-01'
    AND custom_attributes->>'swap_date' = '2026-10-29';

  INSERT INTO system_audit_logs (user_name, user_role, action_type, module, module_label, target_id, target_name, summary, details, ip_address)
  VALUES
  (
    '系統更正', 'SYSTEM', 'UPDATE', 'REPAIR', '維修管理',
    'RMA-20261022-01', v_cust,
    '更正維修單 [RMA-20261022-01] 以庫存設備換貨的出貨日：完工日 2026-10-29 → 2026-10-22，出貨單 [' || v_old_no || '] 改為 [' || v_new_no || ']',
    jsonb_build_object('repairNo', 'RMA-20261022-01', 'dnNo', v_new_no, 'oldDnNo', v_old_no,
                       'field', 'completion_date', 'before', '2026-10-29', 'after', '2026-10-22', 'correction', true),
    'migration'
  ),
  (
    '系統更正', 'SYSTEM', 'UPDATE', 'OUTBOUND', '出貨單據',
    v_new_no, v_cust,
    '更正出貨單 [' || v_old_no || '] 的出貨日 2026-10-29 → 2026-10-22，單號改為 [' || v_new_no || ']（維修單 [RMA-20261022-01] 以庫存設備換貨）',
    jsonb_build_object('repairNo', 'RMA-20261022-01', 'dnNo', v_new_no, 'oldDnNo', v_old_no,
                       'field', 'shipping_date', 'before', '2026-10-29', 'after', '2026-10-22',
                       'sns', to_jsonb(v_sns), 'correction', true),
    'migration'
  );

  RAISE NOTICE '已更正 RMA-20261022-01：出貨單 % → %，日期 2026-10-22', v_old_no, v_new_no;
END $$;
