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

-- 品項廠牌 (Item Brands - 例如：Apple, Dell, Double A)
CREATE TABLE IF NOT EXISTS item_brands (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, name)
);

-- 品項類型 (Item Types - 例如：筆電, 伺服器, 文具)
CREATE TABLE IF NOT EXISTS item_types (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    brand_id INTEGER REFERENCES item_brands(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, brand_id, name)
);

-- 品項型號 (Item Models)
CREATE TABLE IF NOT EXISTS item_models (
    id SERIAL PRIMARY KEY,
    type_id INTEGER REFERENCES item_types(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type_id, name)
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

-- 系統使用者表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('IT', 'WAREHOUSE', 'ADMIN')),
    full_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    menu_access JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 初始化預設系統管理員 (ADMIN)
INSERT INTO users (username, password_hash, role, full_name) 
VALUES ('METECH', 'admin_hash_placeholder', 'ADMIN', '系統與帳號管理員')
ON CONFLICT (username) DO NOTHING;

-- 品項主檔 (SKU Master)
CREATE TABLE IF NOT EXISTS item_master (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    specification TEXT NOT NULL,     -- 規格 
    type VARCHAR(100),               -- 類型
    brand VARCHAR(100),              -- 廠牌
    model VARCHAR(100),              -- 型號
    custodian VARCHAR(100),          -- 保管人
    unit VARCHAR(20) DEFAULT '個',    -- 單位
    stock_qty INTEGER DEFAULT 0,     -- 實體庫存
    lab_qty INTEGER DEFAULT 0,       -- 實驗室庫存
    safety_stock INTEGER DEFAULT 0,  -- 安全水位
    purchase_price DECIMAL(15, 2),   -- 採購單價
    currency VARCHAR(10) DEFAULT 'TWD', -- 幣別
    image_path TEXT,                 -- 圖片路徑
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 資產實體 (Asset Instances)
CREATE TABLE IF NOT EXISTS assets (
    id SERIAL PRIMARY KEY,
    item_master_id INTEGER REFERENCES item_master(id) ON DELETE CASCADE,
    sn VARCHAR(100) UNIQUE, -- 序號 (唯一列管，為支援無SN設備可為空)
    hostname VARCHAR(100),           -- 主機名稱
    client VARCHAR(100),             -- 客戶
    location VARCHAR(100),           -- 地點
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, BROKEN, PENDING, SHIPPED, LENT
    ownership VARCHAR(20) DEFAULT 'FOR_SALE', -- FOR_SALE, COMPANY
    installed_date DATE,             -- 安裝日期
    system_date DATE,                -- 系統日期
    warranty_expire DATE,            -- 保固到期
    customer_warranty_expire DATE,   -- 客戶保固到期
    os VARCHAR(255),                 -- 作業系統
    nic VARCHAR(255),                -- 網卡類型/IP
    custom_attributes JSONB DEFAULT '{}'::jsonb, -- 動態屬性 (例如MAC、其他外掛設備)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 實驗室耗材借用 (Item Lab Assignments)
CREATE TABLE IF NOT EXISTS item_lab_assignments (
    id SERIAL PRIMARY KEY,
    item_master_id INTEGER REFERENCES item_master(id) ON DELETE CASCADE,
    asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    note TEXT,
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
    item_id INTEGER REFERENCES item_master(id) ON DELETE CASCADE,
    sn VARCHAR(100), -- 若是設備類可以填入批次 SN
    unit_price DECIMAL(15, 2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 出庫申請單 (Outbound Requests)
CREATE TABLE IF NOT EXISTS outbound_requests (
    id SERIAL PRIMARY KEY,
    request_no VARCHAR(50) UNIQUE NOT NULL,
    request_type VARCHAR(20) DEFAULT 'SALE', -- SALE (一般出貨), LEND (借出)
    customer VARCHAR(100),
    location TEXT,
    shipping_date DATE DEFAULT CURRENT_DATE,
    expected_return_date DATE,            -- 預計歸還日 (LEND 用)
    actual_return_date DATE,              -- 實際歸還入庫日 (LEND 用)
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING (鎖定中), SHIPPED (已出貨)
    creator_id INTEGER REFERENCES users(id),
    contact_info VARCHAR(255),            -- 聯絡人資訊
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 出庫申請明細 (Outbound Items)
CREATE TABLE IF NOT EXISTS outbound_items (
    id SERIAL PRIMARY KEY,
    request_id INTEGER REFERENCES outbound_requests(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES item_master(id) ON DELETE CASCADE,
    sn VARCHAR(100), -- 記錄出貨的序號
    quantity INTEGER NOT NULL DEFAULT 1
);

-- 採購紀錄表 (Purchase Records)
CREATE TABLE IF NOT EXISTS purchase_records (
    id SERIAL PRIMARY KEY,
    order_no VARCHAR(50) NOT NULL, -- 採購單號
    partner_id INTEGER REFERENCES partners(id), -- 供應商
    category_id INTEGER REFERENCES categories(id), -- 資產或耗材
    project_name VARCHAR(100),           -- 專案名稱
    item_type VARCHAR(100),              -- 類型 (Type)
    brand VARCHAR(100),                  -- 廠牌 (Brand)
    model VARCHAR(100),                  -- 型號 (Model)
    specification TEXT,                  -- 規格 (Specification)
    unit VARCHAR(20),                    -- 單位 (Unit)
    unit_price DECIMAL(15, 2) NOT NULL,    -- 採購單價
    quantity INTEGER NOT NULL DEFAULT 1,   -- 採購數量
    received_quantity INTEGER DEFAULT 0,  -- 已入庫數量
    status VARCHAR(20) DEFAULT 'ORDERED', -- ORDERED, PARTIAL, COMPLETED
    purchaser_id INTEGER REFERENCES users(id), -- 採購人員
    remarks TEXT,                        -- 備註
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 即時庫存摘要視圖 (Inventory Dashboard Core)
CREATE OR REPLACE VIEW v_inventory_summary AS
SELECT 
    i.id AS item_id,
    null AS master_sn,
    i.specification AS item_name, -- 舊的 item_name 現在對應到新的規格欄位
    i.type,
    i.brand,
    i.model,
    i.specification,
    i.custodian,
    i.unit,
    i.safety_stock,
    i.purchase_price,
    i.currency,
    i.image_path,
    -- 實體庫存 (Physical Qty) 直接採用 item_master 內的 stock_qty
    COALESCE(i.stock_qty, 0) AS physical_qty,
    -- 鎖定數量 (Locked Qty) = 申請中但尚未出貨
    COALESCE(outbound.total_locked, 0) AS locked_qty,
    -- 可用庫存 (Available Qty) = 目前庫存 - 鎖定數量
    COALESCE(i.stock_qty, 0) - COALESCE(outbound.total_locked, 0) AS available_qty
FROM item_master i
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



-- 初始化基礎類別
INSERT INTO categories (name, description) VALUES 
('設備', '需要序號列管的IT資產'),
('耗材', '免序號的消耗性質物品'),
('硬體', '搭載在設備上的零組件網卡等')
ON CONFLICT (name) DO NOTHING;

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
WHERE c.name = '設備'
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
WHERE c.name = '耗材'
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
WHERE c.name = '設備'
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
    SELECT '其他'
) t
WHERE c.name = '耗材'
ON CONFLICT DO NOTHING;

-- 專案主檔 (Projects)
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    project_no VARCHAR(50) UNIQUE NOT NULL,
    customer_name VARCHAR(100),
    customer_contact VARCHAR(100),
    name VARCHAR(100) NOT NULL,
    start_date DATE,
    end_date DATE,
    remarks TEXT,
    status VARCHAR(20) DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'CLOSED')),
    documents JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

