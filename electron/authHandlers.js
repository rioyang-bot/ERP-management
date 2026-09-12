// ============================================================================
// Electron 桌面版的身分驗證 IPC
// ----------------------------------------------------------------------------
// 與網頁版共用 server/auth.js 的密碼驗證與雜湊邏輯，確保兩邊行為一致：
//   - 密碼一律於主行程驗證，password_hash 不會回到畫面層
//   - 舊制未加鹽 SHA-256 於首次成功登入時自動升級為 bcrypt
//   - 密碼不經過 sanitizeParams（該函式會刪除特殊字元並弱化密碼）
// 桌面版為單一使用者情境，登入狀態保存在主行程記憶體中，無須連線代碼。
// ============================================================================

import { hashPassword, verifyPassword } from '../server/auth.js';

const MIN_PASSWORD_LENGTH = 8;

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {(text: string, params?: unknown[]) => Promise<{rows: any[]}>} query
 */
export const registerAuthHandlers = (ipcMain, query) => {
  let currentUser = null;

  ipcMain.handle('auth:login', async (_event, username, password) => {
    if (!username || !password) {
      return { success: false, error: '請輸入帳號與密碼。' };
    }
    try {
      const result = await query(
        `SELECT id, username, role, full_name, menu_access, password_hash, password_algo
           FROM users WHERE LOWER(username) = LOWER($1) AND is_active = TRUE`,
        [String(username).trim()]
      );
      const user = result.rows[0];

      // 帳號不存在與密碼錯誤回傳相同訊息，避免被用來探測有效帳號
      if (!user) {
        await new Promise((r) => setTimeout(r, 300));
        return { success: false, error: '帳號或密碼錯誤。' };
      }

      const { ok, needsUpgrade } = await verifyPassword(password, user.password_hash);
      if (!ok) return { success: false, error: '帳號或密碼錯誤。' };

      if (needsUpgrade) {
        try {
          await query(
            `UPDATE users SET password_hash = $1, password_algo = 'bcrypt' WHERE id = $2`,
            [await hashPassword(password), user.id]
          );
          console.log(`[Auth] 已將使用者 ${user.username} 的密碼雜湊升級為 bcrypt`);
        } catch (e) {
          console.error('[Auth] 密碼雜湊升級失敗（不影響本次登入）:', e.message);
        }
      }

      currentUser = {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        menu_access: user.menu_access,
      };
      return { success: true, user: currentUser };
    } catch (error) {
      console.error('[Auth] 登入失敗:', error);
      return { success: false, error: '登入處理失敗，請稍後再試。' };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    currentUser = null;
    return { success: true };
  });

  ipcMain.handle('auth:me', async () =>
    currentUser ? { success: true, user: currentUser } : { success: false, error: '尚未登入。' });

  ipcMain.handle('auth:changePassword', async (_event, currentPassword, newPassword) => {
    if (!currentUser) return { success: false, error: '尚未登入。' };
    if (!currentPassword || !newPassword) {
      return { success: false, error: '請輸入目前密碼與新密碼。' };
    }
    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return { success: false, error: `新密碼長度至少 ${MIN_PASSWORD_LENGTH} 碼。` };
    }
    try {
      const r = await query(`SELECT password_hash, password_algo FROM users WHERE id = $1`, [currentUser.id]);
      const row = r.rows[0];
      const { ok } = await verifyPassword(currentPassword, row?.password_hash);
      if (!ok) return { success: false, error: '目前密碼不正確。' };

      await query(
        `UPDATE users SET password_hash = $1, password_algo = 'bcrypt' WHERE id = $2`,
        [await hashPassword(newPassword), currentUser.id]
      );
      return { success: true };
    } catch (error) {
      console.error('[Auth] 變更密碼失敗:', error);
      return { success: false, error: '變更密碼失敗，請稍後再試。' };
    }
  });

  ipcMain.handle('auth:resetPassword', async (_event, userId, newPassword) => {
    if (currentUser?.role !== 'ADMIN') return { success: false, error: '權限不足。' };
    if (String(newPassword || '').length < MIN_PASSWORD_LENGTH) {
      return { success: false, error: `新密碼長度至少 ${MIN_PASSWORD_LENGTH} 碼。` };
    }
    try {
      const r = await query(
        `UPDATE users SET password_hash = $1, password_algo = 'bcrypt' WHERE id = $2 RETURNING id`,
        [await hashPassword(newPassword), userId]
      );
      return r.rows.length ? { success: true } : { success: false, error: '找不到該使用者。' };
    } catch (error) {
      console.error('[Auth] 重設密碼失敗:', error);
      return { success: false, error: '重設密碼失敗，請稍後再試。' };
    }
  });

  ipcMain.handle('auth:createUser', async (_event, payload) => {
    if (currentUser?.role !== 'ADMIN') return { success: false, error: '權限不足。' };
    const { username, password, role, fullName, menuAccess } = payload || {};
    if (!username || !password || !role) {
      return { success: false, error: '帳號、密碼與角色為必填。' };
    }
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return { success: false, error: `密碼長度至少 ${MIN_PASSWORD_LENGTH} 碼。` };
    }
    try {
      await query(
        `INSERT INTO users (username, password_hash, password_algo, role, full_name, menu_access)
         VALUES ($1, $2, 'bcrypt', $3, $4, $5::jsonb)`,
        [String(username).trim(), await hashPassword(password), role, fullName || null,
          JSON.stringify(menuAccess || {})]
      );
      return { success: true };
    } catch (error) {
      if (error.code === '23505') return { success: false, error: '此帳號名稱已存在。' };
      console.error('[Auth] 建立帳號失敗:', error);
      return { success: false, error: '建立帳號失敗，請稍後再試。' };
    }
  });

  // 供偏好設定等其他模組取得目前登入者
  return { getCurrentUser: () => currentUser };
};
