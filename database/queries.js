export const queries = {
  // AssetList.jsx
  fetchAssetsList: `SELECT a.*, a.id as id, i.id as item_master_id, i.specification, i.type, i.brand, i.model, i.unit, c.name as category_name 
      FROM assets a JOIN item_master i ON a.item_master_id = i.id LEFT JOIN categories c ON i.category_id = c.id 
      WHERE c.name = '資訊設備' ORDER BY i.id DESC`,
  fetchAssetsListByBrand: `SELECT a.*, a.id as id, i.id as item_master_id, i.specification, i.type, i.brand, i.model, i.unit, c.name as category_name 
      FROM assets a JOIN item_master i ON a.item_master_id = i.id LEFT JOIN categories c ON i.category_id = c.id 
      WHERE c.name = '資訊設備' AND i.brand = $1 ORDER BY i.id DESC`,
  deleteAsset: `DELETE FROM assets WHERE id = $1`,
  updateAssetStatus: `UPDATE assets SET status = $1 WHERE id = $2`,
  updateItemMasterSpecs: `UPDATE item_master SET specification = $1, model = $2 WHERE id = $3`,
  updateAssetDetails: `UPDATE assets SET sn = $1, client = $2, hostname = $3, location = $4, installed_date = $5, customer_warranty_expire = $6, system_date = $7, warranty_expire = $8, os = $9, nic = $10, custom_attributes = $11 WHERE id = $12`,
  
  // Menu Queries
  fetchMenuAssetBrands: `SELECT DISTINCT i.brand FROM assets a JOIN item_master i ON a.item_master_id = i.id LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '資訊設備' ORDER BY i.brand ASC`,
  fetchMenuConsumableTypes: `SELECT DISTINCT i.type FROM item_master i LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '辦公耗材' ORDER BY i.type ASC`,
  fetchMenuNicTypes: `SELECT DISTINCT i.type FROM item_master i LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '網卡' ORDER BY i.type ASC`,
  
  // Dashboard / Misc
  getSystemSetting: `SELECT value FROM system_settings WHERE key = $1`,
  upsertSystemSetting: `INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  
  // Dashboard / Misc
  fetchCustomers: `SELECT name FROM partners WHERE partner_type = 'CUSTOMER' ORDER BY name ASC`,
  
  // Assets.jsx
  fetchRecentAssets: `
      SELECT a.*, i.specification, i.type, i.brand, i.model, i.unit, c.name as category_name 
      FROM assets a JOIN item_master i ON a.item_master_id = i.id LEFT JOIN categories c ON i.category_id = c.id 
      WHERE c.name = '資訊設備' ORDER BY a.id DESC LIMIT 10`,
  fetchModelsByBrandType: `
      SELECT m.name FROM item_models m JOIN item_types t ON m.type_id = t.id JOIN item_brands b ON t.brand_id = b.id
      WHERE b.name = $1 AND t.name = $2 AND b.category_id = (SELECT id FROM categories WHERE name = '資訊設備') AND t.category_id = (SELECT id FROM categories WHERE name = '資訊設備') ORDER BY m.name ASC`,
  fetchTypesByBrand: `
      SELECT name FROM item_types WHERE category_id = (SELECT id FROM categories WHERE name = '資訊設備') AND brand_id = (SELECT id FROM item_brands WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = '資訊設備')) ORDER BY name ASC`,
  fetchDeviceBrands: `SELECT id, name FROM item_brands WHERE category_id = (SELECT id FROM categories WHERE name = '資訊設備') ORDER BY name ASC`,
  insertDeviceType: `INSERT INTO item_types (category_id, brand_id, name) VALUES ((SELECT id FROM categories WHERE name = $1), (SELECT id FROM item_brands WHERE name = $2 AND category_id = (SELECT id FROM categories WHERE name = $1)), $3)`,
  deleteDeviceType: `DELETE FROM item_types WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = $2) AND brand_id IN (SELECT id FROM item_brands WHERE name = $3 AND category_id = (SELECT id FROM categories WHERE name = $2))`,
  insertDeviceModel: `INSERT INTO item_models (type_id, name) SELECT t.id, $4 FROM item_types t JOIN item_brands b ON t.brand_id = b.id WHERE LOWER(b.name) = LOWER($1) AND LOWER(t.name) = LOWER($2) AND b.category_id = (SELECT id FROM categories WHERE name = $3) LIMIT 1`,
  deleteDeviceModel: `DELETE FROM item_models WHERE name = $1 AND type_id IN (SELECT t.id FROM item_types t JOIN item_brands b ON t.brand_id = b.id WHERE LOWER(b.name) = LOWER($2) AND LOWER(t.name) = LOWER($3) AND b.category_id = (SELECT id FROM categories WHERE name = $4))`,
  insertDeviceBrand: `INSERT INTO item_brands (category_id, name) VALUES ((SELECT id FROM categories WHERE name = $1), $2)`,
  deleteDeviceBrand: `DELETE FROM item_brands WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = $2)`,
  
  findItemMaster: `SELECT id FROM item_master WHERE specification = $1 AND type = $2 AND brand = $3 AND model = $4`,
  insertItemMaster: `INSERT INTO item_master (specification, type, brand, model, unit, category_id, purchase_price) VALUES ($1, $2, $3, $4, $5, (SELECT id FROM categories WHERE name = $6), 0) RETURNING id`,
  insertAssetRecord: `INSERT INTO assets (item_master_id, sn, client, hostname, location, installed_date, customer_warranty_expire, system_date, warranty_expire, os, nic, custom_attributes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,

  // ConsumableList.jsx
  fetchConsumablesList: `SELECT v.*, i.id as id, c.name as category_name FROM v_inventory_summary v JOIN item_master i ON v.item_id = i.id LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '辦公耗材' ORDER BY i.id DESC`,
  fetchConsumablesListByType: `SELECT v.*, i.id as id, c.name as category_name FROM v_inventory_summary v JOIN item_master i ON v.item_id = i.id LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '辦公耗材' AND v.type = $1 ORDER BY i.id DESC`,
  deleteConsumableMaster: `DELETE FROM item_master WHERE id = $1`,
  updateConsumableMaster: `UPDATE item_master SET brand = $1, type = $2, model = $3, specification = $4, unit = $5, safety_stock = $6 WHERE id = $7`,

  // Consumables.jsx
  fetchRecentConsumables: `SELECT i.* FROM item_master i LEFT JOIN categories c ON i.category_id = c.id WHERE c.name = '辦公耗材' ORDER BY i.id DESC LIMIT 10`,
  insertConsumableMaster: `INSERT INTO item_master (specification, type, brand, model, unit, safety_stock, category_id, purchase_price) VALUES ($1, $2, $3, $4, $5, $6, (SELECT id FROM categories WHERE name = $7), 0)`,
  fetchConsumableModelsByBrandType: `
      SELECT m.name FROM item_models m JOIN item_types t ON m.type_id = t.id JOIN item_brands b ON t.brand_id = b.id
      WHERE b.name = $1 AND t.name = $2 AND b.category_id = (SELECT id FROM categories WHERE name = '辦公耗材') AND t.category_id = (SELECT id FROM categories WHERE name = '辦公耗材') ORDER BY m.name ASC`,
  fetchConsumableTypesByBrand: `
      SELECT name FROM item_types WHERE category_id = (SELECT id FROM categories WHERE name = '辦公耗材') AND brand_id = (SELECT id FROM item_brands WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = '辦公耗材')) ORDER BY name ASC`,
  fetchConsumableBrands: `SELECT id, name FROM item_brands WHERE category_id = (SELECT id FROM categories WHERE name = '辦公耗材') ORDER BY name ASC`,

  // Purchasing.jsx
  fetchPurchasingRecords: `
      SELECT pr.*, p.name as partner_name, c.name as category_name, u.full_name as purchaser_name
      FROM purchase_records pr LEFT JOIN partners p ON pr.partner_id = p.id LEFT JOIN categories c ON pr.category_id = c.id LEFT JOIN users u ON pr.purchaser_id = u.id ORDER BY pr.created_at DESC LIMIT 10`,
  fetchSuppliers: `SELECT id, name FROM partners WHERE partner_type = 'SUPPLIER' ORDER BY name ASC`,
  fetchCategories: `SELECT id, name FROM categories`,
  fetchBrandsByCategory: `SELECT name FROM item_brands WHERE category_id = $1 ORDER BY name ASC`,
  fetchTypesByCategory: `SELECT name, (SELECT name FROM item_brands WHERE id = t.brand_id) as brand FROM item_types t WHERE category_id = $1 ORDER BY name ASC`,
  fetchModelsByCategory: `
      SELECT m.name as model, t.name as type, b.name as brand, i.specification, i.unit
      FROM item_models m JOIN item_types t ON m.type_id = t.id JOIN item_brands b ON t.brand_id = b.id LEFT JOIN items i ON (i.model = m.name AND i.type = t.name AND i.brand = b.name)
      WHERE t.category_id = $1 ORDER BY m.name ASC`,
  countPurchaseOrders: `SELECT COUNT(DISTINCT order_no) as count FROM purchase_records WHERE order_no LIKE $1`,
  insertItemBrand: `INSERT INTO item_brands (category_id, name) VALUES ($1, $2)`,
  insertItemType: `INSERT INTO item_types (category_id, name) VALUES ($1, $2)`,
  insertPurchaseRecord: `
      INSERT INTO purchase_records (order_no, partner_id, category_id, item_type, brand, model, specification, unit, quantity, purchaser_id, status, remarks, unit_price) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0)`,
      
  // ProcurementList.jsx
  fetchProcurementList: `
      SELECT pr.*, p.name as partner_name, c.name as category_name, u.full_name as purchaser_name
      FROM purchase_records pr LEFT JOIN partners p ON pr.partner_id = p.id LEFT JOIN categories c ON pr.category_id = c.id LEFT JOIN users u ON pr.purchaser_id = u.id ORDER BY pr.created_at DESC`,
  deletePurchaseRecordList: `DELETE FROM purchase_records WHERE order_no = $1`,
  updatePurchaseRecordList: `UPDATE purchase_records SET quantity = $1, specification = $2, model = $3, item_type = $4, brand = $5 WHERE id = $6`,

  // Inbound.jsx
  fetchInboundItemMaster: `SELECT i.id, i.specification, i.type, i.brand, i.unit, c.name as cat_name FROM item_master i LEFT JOIN categories c ON i.category_id = c.id ORDER BY i.id DESC`,
  fetchPendingPurchases: `SELECT pr.*, p.name as partner_name, c.name as category_name FROM purchase_records pr LEFT JOIN partners p ON pr.partner_id = p.id LEFT JOIN categories c ON pr.category_id = c.id WHERE pr.status != 'COMPLETED' ORDER BY pr.created_at DESC`,
  insertInboundItemMaster: `INSERT INTO item_master (specification, type, brand, unit, category_id, purchase_price) VALUES ($1, $2, $3, $4, (SELECT id FROM categories WHERE name = $5), 0) RETURNING id`,
  insertInboundOrder: `INSERT INTO inbound_orders (order_no, partner_id, invoice_no, status) VALUES ($1, $2, $3, $4) RETURNING id`,
  insertInboundAssets: `INSERT INTO assets (sn, item_master_id, status) VALUES ($1, $2, 'ACTIVE')`,
  insertInboundItems: `INSERT INTO inbound_items (inbound_order_id, item_id, sn, quantity, purchase_record_id, unit_price) VALUES ($1, $2, $3, $4, $5, 0)`,
  updatePurchaseRecordStatus: `UPDATE purchase_records SET received_quantity = COALESCE(received_quantity, 0) + $1, status = CASE WHEN COALESCE(received_quantity, 0) + $1 >= quantity THEN 'COMPLETED' ELSE 'PARTIAL' END, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,

  // MainLayout.jsx
  fetchMenuAssetBrands: `SELECT DISTINCT i.brand FROM assets a JOIN item_master i ON a.item_master_id = i.id JOIN categories c ON i.category_id = c.id WHERE c.name = '資訊設備' ORDER BY i.brand ASC`,
  fetchMenuConsumableTypes: `SELECT DISTINCT i.type FROM item_master i JOIN categories c ON i.category_id = c.id WHERE c.name = '辦公耗材' ORDER BY i.type ASC`,
  fetchMenuNicTypes: `SELECT DISTINCT i.type FROM assets a JOIN item_master i ON a.item_master_id = i.id JOIN categories c ON i.category_id = c.id WHERE c.name = '網卡' ORDER BY i.type ASC`,

  // Inventory.jsx
  fetchInventorySummary: `SELECT item_id as id, master_sn as sn, item_name as name, safety_stock, physical_qty, locked_qty, available_qty FROM v_inventory_summary`,

  // Partners.jsx
  fetchPartners: `SELECT id, partner_type as type, name, contact_person as contact, phone FROM partners ORDER BY id DESC`,
  insertPartner: `INSERT INTO partners (partner_type, name, contact_person, phone) VALUES ($1, $2, $3, $4)`,
  deletePartner: `DELETE FROM partners WHERE id = $1`,

  // Settings.jsx
  fetchUsers: `SELECT id, username, role, full_name, is_active, menu_access FROM users ORDER BY id ASC`,
  insertUser: `INSERT INTO users (username, password_hash, role, full_name, menu_access) VALUES ($1, $2, $3, $4, $5)`,
  updateUserActive: `UPDATE users SET is_active = $1 WHERE id = $2`,
  deleteUser: `DELETE FROM users WHERE id = $1`,
  updateUserAccess: `UPDATE users SET menu_access = $1 WHERE id = $2`,

  // NIC Registration & List
  fetchNicBrands: `SELECT id, name FROM item_brands WHERE category_id = (SELECT id FROM categories WHERE name = '網卡') ORDER BY name ASC`,
  fetchNicTypesByBrand: `
      SELECT name FROM item_types WHERE category_id = (SELECT id FROM categories WHERE name = '網卡') AND brand_id = (SELECT id FROM item_brands WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = '網卡')) ORDER BY name ASC`,
  fetchNicModelsByBrandType: `
      SELECT m.name FROM item_models m JOIN item_types t ON m.type_id = t.id JOIN item_brands b ON t.brand_id = b.id
      WHERE b.name = $1 AND t.name = $2 AND b.category_id = (SELECT id FROM categories WHERE name = '網卡') AND t.category_id = (SELECT id FROM categories WHERE name = '網卡') ORDER BY m.name ASC`,
  fetchNicList: `
      SELECT a.*, i.specification, i.type, i.brand, i.model, i.unit, 
             s.client as server_client, s.location as server_location,
             s.hostname as server_hostname, s.os as server_os, s.nic as server_nic,
             s.custom_attributes as server_custom_attributes
      FROM assets a 
      JOIN item_master i ON a.item_master_id = i.id 
      LEFT JOIN assets s ON (a.custom_attributes->>'server_sn' = s.sn AND s.sn IS NOT NULL AND s.sn != '')
      WHERE i.category_id = (SELECT id FROM categories WHERE name = '網卡')
      ORDER BY a.id DESC`,
  updateNicDetails: `UPDATE assets SET sn = $1, client = $2, location = $3, custom_attributes = COALESCE(custom_attributes, '{}'::jsonb) || jsonb_build_object('server_sn', $4::text, 'order_date', $5::text) WHERE id = $6`,
  updateNicSn: `UPDATE assets SET sn = $1 WHERE id = $2`
};
