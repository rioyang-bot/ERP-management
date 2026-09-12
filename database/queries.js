export const queries = {
  // AssetList.jsx
  fetchAssetsList: `SELECT a.*, a.id as id, i.id as item_master_id, i.specification, i.type, i.brand, i.model, i.unit, c.name as category_name,
      COALESCE(a.custom_attributes->>'contact_person', p.contact_person) as partner_contact,
      COALESCE(a.custom_attributes->>'contact_phone', p.phone) as partner_phone,
      (SELECT json_agg(json_build_object('brand', comp.brand, 'model', comp.model, 'sn', comp.sn)) 
       FROM (
         SELECT COALESCE(hi.brand, '') as brand, COALESCE(hi.model, '') as model, ha.sn
         FROM assets ha 
         LEFT JOIN item_master hi ON ha.item_master_id = hi.id 
         WHERE ha.custom_attributes->>'server_sn' IS NOT NULL AND ha.custom_attributes->>'server_sn' != '' 
           AND a.sn IS NOT NULL AND a.sn != ''
           AND TRIM(LOWER(ha.custom_attributes->>'server_sn')) = TRIM(LOWER(a.sn))
         UNION
         SELECT '' as brand, '' as model, TRIM(elem) as sn
         FROM regexp_split_to_table(COALESCE(a.custom_attributes->>'mounted_hw_sns', ''), '[,，\\s\\n]+') elem
         WHERE TRIM(elem) != ''
           AND NOT EXISTS (
             SELECT 1 FROM assets ex 
             WHERE ex.custom_attributes->>'server_sn' IS NOT NULL 
               AND a.sn IS NOT NULL AND a.sn != ''
               AND TRIM(LOWER(ex.custom_attributes->>'server_sn')) = TRIM(LOWER(a.sn))
               AND TRIM(LOWER(ex.sn)) = TRIM(LOWER(elem))
           )
       ) comp) as components,
      (SELECT json_agg(json_build_object('specification', im.specification, 'brand', im.brand, 'model', im.model, 'quantity', la.sum_qty))
       FROM (SELECT item_master_id, asset_id, SUM(quantity) as sum_qty FROM item_lab_assignments GROUP BY item_master_id, asset_id) la 
       JOIN item_master im ON la.item_master_id = im.id 
       WHERE la.asset_id = a.id AND la.sum_qty > 0) as lab_consumables
      FROM assets a 
      JOIN item_master i ON a.item_master_id = i.id 
      LEFT JOIN categories c ON i.category_id = c.id 
      LEFT JOIN partners p ON a.client = p.name AND (
        (a.custom_attributes->>'contact_person' IS NOT NULL AND p.contact_person = a.custom_attributes->>'contact_person') OR
        (a.custom_attributes->>'contact_person' IS NULL AND p.id = (
             SELECT MIN(id) FROM partners WHERE name = a.client
        ))
      )
      WHERE c.name = '設備' ORDER BY a.id DESC`,
  fetchAssetsListByBrand: `SELECT a.*, a.id as id, i.id as item_master_id, i.specification, i.type, i.brand, i.model, i.unit, c.name as category_name,
      COALESCE(a.custom_attributes->>'contact_person', p.contact_person) as partner_contact,
      COALESCE(a.custom_attributes->>'contact_phone', p.phone) as partner_phone,
      (SELECT json_agg(json_build_object('brand', comp.brand, 'model', comp.model, 'sn', comp.sn)) 
       FROM (
         SELECT COALESCE(hi.brand, '') as brand, COALESCE(hi.model, '') as model, ha.sn
         FROM assets ha 
         LEFT JOIN item_master hi ON ha.item_master_id = hi.id 
         WHERE ha.custom_attributes->>'server_sn' IS NOT NULL AND ha.custom_attributes->>'server_sn' != '' 
           AND a.sn IS NOT NULL AND a.sn != ''
           AND TRIM(LOWER(ha.custom_attributes->>'server_sn')) = TRIM(LOWER(a.sn))
         UNION
         SELECT '' as brand, '' as model, TRIM(elem) as sn
         FROM regexp_split_to_table(COALESCE(a.custom_attributes->>'mounted_hw_sns', ''), '[,，\\s\\n]+') elem
         WHERE TRIM(elem) != ''
           AND NOT EXISTS (
             SELECT 1 FROM assets ex 
             WHERE ex.custom_attributes->>'server_sn' IS NOT NULL 
               AND a.sn IS NOT NULL AND a.sn != ''
               AND TRIM(LOWER(ex.custom_attributes->>'server_sn')) = TRIM(LOWER(a.sn))
               AND TRIM(LOWER(ex.sn)) = TRIM(LOWER(elem))
           )
       ) comp) as components,
      (SELECT json_agg(json_build_object('specification', im.specification, 'brand', im.brand, 'model', im.model, 'quantity', la.sum_qty))
       FROM (SELECT item_master_id, asset_id, SUM(quantity) as sum_qty FROM item_lab_assignments GROUP BY item_master_id, asset_id) la 
       JOIN item_master im ON la.item_master_id = im.id 
       WHERE la.asset_id = a.id AND la.sum_qty > 0) as lab_consumables
      FROM assets a 
      JOIN item_master i ON a.item_master_id = i.id 
      LEFT JOIN categories c ON i.category_id = c.id 
      LEFT JOIN partners p ON a.client = p.name AND (
        (a.custom_attributes->>'contact_person' IS NOT NULL AND p.contact_person = a.custom_attributes->>'contact_person') OR
        (a.custom_attributes->>'contact_person' IS NULL AND p.id = (
             SELECT MIN(id) FROM partners WHERE name = a.client
        ))
      )
      WHERE c.name = '設備' AND i.brand = $1 ORDER BY a.id DESC`,
  deleteAsset: `DELETE FROM assets WHERE id = $1`,
  updateAssetStatus: `UPDATE assets SET status = $1 WHERE id = $2`,
  updateAssetOwnership: `UPDATE assets SET ownership = $1 WHERE id = $2`,
  updateMountedHardwareStatus: `UPDATE assets SET status = $1 WHERE custom_attributes->>'server_sn' = $2`,
  checkAssetSnExistsExcludeSelf: `SELECT id, sn FROM assets WHERE TRIM(sn) = TRIM($1) AND id != $2 LIMIT 1`,
  checkAssetSnExists: `SELECT id, sn FROM assets WHERE TRIM(sn) = TRIM($1) LIMIT 1`,
  fetchAssetBySn: `
    SELECT a.*, im.brand, im.model, im.type, im.specification, c.name as category_name
    FROM assets a
    JOIN item_master im ON a.item_master_id = im.id
    LEFT JOIN categories c ON im.category_id = c.id
    WHERE TRIM(UPPER(a.sn)) = TRIM(UPPER($1))
    LIMIT 1
  `,
  insertRmaAssetRecord: `
    INSERT INTO assets (
      item_master_id, sn, client, end_user, hostname, location,
      installed_date, customer_warranty_expire, system_date, warranty_expire,
      os, nic, custom_attributes, ownership, status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14, 'FOR_SALE'), COALESCE($15, 'ACTIVE')
    ) RETURNING id, sn, status
  `,
  updateAssetStatusAndAttributes: `UPDATE assets SET status = $1, custom_attributes = $2 WHERE id = $3`,
  updateMountedHardwareServerSn: `UPDATE assets SET custom_attributes = (CASE WHEN custom_attributes IS NOT NULL AND jsonb_typeof(custom_attributes) = 'object' THEN custom_attributes ELSE '{}'::jsonb END) || jsonb_build_object('server_sn', $1::text) WHERE custom_attributes->>'server_sn' IS NOT NULL AND TRIM(LOWER(custom_attributes->>'server_sn')) = TRIM(LOWER($2))`,
  bindHardwareToServerSn: `UPDATE assets SET custom_attributes = (CASE WHEN custom_attributes IS NOT NULL AND jsonb_typeof(custom_attributes) = 'object' THEN custom_attributes ELSE '{}'::jsonb END) || jsonb_build_object('server_sn', $1::text), client = COALESCE($3, client), location = COALESCE($4, location), ownership = COALESCE($5, ownership) WHERE sn IS NOT NULL AND TRIM(LOWER(sn)) = TRIM(LOWER($2)) RETURNING id, sn`,
  unbindHardwareServerSn: `UPDATE assets SET custom_attributes = (CASE WHEN custom_attributes IS NOT NULL AND jsonb_typeof(custom_attributes) = 'object' THEN custom_attributes ELSE '{}'::jsonb END) - 'server_sn' WHERE sn IS NOT NULL AND TRIM(LOWER(sn)) = TRIM(LOWER($1)) RETURNING id, sn`,
  findDeviceByMountedHwSn: `
    SELECT a.id, a.sn, a.client, a.location, a.hostname, a.ownership, a.status,
           COALESCE(a.custom_attributes->>'project_name', '') as project_name,
           a.custom_attributes
    FROM assets a
    JOIN item_master i ON a.item_master_id = i.id
    JOIN categories c ON i.category_id = c.id
    WHERE c.name = '設備' 
      AND a.sn IS NOT NULL AND a.sn != ''
      AND (
        (a.custom_attributes->>'mounted_hw_sns' IS NOT NULL AND $1::text = ANY(regexp_split_to_array(a.custom_attributes->>'mounted_hw_sns', '[,，\\s\\n]+')))
        OR
        (a.custom_attributes->>'mounted_hw_sns' ILIKE '%' || $1::text || '%')
      )
    LIMIT 1
  `,
  appendMountedHwSnToDevice: `
    UPDATE assets 
    SET custom_attributes = (CASE WHEN custom_attributes IS NOT NULL AND jsonb_typeof(custom_attributes) = 'object' THEN custom_attributes ELSE '{}'::jsonb END) || 
        jsonb_build_object('mounted_hw_sns', 
          CASE 
            WHEN custom_attributes->>'mounted_hw_sns' IS NULL OR TRIM(custom_attributes->>'mounted_hw_sns') = '' THEN $2::text
            WHEN $2::text = ANY(regexp_split_to_array(custom_attributes->>'mounted_hw_sns', '[,，\\s\\n]+')) THEN custom_attributes->>'mounted_hw_sns'
            ELSE (custom_attributes->>'mounted_hw_sns') || ', ' || $2::text
          END
        )
    WHERE sn IS NOT NULL AND TRIM(LOWER(sn)) = TRIM(LOWER($1)) 
    RETURNING id, sn
  `,
  removeMountedHwSnFromDevice: `
    UPDATE assets
    SET custom_attributes = (CASE WHEN custom_attributes IS NOT NULL AND jsonb_typeof(custom_attributes) = 'object' THEN custom_attributes ELSE '{}'::jsonb END) ||
        jsonb_build_object('mounted_hw_sns', 
          COALESCE((
            SELECT string_agg(TRIM(elem), ', ')
            FROM regexp_split_to_table(COALESCE(custom_attributes->>'mounted_hw_sns', ''), '[,，\\s\\n]+') elem
            WHERE TRIM(elem) != '' AND LOWER(TRIM(elem)) != LOWER(TRIM($2::text))
          ), '')
        )
    WHERE sn IS NOT NULL AND TRIM(LOWER(sn)) = TRIM(LOWER($1))
    RETURNING id, sn
  `,
  fetchAvailableHardwares: `
    SELECT a.id, a.sn, a.status, a.custom_attributes->>'server_sn' as server_sn,
           i.brand, i.model, i.type, i.specification
    FROM assets a
    JOIN item_master i ON a.item_master_id = i.id
    JOIN categories c ON i.category_id = c.id
    WHERE c.name = '硬體' AND a.sn IS NOT NULL AND TRIM(a.sn) != ''
    ORDER BY a.sn ASC
  `,
  checkHardwareSnExists: `
    SELECT a.id, a.sn
    FROM assets a
    JOIN item_master i ON a.item_master_id = i.id
    JOIN categories c ON i.category_id = c.id
    WHERE c.name = '硬體' AND a.sn IS NOT NULL AND TRIM(LOWER(a.sn)) = TRIM(LOWER($1))
    LIMIT 1
  `,
  updateRepairItemsSn: `UPDATE repair_items SET sn = $1 WHERE sn IS NOT NULL AND TRIM(sn) = TRIM($2)`,
  updateOutboundItemsSn: `UPDATE outbound_items SET sn = $1 WHERE sn IS NOT NULL AND TRIM(sn) = TRIM($2)`,
  updateItemMasterSpecs: `UPDATE item_master SET specification = $1, model = UPPER(TRIM(REGEXP_REPLACE(COALESCE($2, ''), '[[:space:]]+', ' ', 'g'))) WHERE id = $3`,
  countAssetsByMasterId: `SELECT COUNT(*) as count FROM assets WHERE item_master_id = $1`,
  updateAssetMasterId: `UPDATE assets SET item_master_id = $1 WHERE id = $2`,
  updateAssetDetails: `UPDATE assets SET sn = $1, client = $2, hostname = $3, location = $4, installed_date = $5, customer_warranty_expire = $6, system_date = $7, warranty_expire = $8, os = $9, nic = $10, custom_attributes = $11, ownership = COALESCE($12, 'FOR_SALE') WHERE id = $13`,
  
  fetchCompanyAssets: `
    SELECT 
      a.id, 
      a.sn, 
      a.status, 
      a.location, 
      i.brand, 
      i.model, 
      c.name as category_name
    FROM assets a
    JOIN item_master i ON a.item_master_id = i.id
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE a.ownership = 'COMPANY'
      AND a.status IN ('ACTIVE', 'LENT')
      AND c.name IN ('設備', '硬體')
    ORDER BY a.status, i.brand, i.model
  `,
  // View Data Queryies
  fetchMenuAssetBrands: `SELECT DISTINCT i.brand FROM assets a JOIN item_master i ON a.item_master_id = i.id LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '設備' ORDER BY i.brand ASC`,
  fetchMenuConsumableTypes: `SELECT DISTINCT i.type FROM item_master i LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '耗材' ORDER BY i.type ASC`,
  fetchMenuNicTypes: `SELECT DISTINCT i.type FROM item_master i LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '硬體' ORDER BY i.type ASC`,
  
  // Detailed Menu Structure for Filtering Retired Items
  fetchFullDeviceStructure: `SELECT DISTINCT i.brand, i.type, i.model FROM assets a JOIN item_master i ON a.item_master_id = i.id LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '設備'`,
  fetchFullConsumableStructure: `SELECT DISTINCT i.brand, i.type, i.model FROM item_master i LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '耗材'`,
  fetchFullNicStructure: `SELECT DISTINCT i.brand, i.type, i.model FROM item_master i LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '硬體'`,
  
  // Dashboard / Misc
  getSystemSetting: `SELECT value FROM system_settings WHERE key = $1`,
  upsertSystemSetting: `INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  
  // Dashboard / Misc
  fetchCustomers: `SELECT id, name, contact_person as contact, phone, address FROM partners WHERE partner_type = 'CUSTOMER' AND COALESCE(is_active, TRUE) = true ORDER BY name ASC, contact_person ASC`,
  fetchAssetSns: `SELECT sn FROM assets WHERE sn IS NOT NULL AND sn != ''`,
  insertCustomerIfNotExist: `INSERT INTO partners (partner_type, name) SELECT 'CUSTOMER', $1 WHERE NOT EXISTS (SELECT 1 FROM partners WHERE name = $1 AND partner_type = 'CUSTOMER')`,
  
  // Assets.jsx
  fetchRecentAssets: `
      SELECT a.*, i.specification, i.type, i.brand, i.model, i.unit, c.name as category_name,
             COALESCE(a.custom_attributes->>'contact_person', p.contact_person) as partner_contact,
             COALESCE(a.custom_attributes->>'contact_phone', p.phone) as partner_phone
      FROM assets a 
      JOIN item_master i ON a.item_master_id = i.id 
      LEFT JOIN categories c ON i.category_id = c.id 
      LEFT JOIN partners p ON a.client = p.name AND (
        (a.custom_attributes->>'contact_person' IS NOT NULL AND p.contact_person = a.custom_attributes->>'contact_person') OR
        (a.custom_attributes->>'contact_person' IS NULL AND p.id = (
             SELECT MIN(id) FROM partners WHERE name = a.client
        ))
      )
      WHERE c.name = '設備' ORDER BY a.id DESC LIMIT 10`,
  fetchDeviceTypes: `SELECT id, name FROM item_types WHERE category_id = (SELECT id FROM categories WHERE name = '設備') ORDER BY name ASC`,
  fetchTypesByBrand: `SELECT id, name FROM item_types WHERE category_id = (SELECT id FROM categories WHERE name = '設備') ORDER BY name ASC`,
  fetchDeviceBrands: `SELECT id, name FROM item_brands WHERE category_id = (SELECT id FROM categories WHERE name = '設備') ORDER BY name ASC`,
  fetchModelsByBrand: `
      SELECT DISTINCT m.name FROM item_models m 
      LEFT JOIN item_brands b ON m.brand_id = b.id
      LEFT JOIN item_types t ON m.type_id = t.id
      LEFT JOIN item_brands tb ON t.brand_id = tb.id
      WHERE (LOWER(b.name) = LOWER($1) OR LOWER(tb.name) = LOWER($1))
        AND (b.category_id = (SELECT id FROM categories WHERE name = '設備') OR t.category_id = (SELECT id FROM categories WHERE name = '設備'))
      ORDER BY m.name ASC`,
  fetchModelsByBrandType: `
      SELECT DISTINCT m.name FROM item_models m 
      LEFT JOIN item_brands b ON m.brand_id = b.id
      LEFT JOIN item_types t ON m.type_id = t.id
      LEFT JOIN item_brands tb ON t.brand_id = tb.id
      WHERE (LOWER(b.name) = LOWER($1) OR LOWER(tb.name) = LOWER($1))
        AND (b.category_id = (SELECT id FROM categories WHERE name = '設備') OR t.category_id = (SELECT id FROM categories WHERE name = '設備'))
      ORDER BY m.name ASC`,
  insertDeviceType: `INSERT INTO item_types (category_id, name) VALUES ((SELECT id FROM categories WHERE name = $1), UPPER(TRIM(REGEXP_REPLACE(COALESCE($2, ''), '[[:space:]]+', ' ', 'g')))) ON CONFLICT DO NOTHING`,
  deleteDeviceType: `DELETE FROM item_types WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = $2)`,
  insertDeviceModel: `
      INSERT INTO item_models (brand_id, name) 
      SELECT b.id, UPPER(TRIM(REGEXP_REPLACE(COALESCE($2, ''), '[[:space:]]+', ' ', 'g'))) FROM item_brands b 
      WHERE LOWER(b.name) = LOWER($1) AND b.category_id = (SELECT id FROM categories WHERE name = $3) 
      ON CONFLICT DO NOTHING`,
  deleteDeviceModel: `
      DELETE FROM item_models 
      WHERE name = $1 AND (
        brand_id IN (SELECT id FROM item_brands WHERE LOWER(name) = LOWER($2) AND category_id = (SELECT id FROM categories WHERE name = $3))
        OR type_id IN (SELECT t.id FROM item_types t JOIN item_brands b ON t.brand_id = b.id WHERE LOWER(b.name) = LOWER($2) AND b.category_id = (SELECT id FROM categories WHERE name = $3))
      )`,
  insertDeviceBrand: `INSERT INTO item_brands (category_id, name) VALUES ((SELECT id FROM categories WHERE name = $1), UPPER(TRIM(REGEXP_REPLACE(COALESCE($2, ''), '[[:space:]]+', ' ', 'g')))) ON CONFLICT ON CONSTRAINT item_brands_category_id_name_key DO NOTHING`,
  deleteDeviceBrand: `DELETE FROM item_brands WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = $2)`,
  
  findItemMaster: `
    SELECT id, brand, type, model, specification 
    FROM item_master 
    WHERE LOWER(TRIM(COALESCE(specification, ''))) = LOWER(TRIM(COALESCE($1, ''))) 
      AND LOWER(TRIM(COALESCE(type, ''))) = LOWER(TRIM(COALESCE($2, ''))) 
      AND LOWER(TRIM(COALESCE(brand, ''))) = LOWER(TRIM(COALESCE($3, ''))) 
      AND LOWER(TRIM(COALESCE(model, ''))) = LOWER(TRIM(COALESCE($4, '')))
    ORDER BY id ASC
    LIMIT 1
  `,
  scanDuplicateItemMasters: `
    SELECT 
      c.name as category_name,
      LOWER(TRIM(i.brand)) as norm_brand,
      LOWER(TRIM(i.type)) as norm_type,
      LOWER(TRIM(i.model)) as norm_model,
      LOWER(TRIM(COALESCE(i.specification, ''))) as norm_specification,
      COUNT(*) as duplicate_count,
      array_agg(i.id ORDER BY i.id ASC) as master_ids,
      array_agg(i.brand ORDER BY i.id ASC) as brands,
      array_agg(i.type ORDER BY i.id ASC) as types,
      array_agg(i.model ORDER BY i.id ASC) as models,
      array_agg(COALESCE(i.specification, '') ORDER BY i.id ASC) as specifications,
      (
        SELECT COUNT(*) FROM assets a WHERE a.item_master_id = ANY(array_agg(i.id))
      ) as total_assets_count
    FROM item_master i
    JOIN categories c ON i.category_id = c.id
    WHERE c.name IN ('設備', '硬體')
    GROUP BY c.name, LOWER(TRIM(i.brand)), LOWER(TRIM(i.type)), LOWER(TRIM(i.model)), LOWER(TRIM(COALESCE(i.specification, '')))
    HAVING COUNT(*) > 1
    ORDER BY c.name ASC, norm_brand ASC, norm_model ASC
  `,
  insertItemMaster: `INSERT INTO item_master (specification, type, brand, model, unit, category_id, purchase_price) VALUES ($1, UPPER(TRIM(REGEXP_REPLACE(COALESCE($2, ''), '[[:space:]]+', ' ', 'g'))), UPPER(TRIM(REGEXP_REPLACE(COALESCE($3, ''), '[[:space:]]+', ' ', 'g'))), UPPER(TRIM(REGEXP_REPLACE(COALESCE($4, ''), '[[:space:]]+', ' ', 'g'))), $5, (SELECT id FROM categories WHERE name = $6), 0) RETURNING id`,
  insertAssetRecord: `INSERT INTO assets (item_master_id, sn, client, hostname, location, installed_date, customer_warranty_expire, system_date, warranty_expire, os, nic, custom_attributes, ownership, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14, 'ACTIVE'))`,

  // ConsumableList.jsx
  fetchConsumablesList: `SELECT v.*, i.id as id, i.stock_qty, i.lab_qty, c.name as category_name FROM v_inventory_summary v JOIN item_master i ON v.item_id = i.id LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '耗材' ORDER BY i.id DESC`,
  fetchConsumablesListByType: `SELECT v.*, i.id as id, i.stock_qty, i.lab_qty, c.name as category_name FROM v_inventory_summary v JOIN item_master i ON v.item_id = i.id LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '耗材' AND v.type = $1 ORDER BY i.id DESC`,
  deleteConsumableMasterIfSafe: `
      DELETE FROM item_master i
      WHERE i.id = $1
        AND COALESCE(i.stock_qty, 0) = 0
        AND COALESCE(i.lab_qty, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.item_master_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM inbound_items ii WHERE ii.item_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM outbound_items oi WHERE oi.item_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM item_lab_assignments la WHERE la.item_master_id = i.id)
      RETURNING id
  `,
  updateConsumableMaster: `UPDATE item_master SET brand = UPPER(TRIM(REGEXP_REPLACE(COALESCE($1, ''), '[[:space:]]+', ' ', 'g'))), type = UPPER(TRIM(REGEXP_REPLACE(COALESCE($2, ''), '[[:space:]]+', ' ', 'g'))), model = UPPER(TRIM(REGEXP_REPLACE(COALESCE($3, ''), '[[:space:]]+', ' ', 'g'))), specification = $4, unit = $5, safety_stock = $6 WHERE id = $7`,
  transferStockToLab: `UPDATE item_master SET stock_qty = stock_qty - $1, lab_qty = lab_qty + $1 WHERE id = $2`,
  transferLabToStock: `UPDATE item_master SET stock_qty = stock_qty + $1, lab_qty = lab_qty - $1 WHERE id = $2`,
  insertLabAssignment: `INSERT INTO item_lab_assignments (item_master_id, asset_id, quantity, note) VALUES ($1, $2, $3, $4)`,
  fetchCurrentLabUsage: `
    SELECT a.id as asset_id, a.sn, a.hostname, i.brand, i.model, SUM(la.quantity) as current_qty
    FROM item_lab_assignments la
    JOIN assets a ON la.asset_id = a.id
    JOIN item_master i ON a.item_master_id = i.id
    WHERE la.item_master_id = $1
    GROUP BY a.id, a.sn, a.hostname, i.brand, i.model
    HAVING SUM(la.quantity) > 0
  `,
  fetchLabAssignments: `SELECT la.*, a.sn, a.hostname FROM item_lab_assignments la LEFT JOIN assets a ON la.asset_id = a.id WHERE la.item_master_id = $1 ORDER BY la.created_at DESC`,
  fetchAllAssetsForSelect: `SELECT a.id, a.sn, a.hostname, i.brand, i.model FROM assets a JOIN item_master i ON a.item_master_id = i.id ORDER BY a.hostname ASC, a.sn ASC`,

  // Consumables.jsx & ConsumableBatchImportModal.jsx
  checkDuplicateConsumable: `SELECT id, specification, stock_qty, lab_qty FROM item_master WHERE UPPER(TRIM(REGEXP_REPLACE(COALESCE(brand, ''), '[[:space:]]+', ' ', 'g'))) = UPPER(TRIM(REGEXP_REPLACE(COALESCE($1, ''), '[[:space:]]+', ' ', 'g'))) AND UPPER(TRIM(REGEXP_REPLACE(COALESCE(type, ''), '[[:space:]]+', ' ', 'g'))) = UPPER(TRIM(REGEXP_REPLACE(COALESCE($2, ''), '[[:space:]]+', ' ', 'g'))) AND UPPER(TRIM(REGEXP_REPLACE(COALESCE(model, ''), '[[:space:]]+', ' ', 'g'))) = UPPER(TRIM(REGEXP_REPLACE(COALESCE($3, ''), '[[:space:]]+', ' ', 'g'))) AND LOWER(TRIM(COALESCE(specification, ''))) = LOWER(TRIM(COALESCE($4, ''))) AND category_id = (SELECT id FROM categories WHERE name = '耗材')`,
  findConsumableMaster: `SELECT id, stock_qty, lab_qty, safety_stock FROM item_master WHERE LOWER(brand) = LOWER($1) AND LOWER(type) = LOWER($2) AND LOWER(model) = LOWER($3) AND LOWER(specification) = LOWER($4) AND category_id = (SELECT id FROM categories WHERE name = '耗材')`,
  // 直接指定庫存值（覆蓋模式）。回傳 id 以便呼叫端確認確實更新到。
  updateConsumableStockQtyOnImport: `UPDATE item_master SET stock_qty = $1 WHERE id = $2 RETURNING id`,
  // 累加模式改由資料庫自行加總，避免「先讀出再算好寫回」在同時匯入時互相覆蓋。
  incrementConsumableStockQtyOnImport: `UPDATE item_master SET stock_qty = COALESCE(stock_qty, 0) + $1 WHERE id = $2 RETURNING id`,
  fetchRecentConsumables: `SELECT i.* FROM item_master i LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '耗材' ORDER BY i.id DESC LIMIT 10`,
  insertConsumableMaster: `INSERT INTO item_master (specification, type, brand, model, unit, safety_stock, stock_qty, category_id, purchase_price) VALUES ($1, UPPER(TRIM(REGEXP_REPLACE(COALESCE($2, ''), '[[:space:]]+', ' ', 'g'))), UPPER(TRIM(REGEXP_REPLACE(COALESCE($3, ''), '[[:space:]]+', ' ', 'g'))), UPPER(TRIM(REGEXP_REPLACE(COALESCE($4, ''), '[[:space:]]+', ' ', 'g'))), $5, $6, $7, (SELECT id FROM categories WHERE name = $8), 0) RETURNING id`,
  fetchConsumableModelsByBrandType: `
      SELECT m.name FROM item_models m JOIN item_types t ON m.type_id = t.id JOIN item_brands b ON t.brand_id = b.id
      WHERE b.name = $1 AND t.name = $2 AND b.category_id = (SELECT id FROM categories WHERE name = '耗材') AND t.category_id = (SELECT id FROM categories WHERE name = '耗材') ORDER BY m.name ASC`,
  fetchConsumableTypesByBrand: `
      SELECT name FROM item_types WHERE category_id = (SELECT id FROM categories WHERE name = '耗材') AND brand_id = (SELECT id FROM item_brands WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = '耗材')) ORDER BY name ASC`,
  fetchConsumableBrands: `SELECT id, name FROM item_brands WHERE category_id = (SELECT id FROM categories WHERE name = '耗材') ORDER BY name ASC`,

  // Purchasing.jsx
  fetchPurchasingRecords: `
      SELECT pr.*, p.name as partner_name, c.name as category_name, u.full_name as purchaser_name
      FROM purchase_records pr LEFT JOIN partners p ON pr.partner_id = p.id LEFT JOIN categories c ON pr.category_id = c.id LEFT JOIN users u ON pr.purchaser_id = u.id ORDER BY pr.created_at DESC LIMIT 10`,
  fetchPurchaseRecordsByOrder: `
      SELECT pr.*, p.name as partner_name, c.name as category_name, u.full_name as purchaser_name
      FROM purchase_records pr LEFT JOIN partners p ON pr.partner_id = p.id LEFT JOIN categories c ON pr.category_id = c.id LEFT JOIN users u ON pr.purchaser_id = u.id 
      WHERE pr.order_no = $1 ORDER BY pr.id ASC`,
  deletePurchaseRecordById: `DELETE FROM purchase_records WHERE id = $1 AND COALESCE(received_quantity, 0) = 0 RETURNING id`,
  fetchSuppliers: `SELECT id, name, contact_person as contact, phone, address FROM partners WHERE partner_type = 'SUPPLIER' AND COALESCE(is_active, TRUE) = true ORDER BY name ASC, contact_person ASC`,
  fetchCategories: `SELECT id, name FROM categories`,
  fetchBrandsByCategory: `
      SELECT DISTINCT name FROM (
        SELECT name FROM item_brands WHERE category_id = $1
        UNION
        SELECT DISTINCT brand as name FROM item_master WHERE category_id = $1 AND brand IS NOT NULL AND TRIM(brand) != ''
      ) sub ORDER BY name ASC`,
  updatePurchaseRecordFull: `UPDATE purchase_records SET partner_id = $1, category_id = $2, item_type = $3, brand = $4, model = $5, specification = $6, unit = $7, quantity = $8, remarks = $9, project_name = $10, attachments = $11::jsonb WHERE id = $12`,
  fetchTypesByCategory: `
      SELECT DISTINCT name, brand FROM (
        SELECT t.name, (SELECT name FROM item_brands WHERE id = t.brand_id) as brand 
        FROM item_types t 
        WHERE t.category_id = $1
        UNION
        SELECT DISTINCT i.type as name, i.brand 
        FROM item_master i 
        WHERE i.category_id = $1 AND i.type IS NOT NULL AND TRIM(i.type) != ''
        UNION
        SELECT DISTINCT i.type as name, NULL as brand
        FROM item_master i
        WHERE i.category_id = $1 AND i.type IS NOT NULL AND TRIM(i.type) != ''
      ) sub ORDER BY name ASC`,
  fetchModelsByCategory: `
      SELECT DISTINCT model, type, brand, specification, unit FROM (
        SELECT m.name as model, t.name as type, b.name as brand, i.specification, i.unit
        FROM item_models m 
        JOIN item_types t ON m.type_id = t.id 
        JOIN item_brands b ON t.brand_id = b.id 
        LEFT JOIN item_master i ON (i.model = m.name AND i.type = t.name AND i.brand = b.name)
        WHERE t.category_id = $1
        UNION
        SELECT i.model, i.type, i.brand, i.specification, i.unit
        FROM item_master i
        WHERE i.category_id = $1 AND i.model IS NOT NULL AND TRIM(i.model) != ''
      ) sub ORDER BY model ASC`,
  countPurchaseOrders: `WITH seqs AS (SELECT CAST(SUBSTRING(order_no FROM '-([0-9]+)$') AS INTEGER) as sq FROM purchase_records WHERE order_no LIKE $1 || '%') SELECT s.val as count FROM generate_series(1, 1000) as s(val) WHERE NOT EXISTS (SELECT 1 FROM seqs WHERE seqs.sq = s.val) ORDER BY s.val ASC LIMIT 1`,
  insertItemBrand: `INSERT INTO item_brands (category_id, name) VALUES ($1, UPPER(TRIM(REGEXP_REPLACE(COALESCE($2, ''), '[[:space:]]+', ' ', 'g'))))`,
  insertItemType: `INSERT INTO item_types (category_id, name) VALUES ($1, UPPER(TRIM(REGEXP_REPLACE(COALESCE($2, ''), '[[:space:]]+', ' ', 'g'))))`,
  insertPurchaseRecord: `
      INSERT INTO purchase_records (order_no, partner_id, category_id, item_type, brand, model, specification, unit, quantity, purchaser_id, status, remarks, project_name, unit_price, attachments) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, $14::jsonb)`,
      
  // ProcurementList.jsx
  fetchProcurementList: `
      SELECT pr.*, p.name as partner_name, c.name as category_name, u.full_name as purchaser_name
      FROM purchase_records pr LEFT JOIN partners p ON pr.partner_id = p.id LEFT JOIN categories c ON pr.category_id = c.id LEFT JOIN users u ON pr.purchaser_id = u.id ORDER BY pr.created_at DESC`,
  deletePurchaseRecordList: `
      DELETE FROM purchase_records
      WHERE order_no = $1
        AND NOT EXISTS (
          SELECT 1 FROM purchase_records pr2
          WHERE pr2.order_no = $1 AND COALESCE(pr2.received_quantity, 0) > 0
        )
      RETURNING id
  `,
  updatePurchaseRecordList: `UPDATE purchase_records SET quantity = $1, specification = $2, model = $3, item_type = $4, brand = $5 WHERE id = $6`,

  fetchInboundItemMaster: `SELECT i.id, i.category_id, i.specification, i.type, i.brand, i.model, i.unit,
      COALESCE(i.safety_stock, 0) as safety_stock,
      CASE 
        WHEN c.name = '耗材' THEN COALESCE(i.stock_qty, 0)
        ELSE COALESCE((SELECT COUNT(*) FROM assets a WHERE a.item_master_id = i.id AND a.status = 'ACTIVE'), 0)
      END as current_stock,
      c.name as cat_name 
      FROM item_master i LEFT JOIN categories c ON i.category_id = c.id ORDER BY i.id DESC`,
  fetchPendingPurchases: `SELECT pr.*, p.name as partner_name, c.name as category_name FROM purchase_records pr LEFT JOIN partners p ON pr.partner_id = p.id LEFT JOIN categories c ON pr.category_id = c.id WHERE pr.status != 'COMPLETED' ORDER BY pr.created_at DESC`,
  deleteItemMasterIfOrphan: `
      DELETE FROM item_master i
      WHERE i.id = $1
        AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.item_master_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM inbound_items ii WHERE ii.item_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM outbound_items oi WHERE oi.item_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM item_lab_assignments la WHERE la.item_master_id = i.id)
      RETURNING id
  `,
  cleanupOrphanItemMasters: `
      DELETE FROM item_master i
      WHERE i.id IN (
        SELECT im.id FROM item_master im
        JOIN categories c ON im.category_id = c.id
        WHERE c.name IN ('設備', '硬體')
          AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.item_master_id = im.id)
          AND NOT EXISTS (SELECT 1 FROM inbound_items ii WHERE ii.item_id = im.id)
          AND NOT EXISTS (SELECT 1 FROM outbound_items oi WHERE oi.item_id = im.id)
          AND NOT EXISTS (SELECT 1 FROM item_lab_assignments la WHERE la.item_master_id = im.id)
      )
  `,
  insertInboundItemMaster: `INSERT INTO item_master (specification, type, brand, unit, category_id, purchase_price) VALUES ($1, UPPER(TRIM(REGEXP_REPLACE(COALESCE($2, ''), '[[:space:]]+', ' ', 'g'))), UPPER(TRIM(REGEXP_REPLACE(COALESCE($3, ''), '[[:space:]]+', ' ', 'g'))), $4, (SELECT id FROM categories WHERE name = $5), 0) RETURNING id`,
  countInboundOrders: `WITH seqs AS (SELECT CAST(SUBSTRING(order_no FROM '-([0-9]+)$') AS INTEGER) as sq FROM inbound_orders WHERE order_no LIKE $1 || '%') SELECT s.val as count FROM generate_series(1, 1000) as s(val) WHERE NOT EXISTS (SELECT 1 FROM seqs WHERE seqs.sq = s.val) ORDER BY s.val ASC LIMIT 1`,
  insertInboundOrder: `INSERT INTO inbound_orders (order_no, partner_id, invoice_no, status, attachments) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
  updateInboundOrderHeader: `UPDATE inbound_orders SET partner_id = $1, invoice_no = $2, attachments = $3::jsonb WHERE id = $4`,
  insertInboundAssets: `INSERT INTO assets (sn, item_master_id, status, custom_attributes) VALUES ($1, $2, 'ACTIVE', jsonb_build_object('project_name', $3::text))`,
  insertInboundItems: `INSERT INTO inbound_items (inbound_order_id, item_id, sn, quantity, purchase_record_id, unit_price) VALUES ($1, $2, $3, $4, $5, 0)`,
  updateStockQtyOnInbound: `UPDATE item_master SET stock_qty = stock_qty + $1 WHERE id = $2`,
  updatePurchaseRecordStatus: `UPDATE purchase_records SET received_quantity = COALESCE(received_quantity, 0) + $1, status = CASE WHEN COALESCE(received_quantity, 0) + $1 >= quantity THEN 'COMPLETED' ELSE 'PARTIAL' END, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
  fetchInboundList: `SELECT io.*, p.name as partner_name, (SELECT pr.project_name FROM inbound_items ii JOIN purchase_records pr ON ii.purchase_record_id = pr.id WHERE ii.inbound_order_id = io.id AND pr.project_name IS NOT NULL LIMIT 1) as project_name FROM inbound_orders io LEFT JOIN partners p ON io.partner_id = p.id ORDER BY io.created_at DESC`,
  fetchInboundItems: `
      SELECT ii.*, im.specification, im.brand, im.model, c.name as category_name, pr.order_no as po_order_no
      FROM inbound_items ii 
      LEFT JOIN item_master im ON ii.item_id = im.id 
      LEFT JOIN categories c ON im.category_id = c.id 
      LEFT JOIN purchase_records pr ON ii.purchase_record_id = pr.id
      WHERE ii.inbound_order_id = $1`,

  // MainLayout.jsx (使用上方已定義的同名查詢)

  // Inventory.jsx

  // Partners.jsx
  fetchPartners: `SELECT id, partner_type as type, name, contact_person as contact, phone, address, project_info, COALESCE(is_active, TRUE) as is_active FROM partners ORDER BY name ASC, contact_person ASC, id DESC`,
  insertPartner: `INSERT INTO partners (partner_type, name, contact_person, phone, address, project_info, is_active) VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
  updatePartner: `UPDATE partners SET partner_type = $1, name = $2, contact_person = $3, phone = $4, address = $5, project_info = $6 WHERE id = $7`,
  checkDuplicatePartner: `SELECT id FROM partners WHERE partner_type = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) AND LOWER(TRIM(contact_person)) = LOWER(TRIM($3))`,
  checkDuplicatePartnerForUpdate: `SELECT id FROM partners WHERE partner_type = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) AND LOWER(TRIM(contact_person)) = LOWER(TRIM($3)) AND id != $4`,
  updatePartnerActive: `UPDATE partners SET is_active = $1 WHERE id = $2`,
  deletePartner: `DELETE FROM partners WHERE id = $1`,
  migratePartnersActive: `ALTER TABLE partners ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`,
  migratePartnersAddress: `ALTER TABLE partners ADD COLUMN IF NOT EXISTS address TEXT`,
  migratePartnersProjectInfo: `ALTER TABLE partners ADD COLUMN IF NOT EXISTS project_info TEXT`,
  initPartnersActive: `UPDATE partners SET is_active = TRUE WHERE is_active IS NULL`,

  // Settings.jsx
  fetchUsers: `SELECT id, username, role, full_name, is_active, menu_access FROM users ORDER BY id ASC`,
  updateUserActive: `UPDATE users SET is_active = $1 WHERE id = $2`,
  deleteUser: `DELETE FROM users WHERE id = $1`,
  updateUserAccess: `UPDATE users SET menu_access = $1::jsonb WHERE id = $2`,
  fetchUserById: `SELECT id, username, role, full_name, is_active FROM users WHERE id = $1`,
  fetchUserByUsername: `SELECT id, username, role, full_name, is_active FROM users WHERE LOWER(username) = LOWER($1)`,

  // Hardware / NIC Registration & List
  fetchNicBrands: `SELECT id, name FROM item_brands WHERE category_id = (SELECT id FROM categories WHERE name = '硬體') ORDER BY name ASC`,
  fetchHwBrands: `SELECT id, name FROM item_brands WHERE category_id = (SELECT id FROM categories WHERE name = '硬體') ORDER BY name ASC`,
  fetchHwTypes: `SELECT id, name FROM item_types WHERE category_id = (SELECT id FROM categories WHERE name = '硬體') ORDER BY name ASC`,
  fetchNicTypesByBrand: `SELECT id, name FROM item_types WHERE category_id = (SELECT id FROM categories WHERE name = '硬體') ORDER BY name ASC`,
  fetchHwModelsByBrand: `
      SELECT DISTINCT m.name FROM item_models m 
      LEFT JOIN item_brands b ON m.brand_id = b.id
      LEFT JOIN item_types t ON m.type_id = t.id
      LEFT JOIN item_brands tb ON t.brand_id = tb.id
      WHERE (LOWER(b.name) = LOWER($1) OR LOWER(tb.name) = LOWER($1))
        AND (b.category_id = (SELECT id FROM categories WHERE name = '硬體') OR t.category_id = (SELECT id FROM categories WHERE name = '硬體'))
      ORDER BY m.name ASC`,
  fetchNicModelsByBrandType: `
      SELECT DISTINCT m.name FROM item_models m 
      LEFT JOIN item_brands b ON m.brand_id = b.id
      LEFT JOIN item_types t ON m.type_id = t.id
      LEFT JOIN item_brands tb ON t.brand_id = tb.id
      WHERE (LOWER(b.name) = LOWER($1) OR LOWER(tb.name) = LOWER($1))
        AND (b.category_id = (SELECT id FROM categories WHERE name = '硬體') OR t.category_id = (SELECT id FROM categories WHERE name = '硬體'))
      ORDER BY m.name ASC`,
  fetchNicSpecByBrandTypeModel: `
      SELECT specification FROM item_master WHERE UPPER(TRIM(REGEXP_REPLACE(COALESCE(brand, ''), '[[:space:]]+', ' ', 'g'))) = UPPER(TRIM(REGEXP_REPLACE(COALESCE($1, ''), '[[:space:]]+', ' ', 'g'))) AND UPPER(TRIM(REGEXP_REPLACE(COALESCE(type, ''), '[[:space:]]+', ' ', 'g'))) = UPPER(TRIM(REGEXP_REPLACE(COALESCE($2, ''), '[[:space:]]+', ' ', 'g'))) AND UPPER(TRIM(REGEXP_REPLACE(COALESCE(model, ''), '[[:space:]]+', ' ', 'g'))) = UPPER(TRIM(REGEXP_REPLACE(COALESCE($3, ''), '[[:space:]]+', ' ', 'g'))) AND category_id = (SELECT id FROM categories WHERE name = '硬體') LIMIT 1`,
    fetchNicListByType: `
      SELECT a.*, i.specification, i.type, i.brand, i.model, i.unit, 
             a.custom_attributes->>'server_sn' as server_sn,
             s.client as server_client, s.location as server_location,
             s.hostname as server_hostname, s.os as server_os, s.nic as server_nic,
             s.custom_attributes as server_custom_attributes,
             s.custom_attributes->>'end_user' as server_end_user,
             COALESCE(a.custom_attributes->>'contact_person', p.contact_person) as partner_contact,
             COALESCE(a.custom_attributes->>'contact_phone', p.phone) as partner_phone
      FROM assets a 
      JOIN item_master i ON a.item_master_id = i.id 
      LEFT JOIN assets s ON (TRIM(LOWER(a.custom_attributes->>'server_sn')) = TRIM(LOWER(s.sn)) AND s.sn IS NOT NULL AND s.sn != '')
      LEFT JOIN partners p ON a.client = p.name AND (
        (a.custom_attributes->>'contact_person' IS NOT NULL AND p.contact_person = a.custom_attributes->>'contact_person') OR
        (a.custom_attributes->>'contact_person' IS NULL AND p.id = (
             SELECT MIN(id) FROM partners WHERE name = a.client
        ))
      )
      WHERE i.category_id = (SELECT id FROM categories WHERE name = '硬體') AND i.type = $1
      ORDER BY a.id DESC`,
  fetchNicList: `
      SELECT a.*, i.specification, i.type, i.brand, i.model, i.unit, 
             a.custom_attributes->>'server_sn' as server_sn,
             s.client as server_client, s.location as server_location,
             s.hostname as server_hostname, s.os as server_os, s.nic as server_nic,
             s.custom_attributes as server_custom_attributes,
             s.custom_attributes->>'end_user' as server_end_user,
             COALESCE(a.custom_attributes->>'contact_person', p.contact_person) as partner_contact,
             COALESCE(a.custom_attributes->>'contact_phone', p.phone) as partner_phone
      FROM assets a 
      JOIN item_master i ON a.item_master_id = i.id 
      LEFT JOIN assets s ON (TRIM(LOWER(a.custom_attributes->>'server_sn')) = TRIM(LOWER(s.sn)) AND s.sn IS NOT NULL AND s.sn != '')
      LEFT JOIN partners p ON a.client = p.name AND (
        (a.custom_attributes->>'contact_person' IS NOT NULL AND p.contact_person = a.custom_attributes->>'contact_person') OR
        (a.custom_attributes->>'contact_person' IS NULL AND p.id = (
             SELECT MIN(id) FROM partners WHERE name = a.client
        ))
      )
      WHERE i.category_id = (SELECT id FROM categories WHERE name = '硬體')
      ORDER BY a.id DESC`,
  updateNicDetails: `UPDATE assets SET sn = $1, client = $2, location = $3, custom_attributes = (CASE WHEN custom_attributes IS NOT NULL AND jsonb_typeof(custom_attributes) = 'object' THEN custom_attributes ELSE '{}'::jsonb END) || jsonb_build_object('server_sn', $4::text, 'order_source', $5::text, 'project_name', $8::text, 'end_user', $10::text), hostname = $6, ownership = COALESCE($9, 'FOR_SALE') WHERE id = $7`,
  updateAssetProjectName: `UPDATE assets SET custom_attributes = COALESCE(custom_attributes, '{}'::jsonb) || jsonb_build_object('project_name', $1::text) WHERE id = $2`,
  updateNicSn: `UPDATE assets SET sn = $1 WHERE id = $2`,
  findAssetBySn: `SELECT id FROM assets WHERE TRIM(LOWER(sn)) = TRIM(LOWER($1))`,
  deleteCustomAttributeKey: `UPDATE assets SET custom_attributes = custom_attributes - $1 WHERE custom_attributes ? $1`,
  fetchAssetDetailBySN: `
    SELECT a.*, i.specification, i.type, i.brand, i.model, i.unit, c.name as category_name,
    (SELECT json_agg(json_build_object(
        'item_master_id', comp.item_master_id, 
        'brand', comp.brand, 
        'model', comp.model, 
        'sn', comp.sn, 
        'type', comp.type, 
        'specification', comp.specification
      )) 
     FROM (
       SELECT ha.item_master_id, COALESCE(hi.brand, '') as brand, COALESCE(hi.model, '') as model, ha.sn, COALESCE(hi.type, '') as type, COALESCE(hi.specification, '') as specification
       FROM assets ha 
       LEFT JOIN item_master hi ON ha.item_master_id = hi.id 
       WHERE ha.custom_attributes->>'server_sn' IS NOT NULL 
         AND a.sn IS NOT NULL AND a.sn != ''
         AND TRIM(LOWER(ha.custom_attributes->>'server_sn')) = TRIM(LOWER(a.sn))
       UNION
       SELECT NULL::integer as item_master_id, '' as brand, '' as model, TRIM(elem) as sn, '硬體' as type, '' as specification
       FROM regexp_split_to_table(COALESCE(a.custom_attributes->>'mounted_hw_sns', ''), '[,，\\s\\n]+') elem
       WHERE TRIM(elem) != ''
         AND NOT EXISTS (
           SELECT 1 FROM assets ex 
           WHERE ex.custom_attributes->>'server_sn' IS NOT NULL 
             AND a.sn IS NOT NULL AND a.sn != ''
             AND TRIM(LOWER(ex.custom_attributes->>'server_sn')) = TRIM(LOWER(a.sn))
             AND TRIM(LOWER(ex.sn)) = TRIM(LOWER(elem))
         )
     ) comp) as components
    FROM assets a 
    JOIN item_master i ON a.item_master_id = i.id 
    LEFT JOIN categories c ON i.category_id = c.id 
    WHERE TRIM(LOWER(a.sn)) = TRIM(LOWER($1))
  `,
  
  // Outbound Workflow
  countOutboundRequests: `WITH seqs AS (SELECT CAST(SUBSTRING(request_no FROM '-([0-9]+)$') AS INTEGER) as sq FROM outbound_requests WHERE request_no LIKE $1 || '%') SELECT s.val as count FROM generate_series(1, 1000) as s(val) WHERE NOT EXISTS (SELECT 1 FROM seqs WHERE seqs.sq = s.val) ORDER BY s.val ASC LIMIT 1`,
  insertOutboundRequest: `INSERT INTO outbound_requests (request_no, customer, location, shipping_date, status, creator_id, contact_info, request_type, expected_return_date) VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7, $8) RETURNING id`,
  insertOutboundRequestWithProject: `INSERT INTO outbound_requests (request_no, customer, location, shipping_date, status, creator_id, contact_info, request_type, expected_return_date, project_name) VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7, $8, $9) RETURNING id`,
  updateOutboundRequestProjectName: `UPDATE outbound_requests SET project_name = $1 WHERE id = $2`,
  migrateOutboundProjectName: `ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS project_name VARCHAR(100);`,
  updateAssetProjectAndClientBySn: `UPDATE assets SET custom_attributes = jsonb_set(COALESCE(custom_attributes, '{}'::jsonb), '{project_name}', to_jsonb($1::text)), client = COALESCE($2, client) WHERE sn IS NOT NULL AND TRIM(sn) = TRIM($3)`,
  updateMountedHardwareProjectAndClient: `UPDATE assets SET custom_attributes = jsonb_set(COALESCE(custom_attributes, '{}'::jsonb), '{project_name}', to_jsonb($1::text)), client = COALESCE($2, client) WHERE custom_attributes->>'server_sn' IS NOT NULL AND TRIM(custom_attributes->>'server_sn') = TRIM($3)`,
  checkProjectExistsByName: `SELECT id, project_no, name FROM projects WHERE TRIM(LOWER(name)) = TRIM(LOWER($1)) LIMIT 1`,
  insertOutboundItem: `INSERT INTO outbound_items (request_id, item_id, sn, quantity, location) VALUES ($1, $2, $3, $4, $5)`,
  insertLendOutboundItem: `INSERT INTO outbound_items (request_id, item_id, sn, quantity, location, purpose) VALUES ($1, $2, $3, $4, $5, COALESCE($6, '運作測試'))`,
  migrateOutboundItemPurpose: `ALTER TABLE outbound_items ADD COLUMN IF NOT EXISTS purpose VARCHAR(255) DEFAULT '運作測試'`,
  searchActiveAssetSNs: `
    SELECT a.id, a.sn, a.location, a.status,
           COALESCE(c.name, '硬體') as category_name, i.brand, i.model, i.type, i.specification, i.unit
    FROM assets a 
    JOIN item_master i ON a.item_master_id = i.id 
    LEFT JOIN categories c ON i.category_id = c.id 
    WHERE UPPER(TRIM(COALESCE(a.status, 'ACTIVE'))) = 'ACTIVE' AND a.sn IS NOT NULL AND TRIM(a.sn) != '' 
    ORDER BY a.sn ASC
  `,
  fetchActiveProjects: `SELECT project_no, name as project_name FROM projects WHERE status = 'IN_PROGRESS' ORDER BY created_at DESC`,
  fetchAssetsByProject: `
    SELECT a.*, i.specification, i.type, i.brand, i.model, i.unit, c.name as category_name,
    (SELECT json_agg(json_build_object(
        'item_master_id', ha.item_master_id, 
        'brand', hi.brand, 
        'model', hi.model, 
        'sn', ha.sn, 
        'type', hi.type, 
        'specification', hi.specification
      )) 
     FROM assets ha JOIN item_master hi ON ha.item_master_id = hi.id 
     WHERE ha.custom_attributes->>'server_sn' IS NOT NULL 
     AND TRIM(ha.custom_attributes->>'server_sn') = TRIM(a.sn)) as components
    FROM assets a 
    JOIN item_master i ON a.item_master_id = i.id 
    LEFT JOIN categories c ON i.category_id = c.id 
    WHERE a.status = 'ACTIVE' AND (
      a.custom_attributes->>'project_name' = $1 OR 
      a.custom_attributes->>'project_name' = split_part($1, ' ', 1) OR
      (POSITION(' ' IN $1) > 0 AND a.custom_attributes->>'project_name' = substring($1 from '^[^ ]+ (.*)$'))
    )
  `,
  fetchDNList: `
    SELECT r.*, u.full_name as creator_name, 
           (SELECT COUNT(*) FROM outbound_items WHERE request_id = r.id) as item_count,
           COALESCE(r.project_name, 
             (SELECT a.custom_attributes->>'project_name' 
              FROM outbound_items oi 
              JOIN assets a ON oi.sn = a.sn 
              WHERE oi.request_id = r.id AND a.custom_attributes->>'project_name' IS NOT NULL 
              LIMIT 1)
           ) as project_name
    FROM outbound_requests r
    LEFT JOIN users u ON r.creator_id = u.id
    ORDER BY r.created_at DESC
  `,
  fetchLentRequests: `
    SELECT r.*, u.full_name as creator_name, 
           (SELECT COUNT(*) FROM outbound_items WHERE request_id = r.id) as item_count,
           COALESCE(r.project_name, 
             (SELECT a.custom_attributes->>'project_name' 
              FROM outbound_items oi 
              JOIN assets a ON oi.sn = a.sn 
              WHERE oi.request_id = r.id AND a.custom_attributes->>'project_name' IS NOT NULL 
              LIMIT 1)
           ) as project_name,
           (SELECT string_agg(COALESCE(oi.sn, '') || ' ' || COALESCE(im.model, '') || ' ' || COALESCE(im.brand, ''), ' ')
            FROM outbound_items oi
            JOIN item_master im ON oi.item_id = im.id
            WHERE oi.request_id = r.id) as searchable_items
    FROM outbound_requests r
    LEFT JOIN users u ON r.creator_id = u.id
    WHERE r.request_type = 'LEND' AND r.status IN ('PENDING', 'SHIPPED', 'RETURNED')
    ORDER BY r.created_at DESC, r.expected_return_date ASC NULLS LAST
  `,
  fetchDNItems: `
    SELECT oi.*, i.brand, i.model, i.specification, i.type, i.unit, c.name as category_name,
           a.system_date, a.customer_warranty_expire, a.warranty_expire, a.installed_date, a.shipping_date,
           a.custom_attributes->>'project_name' as asset_project_name
    FROM outbound_items oi
    LEFT JOIN item_master i ON oi.item_id = i.id
    LEFT JOIN categories c ON i.category_id = c.id
    LEFT JOIN assets a ON oi.sn = a.sn
    WHERE oi.request_id = $1
    ORDER BY oi.id ASC
  `,
  checkItemStock: `SELECT stock_qty FROM item_master WHERE id = $1`,
  checkAssetActive: `SELECT status FROM assets WHERE sn = $1`,
  updateStockQtyOnOutbound: `UPDATE item_master SET stock_qty = stock_qty - $1 WHERE id = $2 AND stock_qty >= $1`,
  updateAssetStatusAndLocationBySn: `UPDATE assets SET status = $1, location = $2 WHERE sn = $3`,
  updateAssetStatusLocationAndShippingDateBySn: `UPDATE assets SET status = $1, location = $2, shipping_date = $3 WHERE sn = $4`,
  updateAssetStatusLocationAndInstalledDateBySn: `UPDATE assets SET status = $1, location = $2, installed_date = $3, shipping_date = $3 WHERE sn = $4`,
  updateMountedHardwareShippingDate: `UPDATE assets SET shipping_date = $1 WHERE custom_attributes->>'server_sn' = $2`,
  updateMountedHardwareInstalledAndShippingDate: `UPDATE assets SET installed_date = $1, shipping_date = $1 WHERE custom_attributes->>'server_sn' = $2`,
  updateAssetShippingDate: `UPDATE assets SET shipping_date = $1 WHERE id = $2`,
  updateAssetShippingDateBySn: `UPDATE assets SET shipping_date = $1 WHERE sn = $2`,
  updateOutboundRequestStatus: `UPDATE outbound_requests SET status = $1 WHERE id = $2`,
  updateOutboundRequestReturned: `UPDATE outbound_requests SET status = 'RETURNED', actual_return_date = $2 WHERE id = $1`,
  deleteOutboundRequest: `DELETE FROM outbound_requests WHERE id = $1`,
  migrateOutboundSignedDoc: `ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS signed_doc_url TEXT; ALTER TABLE outbound_requests ADD COLUMN IF NOT EXISTS signed_doc_name TEXT;`,
  updateOutboundSignedDoc: `UPDATE outbound_requests SET signed_doc_url = $1, signed_doc_name = $2 WHERE id = $3`,
  removeOutboundSignedDoc: `UPDATE outbound_requests SET signed_doc_url = NULL, signed_doc_name = NULL WHERE id = $1`,
  
  // --- Projects ---
  fetchProjects: `SELECT * FROM projects ORDER BY created_at DESC`,
  countProjectsByPrefix: `SELECT COUNT(*) as count FROM projects WHERE project_no LIKE $1 || '%'`,
  createProject: `INSERT INTO projects (project_no, customer_name, customer_contact, name, start_date, end_date, remarks, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
  updateProject: `UPDATE projects SET customer_name = $1, customer_contact = $2, name = $3, start_date = $4, end_date = $5, remarks = $6, status = $7, documents = $8, updated_at = CURRENT_TIMESTAMP WHERE id = $9 RETURNING *`,
  deleteProject: `DELETE FROM projects WHERE id = $1`,
  clearProjectFromAssets: `UPDATE assets SET custom_attributes = custom_attributes - 'project_name' WHERE custom_attributes->>'project_name' = $1`,
  countProjectAssets: `SELECT COUNT(*) FROM assets WHERE custom_attributes->>'project_name' = $1`,

  // --- PJ Report (專案進出報表) ---
  fetchPJReportData: `
    SELECT 
      p.id,
      p.project_no,
      p.name as project_name,
      p.customer_name as project_customer,
      p.customer_contact as project_contact,
      p.status as project_status,
      p.start_date,
      p.end_date,
      p.created_at,
      (
        SELECT count(*) 
        FROM assets a 
        WHERE a.custom_attributes->>'project_name' = p.name
      ) as allocated_assets,
      (
        SELECT COALESCE(SUM(oi.quantity), 0)
        FROM outbound_items oi
        JOIN outbound_requests o ON oi.request_id = o.id
        WHERE o.status = 'SHIPPED'
        AND oi.sn IN (
          SELECT a.sn FROM assets a
          WHERE a.custom_attributes->>'project_name' = p.name
          AND a.sn IS NOT NULL AND a.sn != ''
        )
      ) as outbound_quantity,
      (
        SELECT json_agg(json_build_object(
          'request_no', o.request_no,
          'customer', o.customer,
          'shipping_date', o.shipping_date,
          'status', o.status,
          'sn', oi.sn,
          'quantity', oi.quantity,
          'category_name', c.name,
          'brand', im.brand,
          'model', im.model,
          'type', im.type,
          'item_name', im.brand || ' ' || im.model || ' (' || im.type || ')'
        ))
        FROM outbound_items oi
        JOIN outbound_requests o ON oi.request_id = o.id
        LEFT JOIN item_master im ON oi.item_id = im.id
        LEFT JOIN categories c ON im.category_id = c.id
        WHERE oi.sn IN (
          SELECT a.sn FROM assets a
          WHERE a.custom_attributes->>'project_name' = p.name
          AND a.sn IS NOT NULL AND a.sn != ''
        )
      ) as outbound_history,
      (
        SELECT json_agg(json_build_object(
          'sn', a.sn,
          'brand', im.brand,
          'model', im.model,
          'type', im.type,
          'item_name', im.brand || ' ' || im.model || ' (' || im.type || ')',
          'category_name', c.name,
          'status', a.status
        ))
        FROM assets a
        LEFT JOIN item_master im ON a.item_master_id = im.id
        LEFT JOIN categories c ON im.category_id = c.id
        WHERE a.custom_attributes->>'project_name' = p.name
      ) as allocated_assets_history
    FROM projects p
    ORDER BY p.created_at DESC
  `,

  // --- Stocktaking (盤點總表) ---
  fetchStocktakingAssets: `
    SELECT 
      c.name as category_name, 
      i.type, 
      i.brand, 
      i.model, 
      i.specification, 
      COUNT(a.id) as stock_qty
    FROM assets a 
    JOIN item_master i ON a.item_master_id = i.id 
    JOIN categories c ON i.category_id = c.id 
    WHERE a.status = 'ACTIVE' AND c.name IN ('設備', '硬體')
    GROUP BY c.name, i.type, i.brand, i.model, i.specification
    ORDER BY c.name DESC, i.brand ASC, i.type ASC, i.model ASC
  `,
  fetchStocktakingConsumables: `
    SELECT i.id, i.brand, i.model, i.specification, i.type, i.stock_qty, i.lab_qty, i.unit, c.name as category_name 
    FROM item_master i 
    JOIN categories c ON i.category_id = c.id 
    WHERE c.name = '耗材' AND (i.stock_qty > 0 OR i.lab_qty > 0)
    ORDER BY i.brand ASC, i.type ASC, i.model ASC
  `,
  fetchFlowHistory: `
    SELECT 
      'INBOUND' as transaction_type,
      COALESCE(io.order_date, io.created_at::date) as transaction_date,
      io.order_no,
      p.name as partner_name,
      ii.quantity,
      ii.sn,
      im.brand,
      im.model,
      im.specification,
      ii.created_at
    FROM inbound_items ii
    JOIN inbound_orders io ON ii.inbound_order_id = io.id
    LEFT JOIN partners p ON io.partner_id = p.id
    LEFT JOIN item_master im ON ii.item_id = im.id
    WHERE io.status = 'COMPLETED'
    
    UNION ALL

    SELECT 
      'BATCH_IMPORT' as transaction_type,
      COALESCE(a.installed_date, a.system_date, a.created_at::date) as transaction_date,
      COALESCE(a.custom_attributes->>'import_file', a.custom_attributes->>'order_source', '批次匯入') as order_no,
      COALESCE(a.client, '系統批次匯入') as partner_name,
      1 as quantity,
      a.sn,
      im.brand,
      im.model,
      im.specification,
      a.created_at
    FROM assets a
    JOIN item_master im ON a.item_master_id = im.id
    WHERE (
      a.custom_attributes->>'batch_imported' = 'true' 
      OR (a.custom_attributes->>'batch_imported')::boolean = true
      OR a.custom_attributes->>'import_file' IS NOT NULL
      OR a.custom_attributes->>'import_date' IS NOT NULL
      OR NOT EXISTS (
        SELECT 1 FROM inbound_items ii 
        WHERE ii.item_id = a.item_master_id 
          AND ii.sn IS NOT NULL AND a.sn IS NOT NULL 
          AND TRIM(LOWER(ii.sn)) = TRIM(LOWER(a.sn))
      )
    )

    UNION ALL

    SELECT 
      'BATCH_IMPORT' as transaction_type,
      im.created_at::date as transaction_date,
      '初始庫存/批次匯入' as order_no,
      '系統初始建立' as partner_name,
      im.stock_qty as quantity,
      NULL as sn,
      im.brand,
      im.model,
      im.specification,
      im.created_at
    FROM item_master im
    JOIN categories c ON im.category_id = c.id
    WHERE c.name = '耗材'
      AND NOT EXISTS (
        SELECT 1 FROM inbound_items ii WHERE ii.item_id = im.id
      )
    
    UNION ALL
    
    SELECT 
      CASE WHEN o.request_type = 'LEND' THEN 'OUTBOUND_LEND' ELSE 'OUTBOUND_SALE' END as transaction_type,
      COALESCE(o.shipping_date, o.created_at::date) as transaction_date,
      o.request_no as order_no,
      o.customer as partner_name,
      oi.quantity,
      oi.sn,
      im.brand,
      im.model,
      im.specification,
      o.created_at
    FROM outbound_items oi
    JOIN outbound_requests o ON oi.request_id = o.id
    LEFT JOIN item_master im ON oi.item_id = im.id
    WHERE o.status IN ('SHIPPED', 'RETURNED')
    
    ORDER BY transaction_date DESC, created_at DESC
  `,
  fetchItemFlowHistory: `
    SELECT 
      'INBOUND' as transaction_type,
      COALESCE(io.order_date, io.created_at::date) as transaction_date,
      io.order_no,
      p.name as partner_name,
      ii.quantity,
      ii.sn,
      im.brand,
      im.model,
      im.specification,
      ii.created_at
    FROM inbound_items ii
    JOIN inbound_orders io ON ii.inbound_order_id = io.id
    LEFT JOIN partners p ON io.partner_id = p.id
    LEFT JOIN item_master im ON ii.item_id = im.id
    WHERE io.status = 'COMPLETED' AND ii.item_id = $1::integer
    
    UNION ALL

    SELECT 
      'BATCH_IMPORT' as transaction_type,
      COALESCE(a.installed_date, a.system_date, a.created_at::date) as transaction_date,
      COALESCE(a.custom_attributes->>'import_file', a.custom_attributes->>'order_source', '批次匯入') as order_no,
      COALESCE(a.client, '系統批次匯入') as partner_name,
      1 as quantity,
      a.sn,
      im.brand,
      im.model,
      im.specification,
      a.created_at
    FROM assets a
    JOIN item_master im ON a.item_master_id = im.id
    WHERE a.item_master_id = $1::integer
      AND (
        a.custom_attributes->>'batch_imported' = 'true' 
        OR (a.custom_attributes->>'batch_imported')::boolean = true
        OR a.custom_attributes->>'import_file' IS NOT NULL
        OR a.custom_attributes->>'import_date' IS NOT NULL
        OR NOT EXISTS (
          SELECT 1 FROM inbound_items ii 
          WHERE ii.item_id = a.item_master_id 
            AND ii.sn IS NOT NULL AND a.sn IS NOT NULL 
            AND TRIM(LOWER(ii.sn)) = TRIM(LOWER(a.sn))
        )
      )

    UNION ALL

    SELECT 
      'BATCH_IMPORT' as transaction_type,
      im.created_at::date as transaction_date,
      '初始庫存/批次匯入' as order_no,
      '系統初始建立' as partner_name,
      im.stock_qty as quantity,
      NULL as sn,
      im.brand,
      im.model,
      im.specification,
      im.created_at
    FROM item_master im
    JOIN categories c ON im.category_id = c.id
    WHERE im.id = $1::integer AND c.name = '耗材'
      AND NOT EXISTS (
        SELECT 1 FROM inbound_items ii WHERE ii.item_id = im.id
      )
    
    UNION ALL
    
    SELECT 
      CASE WHEN o.request_type = 'LEND' THEN 'OUTBOUND_LEND' ELSE 'OUTBOUND_SALE' END as transaction_type,
      COALESCE(o.shipping_date, o.created_at::date) as transaction_date,
      o.request_no as order_no,
      o.customer as partner_name,
      oi.quantity,
      oi.sn,
      im.brand,
      im.model,
      im.specification,
      o.created_at
    FROM outbound_items oi
    JOIN outbound_requests o ON oi.request_id = o.id
    LEFT JOIN item_master im ON oi.item_id = im.id
    WHERE o.status IN ('SHIPPED', 'RETURNED') AND oi.item_id = $1::integer
    
    ORDER BY transaction_date DESC, created_at DESC
  `,

  // System Audit Logs (事件紀錄與稽核日誌)
  insertAuditLog: `
    INSERT INTO system_audit_logs (
      user_id, user_name, user_role, action_type, module, module_label, target_id, target_name, summary, details, ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `,
  fetchAuditLogs: `
    SELECT 
      id,
      timestamp,
      user_id,
      user_name,
      user_role,
      action_type,
      module,
      module_label,
      target_id,
      target_name,
      summary,
      details,
      ip_address
    FROM system_audit_logs
    ORDER BY timestamp DESC
    LIMIT 2000
  `,
  fetchLiveAuditLogs: `
    SELECT 
      id,
      timestamp,
      user_id,
      user_name,
      user_role,
      action_type,
      module,
      module_label,
      target_id,
      target_name,
      summary,
      details,
      ip_address
    FROM system_audit_logs
    WHERE timestamp >= NOW() - INTERVAL '24 hours'
    ORDER BY timestamp DESC
    LIMIT 500
  `,
  fetchAuditLogStats: `
    SELECT 
      COUNT(*) as today_count,
      COUNT(CASE WHEN action_type = 'CREATE' THEN 1 END) as create_count,
      COUNT(CASE WHEN action_type = 'UPDATE' OR action_type = 'STATUS_CHANGE' THEN 1 END) as update_count,
      COUNT(CASE WHEN action_type = 'DELETE' THEN 1 END) as delete_count,
      COUNT(DISTINCT user_name) as active_users
    FROM system_audit_logs
    WHERE timestamp >= NOW() - INTERVAL '24 hours'
  `,

  // Overview.jsx (營運總覽)
  fetchOverviewStats: `
    SELECT 
      (SELECT COUNT(*) FROM purchase_records WHERE status != 'COMPLETED') as pending_purchases_count,
      (SELECT COUNT(*) FROM inbound_orders WHERE status = 'DRAFT') as draft_inbounds_count,
      (SELECT COUNT(*) FROM outbound_requests WHERE request_type = 'SALE' AND status = 'PENDING') as pending_outbounds_count,
      (SELECT COUNT(*) FROM outbound_requests WHERE request_type = 'LEND' AND status = 'SHIPPED') as active_lents_count,
      (SELECT COUNT(*) FROM outbound_requests WHERE request_type = 'LEND' AND status = 'SHIPPED' AND expected_return_date < CURRENT_DATE) as overdue_lents_count,
      (SELECT COUNT(*) FROM item_master i JOIN categories c ON i.category_id = c.id WHERE c.name = '耗材' AND COALESCE(i.safety_stock, 0) > 0 AND (COALESCE(i.stock_qty, 0) + COALESCE(i.lab_qty, 0)) <= i.safety_stock) as low_stock_consumables_count,
      (SELECT COUNT(*) FROM projects WHERE status = 'IN_PROGRESS') as active_projects_count,
      (SELECT COUNT(*) FROM repair_orders WHERE status != 'COMPLETED') as active_repairs_count,
      (SELECT COUNT(*) FROM repair_orders WHERE status = 'SENT_OEM') as sent_oem_repairs_count
  `,
  fetchOverviewActiveRepairs: `
    SELECT ro.*, u.full_name as creator_name,
      (SELECT COUNT(*) FROM repair_items WHERE repair_id = ro.id) as item_count,
      (SELECT string_agg(COALESCE(ri.brand, '') || ' ' || COALESCE(ri.model, '') || ' (' || COALESCE(ri.sn, '') || ')', ', ') 
       FROM repair_items ri 
       WHERE ri.repair_id = ro.id) as item_summary
    FROM repair_orders ro
    LEFT JOIN users u ON ro.creator_id = u.id
    WHERE ro.status != 'COMPLETED'
    ORDER BY ro.created_at DESC
    LIMIT 100
  `,
  fetchOverviewPendingPurchases: `
    SELECT pr.*, p.name as partner_name, c.name as category_name, u.full_name as purchaser_name
    FROM purchase_records pr
    LEFT JOIN partners p ON pr.partner_id = p.id
    LEFT JOIN categories c ON pr.category_id = c.id
    LEFT JOIN users u ON pr.purchaser_id = u.id
    WHERE pr.status != 'COMPLETED'
    ORDER BY pr.created_at DESC
    LIMIT 100
  `,
  fetchOverviewDraftInbounds: `
    SELECT io.*, p.name as partner_name,
      (SELECT COUNT(*) FROM inbound_items WHERE inbound_order_id = io.id) as item_count,
      (SELECT COALESCE(SUM(quantity), 0) FROM inbound_items WHERE inbound_order_id = io.id) as total_quantity
    FROM inbound_orders io
    LEFT JOIN partners p ON io.partner_id = p.id
    WHERE io.status = 'DRAFT'
    ORDER BY io.created_at DESC
    LIMIT 100
  `,
  fetchOverviewPendingOutbounds: `
    SELECT r.*, u.full_name as creator_name,
      (SELECT COUNT(*) FROM outbound_items WHERE request_id = r.id) as item_count,
      (SELECT COALESCE(SUM(quantity), 0) FROM outbound_items WHERE request_id = r.id) as total_quantity
    FROM outbound_requests r
    LEFT JOIN users u ON r.creator_id = u.id
    WHERE r.request_type = 'SALE' AND r.status = 'PENDING'
    ORDER BY r.created_at DESC
    LIMIT 100
  `,
  fetchOverviewActiveLents: `
    SELECT r.*, u.full_name as creator_name,
      (SELECT COUNT(*) FROM outbound_items WHERE request_id = r.id) as item_count,
      (SELECT string_agg(COALESCE(im.brand, '') || ' ' || COALESCE(im.model, ''), ', ') 
       FROM outbound_items oi 
       JOIN item_master im ON oi.item_id = im.id 
       WHERE oi.request_id = r.id) as item_summary,
      CASE WHEN r.expected_return_date < CURRENT_DATE THEN TRUE ELSE FALSE END as is_overdue
    FROM outbound_requests r
    LEFT JOIN users u ON r.creator_id = u.id
    WHERE r.request_type = 'LEND' AND r.status = 'SHIPPED'
    ORDER BY (CASE WHEN r.expected_return_date < CURRENT_DATE THEN 0 ELSE 1 END) ASC, r.expected_return_date ASC NULLS LAST, r.shipping_date DESC
    LIMIT 100
  `,
  fetchOverviewLowStockConsumables: `
    SELECT 
      i.id,
      i.brand,
      i.type,
      i.model,
      i.specification,
      i.unit,
      COALESCE(i.stock_qty, 0) as stock_qty,
      COALESCE(i.lab_qty, 0) as lab_qty,
      (COALESCE(i.stock_qty, 0) + COALESCE(i.lab_qty, 0)) as total_qty,
      COALESCE(i.safety_stock, 0) as safety_stock,
      (COALESCE(i.safety_stock, 0) - (COALESCE(i.stock_qty, 0) + COALESCE(i.lab_qty, 0))) as shortage_qty,
      c.name as category_name
    FROM item_master i
    JOIN categories c ON i.category_id = c.id
    WHERE c.name = '耗材'
      AND COALESCE(i.safety_stock, 0) > 0
      AND (COALESCE(i.stock_qty, 0) + COALESCE(i.lab_qty, 0)) <= i.safety_stock
    ORDER BY shortage_qty DESC, total_qty ASC, i.id DESC
    LIMIT 200
  `,

  // --- 維修單 (Repair Orders / RMA List) ---
  initRepairTables: `
    CREATE TABLE IF NOT EXISTS repair_orders (
      id SERIAL PRIMARY KEY,
      repair_no VARCHAR(50) UNIQUE NOT NULL,
      customer_name VARCHAR(100) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'ON_SITE_HANDLING',
      on_site_date DATE,
      on_site_status TEXT,
      send_oem_date DATE,
      oem_return_date DATE,
      results TEXT,
      completion_date DATE,
      creator_id INTEGER,
      remarks TEXT,
      signed_doc_url TEXT,
      signed_doc_name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS repair_items (
      id SERIAL PRIMARY KEY,
      repair_id INTEGER REFERENCES repair_orders(id) ON DELETE CASCADE,
      asset_id INTEGER,
      item_master_id INTEGER,
      brand VARCHAR(100),
      type VARCHAR(100),
      model VARCHAR(100),
      specification TEXT,
      sn VARCHAR(100)
    );
  `,
  countRepairOrders: `WITH seqs AS (SELECT CAST(SUBSTRING(repair_no FROM '-([0-9]+)$') AS INTEGER) as sq FROM repair_orders WHERE repair_no LIKE $1 || '%') SELECT s.val as count FROM generate_series(1, 1000) as s(val) WHERE NOT EXISTS (SELECT 1 FROM seqs WHERE seqs.sq = s.val) ORDER BY s.val ASC LIMIT 1`,
  fetchRepairOrders: `
    SELECT ro.*, u.full_name as creator_name,
           (SELECT COUNT(*) FROM repair_items WHERE repair_id = ro.id) as item_count,
           (SELECT string_agg(COALESCE(ri.brand, '') || ' ' || COALESCE(ri.type, '') || ' ' || COALESCE(ri.model, '') || ' (' || COALESCE(ri.sn, '') || ')', ', ') 
            FROM repair_items ri 
            WHERE ri.repair_id = ro.id) as item_summary,
           (SELECT json_agg(json_build_object(
              'id', ri.id,
              'brand', ri.brand,
              'type', ri.type,
              'model', ri.model,
              'specification', ri.specification,
              'sn', ri.sn,
              'asset_id', ri.asset_id,
              'item_master_id', ri.item_master_id
           )) FROM repair_items ri WHERE ri.repair_id = ro.id) as items
    FROM repair_orders ro
    LEFT JOIN users u ON ro.creator_id = u.id
    ORDER BY ro.created_at DESC, ro.id DESC
  `,
  fetchRepairOrderItems: `
    SELECT ri.*, a.status as asset_status, a.client, a.hostname, a.location
    FROM repair_items ri
    LEFT JOIN assets a ON ri.sn = a.sn
    WHERE ri.repair_id = $1
    ORDER BY ri.id ASC
  `,
  createRepairOrder: `
    INSERT INTO repair_orders (
      repair_no, customer_name, status, on_site_date, on_site_status,
      creator_id, remarks
    ) VALUES ($1, $2, 'ON_SITE_HANDLING', $3, $4, $5, $6)
    RETURNING *
  `,
  createRepairOrderItem: `
    INSERT INTO repair_items (
      repair_id, asset_id, item_master_id, brand, type, model, specification, sn
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `,
  updateRepairSendOEM: `
    UPDATE repair_orders 
    SET status = 'SENT_OEM', 
        send_oem_date = $1, 
        remarks = COALESCE($2, remarks), 
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = $3 
    RETURNING *
  `,
  updateRepairOEMReturn: `
    UPDATE repair_orders 
    SET status = 'OEM_RETURNED', 
        oem_return_date = $1, 
        results = $2, 
        remarks = COALESCE($3, remarks), 
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = $4 
    RETURNING *
  `,
  updateRepairCompleted: `
    UPDATE repair_orders 
    SET status = 'COMPLETED', 
        completion_date = $1, 
        remarks = COALESCE($2, remarks), 
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = $3 
    RETURNING *
  `,
  updateRepairOrderDetails: `
    UPDATE repair_orders 
    SET customer_name = $1, 
        on_site_date = $2, 
        on_site_status = $3, 
        send_oem_date = $4, 
        oem_return_date = $5, 
        results = $6, 
        completion_date = $7, 
        remarks = $8, 
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = $9 
    RETURNING *
  `,
  deleteRepairOrder: `DELETE FROM repair_orders WHERE id = $1`,
  fetchAssetsForRepairSelection: `
    SELECT 
      a.id as asset_id,
      a.sn,
      a.status,
      a.client,
      a.hostname,
      a.location,
      i.id as item_master_id,
      i.brand,
      i.type,
      i.model,
      i.specification,
      c.name as category_name
    FROM assets a
    JOIN item_master i ON a.item_master_id = i.id
    JOIN categories c ON i.category_id = c.id
    WHERE a.sn IS NOT NULL AND a.sn != ''
    ORDER BY a.client ASC, i.brand ASC, a.sn ASC
    LIMIT 2000
  `,
  updateAssetStatusBySn: `
    UPDATE assets 
    SET status = $1, 
        updated_at = CURRENT_TIMESTAMP 
    WHERE TRIM(UPPER(sn)) = TRIM(UPPER($2))
  `
};

