// ============================================================================
// 耗材盤點調整（只調整 Stock 數量）
// ----------------------------------------------------------------------------
// 盤點時實際數量與帳面不符（遺失、損壞、領用沒登帳⋯），把 Stock 改成實盤數量。
// 先前系統沒有這條路，只能開一張出貨單把差額扣掉，盤點短少就被記成出貨給客戶。
//
// 誰能調整看帳號權限（menu_access）裡的 stockAdjust，在系統管理的「權限設定」勾選；
// 管理員角色也要勾了才能調整。直接改帳面數量是敏感操作，所以不走 /api/namedQuery
// （那邊只檢查有沒有登入，任何人都能呼叫任何具名查詢）——
// 這裡的 SQL 刻意不放進 database/queries.js。
//
// 用戶端要帶上「畫面上看到的系統數量」：鎖住那一列後跟目前數量比，不同代表
// 這段時間有人出貨或進貨，回 409 請使用者重新確認，不會蓋掉別人的異動。
// 數量更新與事件紀錄在同一個交易裡，紀錄寫不進去就不調整。
//
// LAB 數量跟「掛在哪台設備上」的紀錄綁在一起，不在這裡調整；
// LAB 有差異請先用「庫存異動 (Stock↔LAB)」移回 Stock 再調整。
// ============================================================================

import express from 'express';
import { clientIp } from './auditLog.js';

export const PERMISSION = 'stockAdjust';
/** 數量上限：跟資料庫的 integer 一樣，也擋掉手誤打出來的天文數字 */
const MAX_QTY = 2147483647;
const MAX_REASON = 50;
const MAX_NOTE = 500;

export const canAdjust = (user) => !!user?.menu_access?.[PERMISSION];

const isQty = (v) => Number.isInteger(v) && v >= 0 && v <= MAX_QTY;

/** 盤虧 −3／盤盈 +2 */
export const describeDiff = (diff) => (diff < 0 ? `盤虧 −${-diff}` : `盤盈 +${diff}`);

/**
 * @param {import('pg').Pool} pool
 * @param {ReturnType<import('./auth.js').createAuth>} auth
 */
export const createStockAdjustRoutes = (pool, auth) => {
  const router = express.Router();

  router.post('/', auth.requireAuth, async (req, res) => {
    if (!canAdjust(req.user)) {
      return res.status(403).json({ success: false, error: '這個帳號沒有盤點調整的權限，請管理員在權限設定裡勾選「可盤點調整」。' });
    }
    const { itemMasterId, expectedStock, actualStock } = req.body || {};
    const reason = String(req.body?.reason ?? '').trim();
    const note = String(req.body?.note ?? '').trim();
    if (!Number.isInteger(itemMasterId) || itemMasterId <= 0) {
      return res.status(400).json({ success: false, error: '品項不正確。' });
    }
    if (!isQty(expectedStock) || !isQty(actualStock)) {
      return res.status(400).json({ success: false, error: '數量須為 0 以上的整數。' });
    }
    if (!reason || reason.length > MAX_REASON) {
      return res.status(400).json({ success: false, error: '請選擇調整原因。' });
    }
    if (note.length > MAX_NOTE) {
      return res.status(400).json({ success: false, error: `說明最多 ${MAX_NOTE} 字。` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT i.id, i.brand, i.model, i.type, i.specification, COALESCE(i.stock_qty, 0) AS stock_qty, c.name AS category_name
           FROM item_master i LEFT JOIN categories c ON i.category_id = c.id
          WHERE i.id = $1 FOR UPDATE OF i`,
        [itemMasterId]
      );
      const item = found.rows[0];
      if (!item) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: '找不到這個品項。' });
      }
      // 設備、硬體一台一筆資產，數量是算出來的，不能直接改
      if (item.category_name !== '耗材') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: '只有耗材可以盤點調整數量。' });
      }
      const before = Number(item.stock_qty);
      if (before !== expectedStock) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false, currentStock: before,
          error: `系統數量已變動（畫面上是 ${expectedStock}，目前是 ${before}），可能剛有人出貨或進貨，請重新確認後再調整。`,
        });
      }
      const diff = actualStock - before;
      if (diff === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: '實盤數量與系統數量相同，不需要調整。' });
      }

      await client.query(`UPDATE item_master SET stock_qty = $1 WHERE id = $2`, [actualStock, itemMasterId]);

      const name = [item.brand, item.model].filter(Boolean).join(' ') || `#${itemMasterId}`;
      const userName = req.user.full_name || req.user.username;
      const summary = `盤點調整 [${name}]：Stock ${before} → ${actualStock}（${describeDiff(diff)}），原因：${reason}${note ? `；${note}` : ''}`;
      await client.query(
        `INSERT INTO system_audit_logs (user_id, user_name, user_role, action_type, module, module_label,
           target_id, target_name, summary, details, ip_address)
         VALUES ($1, $2, $3, 'UPDATE', 'CONSUMABLE', '耗材物料', $4, $5, $6, $7, $8)`,
        [
          req.user.id, userName, req.user.role, String(itemMasterId), name, summary,
          JSON.stringify({
            // itemMasterId 讓品項履歷接得回來；stockAdjust 讓履歷顯示成「盤點調整」；
            // 履歷的數量欄只取數字，所以 quantity 放差額的絕對值，正負看 diff
            itemMasterId: String(itemMasterId), stockAdjust: diff < 0 ? 'LOSS' : 'GAIN',
            quantity: Math.abs(diff), before, after: actualStock, diff, reason, note,
            brand: item.brand, model: item.model, type: item.type, specification: item.specification,
          }),
          clientIp(req),
        ]
      );
      await client.query('COMMIT');
      res.json({ success: true, before, after: actualStock, diff });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[StockAdjust] 調整失敗:', error.message);
      res.status(500).json({ success: false, error: '盤點調整失敗，請稍後再試。' });
    } finally {
      client.release();
    }
  });

  return router;
};
