// ============================================================================
// Electron 桌面版的使用者偏好設定 IPC
// ----------------------------------------------------------------------------
// 與網頁版的 /api/preferences 行為一致：對象取自目前登入的使用者，
// 由主行程判定，畫面層不指定使用者。
// ============================================================================

const MAX_VALUE_BYTES = 64 * 1024;

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {(text: string, params?: unknown[]) => Promise<{rows: any[]}>} query
 * @param {() => ({ id: number } | null)} getCurrentUser 取得目前登入者
 */
export const registerPreferenceHandlers = (ipcMain, query, getCurrentUser) => {
  ipcMain.handle('pref:get', async (_event, key) => {
    const user = getCurrentUser();
    if (!user) return { success: false, error: '尚未登入。' };
    try {
      const r = await query(
        `SELECT value FROM user_preferences WHERE user_id = $1 AND pref_key = $2`,
        [user.id, String(key)]
      );
      return { success: true, value: r.rows[0]?.value ?? null };
    } catch (error) {
      console.error('[Preference] 讀取失敗:', error.message);
      return { success: false, error: '讀取個人設定失敗。' };
    }
  });

  ipcMain.handle('pref:set', async (_event, key, value) => {
    const user = getCurrentUser();
    if (!user) return { success: false, error: '尚未登入。' };
    if (value === undefined) return { success: false, error: '缺少設定內容。' };

    const serialised = JSON.stringify(value);
    if (Buffer.byteLength(serialised, 'utf8') > MAX_VALUE_BYTES) {
      return { success: false, error: '設定內容過大。' };
    }
    try {
      await query(
        `INSERT INTO user_preferences (user_id, pref_key, value, updated_at)
         VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, pref_key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        [user.id, String(key), serialised]
      );
      return { success: true };
    } catch (error) {
      console.error('[Preference] 寫入失敗:', error.message);
      return { success: false, error: '儲存個人設定失敗。' };
    }
  });
};
