// ============================================================================
// 使用者個人偏好設定路由
// ----------------------------------------------------------------------------
// 對象一律取自連線階段（req.user.id），不接受用戶端指定使用者，
// 以免有人改到別人的設定。
// ============================================================================

import express from 'express';

const MAX_VALUE_BYTES = 64 * 1024; // 單筆設定上限，避免被塞入過大的內容

/**
 * @param {import('pg').Pool} pool
 * @param {ReturnType<import('./auth.js').createAuth>} auth
 */
export const createPreferenceRoutes = (pool, auth) => {
  const router = express.Router();

  // 讀取單一偏好設定
  router.get('/:key', auth.requireAuth, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT value FROM user_preferences WHERE user_id = $1 AND pref_key = $2`,
        [req.user.id, req.params.key]
      );
      // 尚未設定過時回傳 null，由前端套用預設值
      res.json({ success: true, value: r.rows[0]?.value ?? null });
    } catch (error) {
      console.error('[Preference] 讀取失敗:', error.message);
      res.status(500).json({ success: false, error: '讀取個人設定失敗。' });
    }
  });

  // 寫入單一偏好設定
  router.put('/:key', auth.requireAuth, async (req, res) => {
    const { value } = req.body || {};
    if (value === undefined) {
      return res.status(400).json({ success: false, error: '缺少設定內容。' });
    }
    const serialised = JSON.stringify(value);
    if (Buffer.byteLength(serialised, 'utf8') > MAX_VALUE_BYTES) {
      return res.status(413).json({ success: false, error: '設定內容過大。' });
    }
    try {
      await pool.query(
        `INSERT INTO user_preferences (user_id, pref_key, value, updated_at)
         VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, pref_key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        [req.user.id, req.params.key, serialised]
      );
      res.json({ success: true });
    } catch (error) {
      console.error('[Preference] 寫入失敗:', error.message);
      res.status(500).json({ success: false, error: '儲存個人設定失敗。' });
    }
  });

  return router;
};
