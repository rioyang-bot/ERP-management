-- ============================================================================
-- 每月結餘庫存
-- ----------------------------------------------------------------------------
-- 盤點表先前只看得到「此刻」的庫存，沒有任何歷史可以對照 ——
-- 系統裡沒有異動流水表，ItemLedgerModal 的歷程是即時從單據推算的。
--
-- 而且推算不回去：耗材的 stock_qty 有九條寫入路徑，其中實驗室調撥、
-- 批次匯入覆寫、進貨單刪除回沖都不留任何有日期的紀錄。要有準確的月結存，
-- 只能從現在開始逐月記錄。
--
-- balance_month 存該月的 1 日，代表「這個月月底的結存」。
-- 每月 1 日產生上個月那一筆，由伺服器自動補（見 server/monthlyBalance.js）。
--
-- 具冪等性，可重複執行。
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_monthly_balances (
  id SERIAL PRIMARY KEY,
  item_master_id INTEGER NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
  -- 該月的 1 日；代表這個月月底的結存
  balance_month DATE NOT NULL,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  lab_qty INTEGER NOT NULL DEFAULT 0,
  lent_qty INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inventory_monthly_balances_unique UNIQUE (item_master_id, balance_month)
);

-- 盤點表一次要撈多個品項的近三個月，以月份為主的索引最常用
CREATE INDEX IF NOT EXISTS idx_monthly_balances_month
  ON inventory_monthly_balances (balance_month DESC, item_master_id);
