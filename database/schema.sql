-- 系統設定表：用於儲存資料庫版本等系統層級設定
CREATE TABLE IF NOT EXISTS system_configs (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 初始化目前資料庫版本
INSERT INTO system_configs (key, value, description) 
VALUES ('db_version', '1.0.0', '系統資料庫初始版本') 
ON CONFLICT (key) DO NOTHING;

-- 類別主檔
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 品項類型 (Item Types - 例如：筆電, 伺服器, 文具)
CREATE TABLE IF NOT EXISTS item_types (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, name)
);

-- 品項廠牌 (Item Brands - 例如：Apple, Dell, Double A)
CREATE TABLE IF NOT EXISTS item_brands (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, name)
);

-- 客戶與供應商主檔
CREATE TABLE IF NOT EXISTS partners (
    id SERIAL PRIMARY KEY,
    partner_type VARCHAR(20) NOT NULL CHECK (partner_type IN ('CUSTOMER', 'SUPPLIER')),
    name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(100),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 資產與品項主檔
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    sn VARCHAR(100) UNIQUE NOT NULL, -- 序號 (資產類必填)
    specification TEXT NOT NULL,     -- 規格 (原資產名稱)
    type VARCHAR(100),               -- 類型
    brand VARCHAR(100),              -- 廠牌
    custodian VARCHAR(100),          -- 保管人 (新加入)
    unit VARCHAR(20) DEFAULT '個',    -- 單位 (新加入，如：個, 支, 包)
    safety_stock INTEGER DEFAULT 0,  -- 安全水位 (耗材類仍可使用)
    purchase_price DECIMAL(15, 2),   -- 採購單價
    currency VARCHAR(10) DEFAULT 'TWD', -- 幣別
    image_path TEXT,                 -- 圖片路徑
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 進貨單主檔 (Inbound Orders)
CREATE TABLE IF NOT EXISTS inbound_orders (
    id SERIAL PRIMARY KEY,
    order_no VARCHAR(50) UNIQUE NOT NULL, -- 單號 (例: IN-20260415-001)
    partner_id INTEGER REFERENCES partners(id), -- 供應商
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amount DECIMAL(15, 2) DEFAULT 0,
    invoice_image_path TEXT,              -- 發票圖檔路徑 (新加入)
    status VARCHAR(20) DEFAULT 'DRAFT', -- DRAFT, COMPLETED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 進貨單明細 (Inbound Items)
CREATE TABLE IF NOT EXISTS inbound_items (
    id SERIAL PRIMARY KEY,
    inbound_order_id INTEGER REFERENCES inbound_orders(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id),
    sn VARCHAR(100), -- 若是設備類可以填入批次 SN
    unit_price DECIMAL(15, 2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 預留：出庫申請單 (Outbound Requests) -> 用於計算鎖定數量
CREATE TABLE IF NOT EXISTS outbound_requests (
    id SERIAL PRIMARY KEY,
    request_no VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING (鎖定中), SHIPPED (已出貨)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 預留：出庫申請明細
CREATE TABLE IF NOT EXISTS outbound_items (
    id SERIAL PRIMARY KEY,
    request_id INTEGER REFERENCES outbound_requests(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id),
    quantity INTEGER NOT NULL DEFAULT 1
);

-- 即時庫存摘要視圖 (Inventory Dashboard Core)
CREATE OR REPLACE VIEW v_inventory_summary AS
SELECT 
    i.id AS item_id,
    i.sn AS master_sn,
    i.specification AS item_name, -- 舊的 item_name 現在對應到新的規格欄位
    i.type,
    i.brand,
    i.specification,
    i.custodian,
    i.unit,
    i.safety_stock,
    i.purchase_price,
    i.currency,
    i.image_path,
    -- 實體庫存 (Physical Qty) = 總進貨 - 總出貨
    COALESCE(inbound.total_in, 0) - COALESCE(outbound.total_shipped, 0) AS physical_qty,
    -- 鎖定數量 (Locked Qty) = 申請中但尚未出貨
    COALESCE(outbound.total_locked, 0) AS locked_qty,
    -- 可用庫存 (Available Qty) = 實體庫存 - 鎖定數量
    (COALESCE(inbound.total_in, 0) - COALESCE(outbound.total_shipped, 0)) - COALESCE(outbound.total_locked, 0) AS available_qty
FROM items i
LEFT JOIN (
    SELECT item_id, SUM(quantity) as total_in 
    FROM inbound_items 
    JOIN inbound_orders io ON inbound_items.inbound_order_id = io.id
    WHERE io.status = 'COMPLETED'
    GROUP BY item_id
) inbound ON i.id = inbound.item_id
LEFT JOIN (
    SELECT 
        oi.item_id,
        SUM(CASE WHEN o.status = 'SHIPPED' THEN oi.quantity ELSE 0 END) as total_shipped,
        SUM(CASE WHEN o.status = 'PENDING' THEN oi.quantity ELSE 0 END) as total_locked
    FROM outbound_items oi
    JOIN outbound_requests o ON oi.request_id = o.id
    GROUP BY oi.item_id
) outbound ON i.id = outbound.item_id;

-- 稽核日誌 (Audit Logs)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_role VARCHAR(50) NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    target_id INTEGER,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 系統使用者表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('IT', 'WAREHOUSE', 'ADMIN')),
    full_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 初始化預設系統管理員 (ADMIN)
INSERT INTO users (username, password_hash, role, full_name) 
VALUES ('admin', 'admin_hash_placeholder', 'ADMIN', '系統與帳號管理員')
ON CONFLICT (username) DO NOTHING;


-- 初始化常用資產類型
INSERT INTO item_types (category_id, name)
SELECT c.id, t.name FROM categories c
CROSS JOIN (
    SELECT '筆記型電腦' as name UNION ALL
    SELECT '桌上型電腦' UNION ALL
    SELECT '伺服器' UNION ALL
    SELECT '螢幕/顯示器' UNION ALL
    SELECT '網路設備' UNION ALL
    SELECT '周邊設備' UNION ALL
    SELECT '其他'
) t
WHERE c.name = '資訊設備'
ON CONFLICT DO NOTHING;

-- 初始化常用耗材類型
INSERT INTO item_types (category_id, name)
SELECT c.id, t.name FROM categories c
CROSS JOIN (
    SELECT '紙張' as name UNION ALL
    SELECT '文具' UNION ALL
    SELECT '墨水/碳粉' UNION ALL
    SELECT '清潔用品' UNION ALL
    SELECT '其他'
) t
WHERE c.name = '辦公耗材'
ON CONFLICT DO NOTHING;

-- 初始化常用資產廠牌
INSERT INTO item_brands (category_id, name)
SELECT c.id, t.name FROM categories c
CROSS JOIN (
    SELECT 'Apple' as name UNION ALL
    SELECT 'Dell' UNION ALL
    SELECT 'HP' UNION ALL
    SELECT 'Lenovo' UNION ALL
    SELECT 'ASUS' UNION ALL
    SELECT 'Acer' UNION ALL
    SELECT 'MSI' UNION ALL
    SELECT 'Cisco' UNION ALL
    SELECT 'Logi' UNION ALL
    SELECT '其他'
) t
WHERE c.name = '資訊設備'
ON CONFLICT DO NOTHING;

-- 初始化常用耗材廠牌
INSERT INTO item_brands (category_id, name)
SELECT c.id, t.name FROM categories c
CROSS JOIN (
    SELECT 'Double A' as name UNION ALL
    SELECT '3M' UNION ALL
    SELECT 'HP' UNION ALL
    SELECT 'Epson' UNION ALL
    SELECT 'Brother' UNION ALL
    SELECT 'Pilot' UNION ALL
    SELECT 'Pentel' UNION ALL
    SELECT '其他'
) t
WHERE c.name = '辦公耗材'
ON CONFLICT DO NOTHING;
