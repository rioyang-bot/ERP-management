-- ============================================================================
-- 客戶換貨單
-- ----------------------------------------------------------------------------
-- 客戶拿東西來換別的（例如 10G-LR 換成 10G-SR）。換回的一律是良品，直接回在庫；
-- 換出的自動產生一張已出貨的出貨單（可列印交貨簽收單）。
--
-- 換回的不開進貨單：進貨單是向廠商採購用的（廠商、單價、採購紀錄），
-- 客戶退回混進去會讓進貨統計與成本失真，履歷上也像是又買了一次。
--
--   exchange_orders：單頭（換貨單號、客戶、日期、原因、產生的出貨單）
--   exchange_items ：明細，direction = 'IN' 換回、'OUT' 換出
--                    耗材記 item_id + 數量；有序號的記 asset_id + sn，數量 1
--
-- 具冪等性，可重複執行。
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS exchange_orders (
    id SERIAL PRIMARY KEY,
    exchange_no VARCHAR(50) UNIQUE NOT NULL,
    customer VARCHAR(255) NOT NULL,
    exchange_date DATE NOT NULL,
    reason TEXT,
    remarks TEXT,
    outbound_request_id INTEGER REFERENCES outbound_requests(id) ON DELETE SET NULL,
    dn_no VARCHAR(50),
    creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE exchange_orders IS '客戶換貨單：換回的良品回在庫，換出的產生一張已出貨的出貨單';
COMMENT ON COLUMN exchange_orders.outbound_request_id IS '換出時自動產生的出貨單';

CREATE TABLE IF NOT EXISTS exchange_items (
    id SERIAL PRIMARY KEY,
    exchange_id INTEGER NOT NULL REFERENCES exchange_orders(id) ON DELETE CASCADE,
    direction VARCHAR(3) NOT NULL CHECK (direction IN ('IN', 'OUT')),
    item_id INTEGER REFERENCES item_master(id) ON DELETE SET NULL,
    asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
    sn VARCHAR(100),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON COLUMN exchange_items.direction IS 'IN = 自客戶換回（回在庫），OUT = 換出給客戶';

CREATE INDEX IF NOT EXISTS idx_exchange_items_exchange_id ON exchange_items(exchange_id);
CREATE INDEX IF NOT EXISTS idx_exchange_items_item_id ON exchange_items(item_id);
CREATE INDEX IF NOT EXISTS idx_exchange_orders_customer ON exchange_orders(customer);

COMMIT;
