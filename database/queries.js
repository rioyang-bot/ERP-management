export const queries = {
  // AssetList.jsx
  fetchAssetsList: `SELECT a.*, a.id as id, i.id as item_master_id, i.specification, i.type, i.brand, i.model, i.unit, c.name as category_name,
      COALESCE(a.custom_attributes->>'contact_person', p.contact_person) as partner_contact,
      COALESCE(a.custom_attributes->>'contact_phone', p.phone) as partner_phone,
      (SELECT json_agg(json_build_object('brand', hi.brand, 'model', hi.model, 'sn', ha.sn)) 
       FROM assets ha JOIN item_master hi ON ha.item_master_id = hi.id 
       WHERE ha.custom_attributes->>'server_sn' IS NOT NULL AND ha.custom_attributes->>'server_sn' != '' 
       AND a.sn IS NOT NULL AND a.sn != ''
       AND TRIM(ha.custom_attributes->>'server_sn') = TRIM(a.sn)) as components,
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
      WHERE c.name = '設備' ORDER BY i.id DESC`,
  fetchAssetsListByBrand: `SELECT a.*, a.id as id, i.id as item_master_id, i.specification, i.type, i.brand, i.model, i.unit, c.name as category_name,
      COALESCE(a.custom_attributes->>'contact_person', p.contact_person) as partner_contact,
      COALESCE(a.custom_attributes->>'contact_phone', p.phone) as partner_phone,
      (SELECT json_agg(json_build_object('brand', hi.brand, 'model', hi.model, 'sn', ha.sn)) 
       FROM assets ha JOIN item_master hi ON ha.item_master_id = hi.id 
       WHERE ha.custom_attributes->>'server_sn' IS NOT NULL AND ha.custom_attributes->>'server_sn' != '' 
       AND a.sn IS NOT NULL AND a.sn != ''
       AND TRIM(ha.custom_attributes->>'server_sn') = TRIM(a.sn)) as components,
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
      WHERE c.name = '設備' AND i.brand = $1 ORDER BY i.id DESC`,
  deleteAsset: `DELETE FROM assets WHERE id = $1`,
  updateAssetStatus: `UPDATE assets SET status = $1 WHERE id = $2`,
  updateMountedHardwareStatus: `UPDATE assets SET status = $1 WHERE custom_attributes->>'server_sn' = $2`,
  updateItemMasterSpecs: `UPDATE item_master SET specification = $1, model = $2 WHERE id = $3`,
  updateAssetDetails: `UPDATE assets SET sn = $1, client = $2, hostname = $3, location = $4, installed_date = $5, customer_warranty_expire = $6, system_date = $7, warranty_expire = $8, os = $9, nic = $10, custom_attributes = $11 WHERE id = $12`,
  
  // Menu Queries
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
  fetchCustomers: `SELECT name, contact_person as contact, phone FROM partners WHERE partner_type = 'CUSTOMER' AND COALESCE(is_active, TRUE) = true ORDER BY name ASC`,
  
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
  fetchModelsByBrandType: `
      SELECT m.name FROM item_models m JOIN item_types t ON m.type_id = t.id JOIN item_brands b ON t.brand_id = b.id
      WHERE b.name = $1 AND t.name = $2 AND b.category_id = (SELECT id FROM categories WHERE name = '設備') AND t.category_id = (SELECT id FROM categories WHERE name = '設備') ORDER BY m.name ASC`,
  fetchTypesByBrand: `
      SELECT name FROM item_types WHERE category_id = (SELECT id FROM categories WHERE name = '設備') AND brand_id = (SELECT id FROM item_brands WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = '設備')) ORDER BY name ASC`,
  fetchDeviceBrands: `SELECT id, name FROM item_brands WHERE category_id = (SELECT id FROM categories WHERE name = '設備') ORDER BY name ASC`,
  insertDeviceType: `INSERT INTO item_types (category_id, brand_id, name) VALUES ((SELECT id FROM categories WHERE name = $1), (SELECT id FROM item_brands WHERE name = $2 AND category_id = (SELECT id FROM categories WHERE name = $1)), $3) ON CONFLICT DO NOTHING`,
  deleteDeviceType: `DELETE FROM item_types WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = $2) AND brand_id IN (SELECT id FROM item_brands WHERE name = $3 AND category_id = (SELECT id FROM categories WHERE name = $2))`,
  insertDeviceModel: `INSERT INTO item_models (type_id, name) SELECT t.id, $4 FROM item_types t JOIN item_brands b ON t.brand_id = b.id WHERE LOWER(b.name) = LOWER($1) AND LOWER(t.name) = LOWER($2) AND b.category_id = (SELECT id FROM categories WHERE name = $3) ON CONFLICT DO NOTHING`,
  deleteDeviceModel: `DELETE FROM item_models WHERE name = $1 AND type_id IN (SELECT t.id FROM item_types t JOIN item_brands b ON t.brand_id = b.id WHERE LOWER(b.name) = LOWER($2) AND LOWER(t.name) = LOWER($3) AND b.category_id = (SELECT id FROM categories WHERE name = $4))`,
  insertDeviceBrand: `INSERT INTO item_brands (category_id, name) VALUES ((SELECT id FROM categories WHERE name = $1), $2) ON CONFLICT ON CONSTRAINT item_brands_category_id_name_key DO NOTHING`,
  deleteDeviceBrand: `DELETE FROM item_brands WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = $2)`,
  
  findItemMaster: `SELECT id FROM item_master WHERE specification = $1 AND type = $2 AND brand = $3 AND model = $4`,
  insertItemMaster: `INSERT INTO item_master (specification, type, brand, model, unit, category_id, purchase_price) VALUES ($1, $2, $3, $4, $5, (SELECT id FROM categories WHERE name = $6), 0) RETURNING id`,
  insertAssetRecord: `INSERT INTO assets (item_master_id, sn, client, hostname, location, installed_date, customer_warranty_expire, system_date, warranty_expire, os, nic, custom_attributes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,

  // ConsumableList.jsx
  fetchConsumablesList: `SELECT v.*, i.id as id, i.stock_qty, i.lab_qty, c.name as category_name FROM v_inventory_summary v JOIN item_master i ON v.item_id = i.id LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '耗材' ORDER BY i.id DESC`,
  fetchConsumablesListByType: `SELECT v.*, i.id as id, i.stock_qty, i.lab_qty, c.name as category_name FROM v_inventory_summary v JOIN item_master i ON v.item_id = i.id LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '耗材' AND v.type = $1 ORDER BY i.id DESC`,
  deleteConsumableMaster: `DELETE FROM item_master WHERE id = $1`,
  updateConsumableMaster: `UPDATE item_master SET brand = $1, type = $2, model = $3, specification = $4, unit = $5, safety_stock = $6 WHERE id = $7`,
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

  // Consumables.jsx
  fetchRecentConsumables: `SELECT i.* FROM item_master i LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '耗材' ORDER BY i.id DESC LIMIT 10`,
  insertConsumableMaster: `INSERT INTO item_master (specification, type, brand, model, unit, safety_stock, stock_qty, category_id, purchase_price) VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT id FROM categories WHERE name = $8), 0)`,
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
  deletePurchaseRecordById: `DELETE FROM purchase_records WHERE id = $1`,
  fetchSuppliers: `SELECT id, name FROM partners WHERE partner_type = 'SUPPLIER' ORDER BY name ASC`,
  fetchCategories: `SELECT id, name FROM categories`,
  fetchBrandsByCategory: `SELECT name FROM item_brands WHERE category_id = $1 ORDER BY name ASC`,
  updatePurchaseRecordFull: `UPDATE purchase_records SET partner_id = $1, category_id = $2, item_type = $3, brand = $4, model = $5, specification = $6, unit = $7, quantity = $8, remarks = $9, project_name = $10 WHERE id = $11`,
  fetchTypesByCategory: `SELECT name, (SELECT name FROM item_brands WHERE id = t.brand_id) as brand FROM item_types t WHERE category_id = $1 ORDER BY name ASC`,
  fetchModelsByCategory: `
      SELECT m.name as model, t.name as type, b.name as brand, i.specification, i.unit
      FROM item_models m JOIN item_types t ON m.type_id = t.id JOIN item_brands b ON t.brand_id = b.id LEFT JOIN item_master i ON (i.model = m.name AND i.type = t.name AND i.brand = b.name)
      WHERE t.category_id = $1 ORDER BY m.name ASC`,
  countPurchaseOrders: `WITH seqs AS (SELECT CAST(SUBSTRING(order_no FROM '-([0-9]+)$') AS INTEGER) as sq FROM purchase_records WHERE order_no LIKE $1 || '%') SELECT s.val as count FROM generate_series(1, 1000) as s(val) WHERE NOT EXISTS (SELECT 1 FROM seqs WHERE seqs.sq = s.val) ORDER BY s.val ASC LIMIT 1`,
  insertItemBrand: `INSERT INTO item_brands (category_id, name) VALUES ($1, $2)`,
  insertItemType: `INSERT INTO item_types (category_id, name) VALUES ($1, $2)`,
  insertPurchaseRecord: `
      INSERT INTO purchase_records (order_no, partner_id, category_id, item_type, brand, model, specification, unit, quantity, purchaser_id, status, remarks, project_name, unit_price) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0)`,
      
  // ProcurementList.jsx
  fetchProcurementList: `
      SELECT pr.*, p.name as partner_name, c.name as category_name, u.full_name as purchaser_name
      FROM purchase_records pr LEFT JOIN partners p ON pr.partner_id = p.id LEFT JOIN categories c ON pr.category_id = c.id LEFT JOIN users u ON pr.purchaser_id = u.id ORDER BY pr.created_at DESC`,
  deletePurchaseRecordList: `DELETE FROM purchase_records WHERE order_no = $1`,
  updatePurchaseRecordList: `UPDATE purchase_records SET quantity = $1, specification = $2, model = $3, item_type = $4, brand = $5 WHERE id = $6`,

  // Inbound.jsx
  fetchInboundItemMaster: `SELECT i.id, i.specification, i.type, i.brand, i.model, i.unit, c.name as cat_name FROM item_master i LEFT JOIN categories c ON i.category_id = c.id ORDER BY i.id DESC`,
  fetchPendingPurchases: `SELECT pr.*, p.name as partner_name, c.name as category_name FROM purchase_records pr LEFT JOIN partners p ON pr.partner_id = p.id LEFT JOIN categories c ON pr.category_id = c.id WHERE pr.status != 'COMPLETED' ORDER BY pr.created_at DESC`,
  insertInboundItemMaster: `INSERT INTO item_master (specification, type, brand, unit, category_id, purchase_price) VALUES ($1, $2, $3, $4, (SELECT id FROM categories WHERE name = $5), 0) RETURNING id`,
  countInboundOrders: `WITH seqs AS (SELECT CAST(SUBSTRING(order_no FROM '-([0-9]+)$') AS INTEGER) as sq FROM inbound_orders WHERE order_no LIKE $1 || '%') SELECT s.val as count FROM generate_series(1, 1000) as s(val) WHERE NOT EXISTS (SELECT 1 FROM seqs WHERE seqs.sq = s.val) ORDER BY s.val ASC LIMIT 1`,
  insertInboundOrder: `INSERT INTO inbound_orders (order_no, partner_id, invoice_no, status) VALUES ($1, $2, $3, $4) RETURNING id`,
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
  fetchPartners: `SELECT id, partner_type as type, name, contact_person as contact, phone, COALESCE(is_active, TRUE) as is_active FROM partners ORDER BY id DESC`,
  insertPartner: `INSERT INTO partners (partner_type, name, contact_person, phone, is_active) VALUES ($1, $2, $3, $4, TRUE)`,
  updatePartner: `UPDATE partners SET partner_type = $1, name = $2, contact_person = $3, phone = $4 WHERE id = $5`,
  updatePartnerActive: `UPDATE partners SET is_active = $1 WHERE id = $2`,
  deletePartner: `DELETE FROM partners WHERE id = $1`,
  migratePartnersActive: `ALTER TABLE partners ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`,
  initPartnersActive: `UPDATE partners SET is_active = TRUE WHERE is_active IS NULL`,

  // Settings.jsx
  fetchUsers: `SELECT id, username, role, full_name, is_active, menu_access FROM users ORDER BY id ASC`,
  insertUser: `INSERT INTO users (username, password_hash, role, full_name, menu_access) VALUES ($1, $2, $3, $4, $5::jsonb)`,
  updateUserActive: `UPDATE users SET is_active = $1 WHERE id = $2`,
  deleteUser: `DELETE FROM users WHERE id = $1`,
  updateUserAccess: `UPDATE users SET menu_access = $1::jsonb WHERE id = $2`,
  updateUserPassword: `UPDATE users SET password_hash = $1 WHERE id = $2`,

  // NIC Registration & List
  fetchNicBrands: `SELECT id, name FROM item_brands WHERE category_id = (SELECT id FROM categories WHERE name = '硬體') ORDER BY name ASC`,
  fetchNicTypesByBrand: `
      SELECT name FROM item_types WHERE category_id = (SELECT id FROM categories WHERE name = '硬體') AND brand_id = (SELECT id FROM item_brands WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = '硬體')) ORDER BY name ASC`,
  fetchNicModelsByBrandType: `
      SELECT m.name FROM item_models m JOIN item_types t ON m.type_id = t.id JOIN item_brands b ON t.brand_id = b.id
      WHERE b.name = $1 AND t.name = $2 AND b.category_id = (SELECT id FROM categories WHERE name = '硬體') AND t.category_id = (SELECT id FROM categories WHERE name = '硬體') ORDER BY m.name ASC`,
  fetchNicListByType: `
      SELECT a.*, i.specification, i.type, i.brand, i.model, i.unit, 
             s.client as server_client, s.location as server_location,
             s.hostname as server_hostname, s.os as server_os, s.nic as server_nic,
             s.custom_attributes as server_custom_attributes,
             COALESCE(a.custom_attributes->>'contact_person', p.contact_person) as partner_contact,
             COALESCE(a.custom_attributes->>'contact_phone', p.phone) as partner_phone
      FROM assets a 
      JOIN item_master i ON a.item_master_id = i.id 
      LEFT JOIN assets s ON (a.custom_attributes->>'server_sn' = s.sn AND s.sn IS NOT NULL AND s.sn != '')
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
             s.client as server_client, s.location as server_location,
             s.hostname as server_hostname, s.os as server_os, s.nic as server_nic,
             s.custom_attributes as server_custom_attributes,
             COALESCE(a.custom_attributes->>'contact_person', p.contact_person) as partner_contact,
             COALESCE(a.custom_attributes->>'contact_phone', p.phone) as partner_phone
      FROM assets a 
      JOIN item_master i ON a.item_master_id = i.id 
      LEFT JOIN assets s ON (a.custom_attributes->>'server_sn' = s.sn AND s.sn IS NOT NULL AND s.sn != '')
      LEFT JOIN partners p ON a.client = p.name AND (
        (a.custom_attributes->>'contact_person' IS NOT NULL AND p.contact_person = a.custom_attributes->>'contact_person') OR
        (a.custom_attributes->>'contact_person' IS NULL AND p.id = (
             SELECT MIN(id) FROM partners WHERE name = a.client
        ))
      )
      WHERE i.category_id = (SELECT id FROM categories WHERE name = '硬體')
      ORDER BY a.id DESC`,
  updateNicDetails: `UPDATE assets SET sn = $1, client = $2, location = $3, custom_attributes = COALESCE(custom_attributes, '{}'::jsonb) || jsonb_build_object('server_sn', $4::text, 'order_date', $5::text, 'project_name', $8::text), hostname = $6 WHERE id = $7`,
  updateAssetProjectName: `UPDATE assets SET custom_attributes = COALESCE(custom_attributes, '{}'::jsonb) || jsonb_build_object('project_name', $1::text) WHERE id = $2`,
  updateNicSn: `UPDATE assets SET sn = $1 WHERE id = $2`,
  findAssetBySn: `SELECT id FROM assets WHERE TRIM(LOWER(sn)) = TRIM(LOWER($1))`,
  deleteCustomAttributeKey: `UPDATE assets SET custom_attributes = custom_attributes - $1 WHERE custom_attributes ? $1`,
  fetchAssetDetailBySN: `
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
    WHERE TRIM(LOWER(a.sn)) = TRIM(LOWER($1))
  `,
  
  // Outbound Workflow
  countOutboundRequests: `WITH seqs AS (SELECT CAST(SUBSTRING(request_no FROM '-([0-9]+)$') AS INTEGER) as sq FROM outbound_requests WHERE request_no LIKE $1 || '%') SELECT s.val as count FROM generate_series(1, 1000) as s(val) WHERE NOT EXISTS (SELECT 1 FROM seqs WHERE seqs.sq = s.val) ORDER BY s.val ASC LIMIT 1`,
  insertOutboundRequest: `INSERT INTO outbound_requests (request_no, customer, location, shipping_date, status, creator_id, contact_info) VALUES ($1, $2, $3, $4, 'PENDING', $5, $6) RETURNING id`,
  insertOutboundItem: `INSERT INTO outbound_items (request_id, item_id, sn, quantity, location) VALUES ($1, $2, $3, $4, $5)`,
  searchActiveAssetSNs: `
    SELECT a.sn, c.name as category_name, i.brand, i.model 
    FROM assets a 
    JOIN item_master i ON a.item_master_id = i.id 
    LEFT JOIN categories c ON i.category_id = c.id 
    WHERE a.status = 'ACTIVE' AND a.sn IS NOT NULL AND a.sn != '' 
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
    WHERE a.status = 'ACTIVE' AND a.custom_attributes->>'project_name' = $1
  `,
  fetchDNList: `
    SELECT r.*, u.full_name as creator_name, 
           (SELECT COUNT(*) FROM outbound_items WHERE request_id = r.id) as item_count,
           (SELECT a.custom_attributes->>'project_name' 
            FROM outbound_items oi 
            JOIN assets a ON oi.sn = a.sn 
            WHERE oi.request_id = r.id AND a.custom_attributes->>'project_name' IS NOT NULL 
            LIMIT 1) as project_name
    FROM outbound_requests r
    LEFT JOIN users u ON r.creator_id = u.id
    ORDER BY r.created_at DESC
  `,
  fetchDNItems: `
    SELECT oi.*, i.brand, i.model, i.specification, i.type, i.unit, c.name as category_name
    FROM outbound_items oi
    JOIN item_master i ON oi.item_id = i.id
    LEFT JOIN categories c ON i.category_id = c.id
    WHERE oi.request_id = $1
    ORDER BY oi.id ASC
  `,
  checkItemStock: `SELECT stock_qty FROM item_master WHERE id = $1`,
  checkAssetActive: `SELECT status FROM assets WHERE sn = $1`,
  updateStockQtyOnOutbound: `UPDATE item_master SET stock_qty = stock_qty - $1 WHERE id = $2 AND stock_qty >= $1`,
  updateAssetStatusAndLocationBySn: `UPDATE assets SET status = $1, location = $2 WHERE sn = $3`,
  updateOutboundRequestStatus: `UPDATE outbound_requests SET status = $1 WHERE id = $2`,
  deleteOutboundRequest: `DELETE FROM outbound_requests WHERE id = $1`,
  
  // --- Projects ---
  fetchProjects: `SELECT * FROM projects ORDER BY created_at DESC`,
  createProject: `INSERT INTO projects (project_no, customer_name, customer_contact, name, start_date, end_date, remarks, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
  updateProject: `UPDATE projects SET customer_name = $1, customer_contact = $2, name = $3, start_date = $4, end_date = $5, remarks = $6, status = $7, documents = $8, updated_at = CURRENT_TIMESTAMP WHERE id = $9 RETURNING *`,
  deleteProject: `DELETE FROM projects WHERE id = $1`,

  // --- PJ Report (專案進出報表) ---
  fetchPJReportData: `
    SELECT 
      pr.id,
      pr.order_no,
      pr.project_name,
      pr.item_type,
      pr.brand,
      pr.model,
      pr.specification,
      pr.unit,
      pr.unit_price,
      pr.quantity as po_quantity,
      COALESCE(pr.received_quantity, 0) as inbound_quantity,
      (pr.quantity - COALESCE(pr.received_quantity, 0)) as pending_inbound_quantity,
      pr.status as po_status,
      pr.remarks,
      pr.created_at,
      p.name as partner_name,
      c.name as category_name,
      u.full_name as purchaser_name,
      proj.project_no,
      proj.customer_name as project_customer,
      proj.customer_contact as project_contact,
      proj.status as project_status,
      COALESCE((
        SELECT SUM(oi.quantity)
        FROM outbound_items oi
        JOIN outbound_requests o ON oi.request_id = o.id
        WHERE o.status = 'SHIPPED'
        AND (
          (oi.sn IS NOT NULL AND oi.sn != '' AND oi.sn IN (
            SELECT sn FROM inbound_items WHERE purchase_record_id = pr.id AND sn IS NOT NULL AND sn != ''
          ))
          OR
          (
            pr.project_name IS NOT NULL AND pr.project_name != '' AND
            EXISTS (
              SELECT 1 FROM assets a 
              WHERE a.sn = oi.sn 
              AND a.custom_attributes->>'project_name' = pr.project_name
              AND a.item_master_id = oi.item_id
              AND oi.item_id IN (SELECT item_id FROM inbound_items WHERE purchase_record_id = pr.id)
            )
          )
        )
      ), 0) as outbound_quantity,
      (
        SELECT json_agg(json_build_object(
          'inbound_order_no', io.order_no,
          'order_date', io.order_date,
          'quantity', ii.quantity,
          'sn', ii.sn,
          'status', io.status
        ))
        FROM inbound_items ii
        JOIN inbound_orders io ON ii.inbound_order_id = io.id
        WHERE ii.purchase_record_id = pr.id
      ) as inbound_history,
      (
        SELECT json_agg(json_build_object(
          'request_no', o.request_no,
          'customer', o.customer,
          'shipping_date', o.shipping_date,
          'status', o.status,
          'sn', oi.sn,
          'quantity', oi.quantity
        ))
        FROM outbound_items oi
        JOIN outbound_requests o ON oi.request_id = o.id
        WHERE (
          (oi.sn IS NOT NULL AND oi.sn != '' AND oi.sn IN (
            SELECT sn FROM inbound_items WHERE purchase_record_id = pr.id AND sn IS NOT NULL AND sn != ''
          ))
          OR
          (
            pr.project_name IS NOT NULL AND pr.project_name != '' AND
            EXISTS (
              SELECT 1 FROM assets a 
              WHERE a.sn = oi.sn 
              AND a.custom_attributes->>'project_name' = pr.project_name
              AND a.item_master_id = oi.item_id
              AND oi.item_id IN (SELECT item_id FROM inbound_items WHERE purchase_record_id = pr.id)
            )
          )
        )
      ) as outbound_history
    FROM purchase_records pr
    LEFT JOIN partners p ON pr.partner_id = p.id
    LEFT JOIN categories c ON pr.category_id = c.id
    LEFT JOIN users u ON pr.purchaser_id = u.id
    LEFT JOIN projects proj ON (
      pr.project_name IS NOT NULL AND (
        pr.project_name = proj.name OR 
        pr.project_name = proj.project_no || ' ' || proj.name OR
        pr.project_name LIKE '%' || proj.project_no || '%'
      )
    )
    ORDER BY pr.created_at DESC
  `
};
