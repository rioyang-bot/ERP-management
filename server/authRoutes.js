// ============================================================================
// 身分驗證相關路由
// ----------------------------------------------------------------------------
// 這些端點刻意不經過 sanitizeParams：該函式會刪除 | & ; $ % @ ' \ ( ) + 等字元，
// 若套用在密碼上會在使用者無感的情況下竄改並弱化密碼。
// 所有 SQL 皆為參數化查詢，本身即可防禦 SQL Injection。
// ============================================================================

import express from 'express';
import { hashPassword, verifyPassword } from './auth.js';

const MIN_PASSWORD_LENGTH = 8;

/**
 * @param {import('pg').Pool} pool
 * @param {ReturnType<import('./auth.js').createAuth>} auth
 */
export const createAuthRoutes = (pool, auth) => {
  const router = express.Router();

  // --- 登入 -----------------------------------------------------------------
  router.post('/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: '請輸入帳號與密碼。' });
    }
    try {
      const result = await pool.query(
        `SELECT id, username, role, full_name, menu_access, password_hash, password_algo
           FROM users WHERE LOWER(username) = LOWER($1) AND is_active = TRUE`,
        [String(username).trim()]
      );
      const user = result.rows[0];

      // 帳號不存在與密碼錯誤回傳相同訊息，避免被用來探測有效帳號
      if (!user) {
        await new Promise((r) => setTimeout(r, 300)); // 拉平回應時間
        return res.status(401).json({ success: false, error: '帳號或密碼錯誤。' });
      }

      const { ok, needsUpgrade } = await verifyPassword(password, user.password_hash);
      if (!ok) {
        return res.status(401).json({ success: false, error: '帳號或密碼錯誤。' });
      }

      // 舊制未加鹽 SHA-256，於首次成功登入時自動升級為 bcrypt，無須全體重設密碼
      if (needsUpgrade) {
        try {
          await pool.query(
            `UPDATE users SET password_hash = $1, password_algo = 'bcrypt' WHERE id = $2`,
            [await hashPassword(password), user.id]
          );
          console.log(`[Auth] 已將使用者 ${user.username} 的密碼雜湊升級為 bcrypt`);
        } catch (e) {
          console.error('[Auth] 密碼雜湊升級失敗（不影響本次登入）:', e.message);
        }
      }

      const { token, expiresAt } = await auth.createSession(user.id, req.get('user-agent'));
      return res.json({
        success: true,
        token,
        expiresAt,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          full_name: user.full_name,
          menu_access: user.menu_access,
        },
      });
    } catch (error) {
      console.error('[Auth] 登入失敗:', error.message);
      return res.status(500).json({ success: false, error: '登入處理失敗，請稍後再試。' });
    }
  });

  // --- 登出 -----------------------------------------------------------------
  router.post('/logout', auth.requireAuth, async (req, res) => {
    try {
      await auth.destroySession(req.sessionToken);
      res.json({ success: true });
    } catch {
      res.status(500).json({ success: false, error: '登出失敗。' });
    }
  });

  // --- 確認連線階段是否仍有效（重新整理後回復登入狀態）-------------------------
  router.get('/me', auth.requireAuth, (req, res) => {
    const { token: _token, ...user } = req.user;
    res.json({ success: true, user });
  });

  // --- 變更自己的密碼 --------------------------------------------------------
  router.post('/change-password', auth.requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: '請輸入目前密碼與新密碼。' });
    }
    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, error: `新密碼長度至少 ${MIN_PASSWORD_LENGTH} 碼。` });
    }
    try {
      const r = await pool.query(`SELECT password_hash, password_algo FROM users WHERE id = $1`, [req.user.id]);
      const row = r.rows[0];
      const { ok } = await verifyPassword(currentPassword, row?.password_hash);
      if (!ok) return res.status(401).json({ success: false, error: '目前密碼不正確。' });

      await pool.query(
        `UPDATE users SET password_hash = $1, password_algo = 'bcrypt' WHERE id = $2`,
        [await hashPassword(newPassword), req.user.id]
      );
      // 變更密碼後撤銷本人其他裝置的連線階段，只留目前這個
      await pool.query(`DELETE FROM user_sessions WHERE user_id = $1 AND token <> $2`,
        [req.user.id, req.sessionToken]);
      res.json({ success: true });
    } catch (error) {
      console.error('[Auth] 變更密碼失敗:', error.message);
      res.status(500).json({ success: false, error: '變更密碼失敗，請稍後再試。' });
    }
  });

  // --- 管理者重設他人密碼 ----------------------------------------------------
  router.post('/reset-password', auth.requireAuth, auth.requireRole('ADMIN'), async (req, res) => {
    const { userId, newPassword } = req.body || {};
    if (!userId || !newPassword) {
      return res.status(400).json({ success: false, error: '缺少使用者或新密碼。' });
    }
    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, error: `新密碼長度至少 ${MIN_PASSWORD_LENGTH} 碼。` });
    }
    try {
      const r = await pool.query(
        `UPDATE users SET password_hash = $1, password_algo = 'bcrypt' WHERE id = $2 RETURNING id`,
        [await hashPassword(newPassword), userId]
      );
      if (r.rows.length === 0) return res.status(404).json({ success: false, error: '找不到該使用者。' });
      await pool.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]); // 強制重新登入
      res.json({ success: true });
    } catch (error) {
      console.error('[Auth] 重設密碼失敗:', error.message);
      res.status(500).json({ success: false, error: '重設密碼失敗，請稍後再試。' });
    }
  });

  // --- 管理者建立帳號 --------------------------------------------------------
  router.post('/create-user', auth.requireAuth, auth.requireRole('ADMIN'), async (req, res) => {
    const { username, password, role, fullName, menuAccess } = req.body || {};
    if (!username || !password || !role) {
      return res.status(400).json({ success: false, error: '帳號、密碼與角色為必填。' });
    }
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, error: `密碼長度至少 ${MIN_PASSWORD_LENGTH} 碼。` });
    }
    try {
      await pool.query(
        `INSERT INTO users (username, password_hash, password_algo, role, full_name, menu_access)
         VALUES ($1, $2, 'bcrypt', $3, $4, $5::jsonb)`,
        [String(username).trim(), await hashPassword(password), role, fullName || null,
          JSON.stringify(menuAccess || {})]
      );
      res.json({ success: true });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ success: false, error: '此帳號名稱已存在。' });
      }
      console.error('[Auth] 建立帳號失敗:', error.message);
      res.status(500).json({ success: false, error: '建立帳號失敗，請稍後再試。' });
    }
  });

  return router;
};
