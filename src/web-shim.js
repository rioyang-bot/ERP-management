// Web 模擬層：讓原本呼叫 electronAPI 的程式碼能在瀏覽器運行
// 透過 Vite Proxy，我們只需使用相對路徑
const API_BASE = '';

// --- 連線代碼（token）管理 -------------------------------------------------
// 登入成功後由伺服器發給，之後每個 API 請求都必須附上。
// 伺服器端會查驗代碼是否有效且未逾期；沒有代碼一律回 401。
const TOKEN_KEY = 'erp_token';

export const getAuthToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
};
export const setAuthToken = (token) => {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* 無痕模式等情況 */ }
};

/** 連線階段失效時，清除本機狀態並導回登入頁 */
const handleUnauthorized = () => {
  setAuthToken(null);
  try { localStorage.removeItem('erp_session'); } catch { /* 忽略 */ }
  if (typeof window !== 'undefined' && !window.location.pathname.endsWith('/login')) {
    window.location.href = '/login';
  }
};

/** 帶上驗證標頭的 fetch；遇到 401 一律視為連線階段失效 */
const authFetch = async (url, options = {}) => {
  const token = getAuthToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error('連線階段已失效，請重新登入。');
  }
  return response;
};

if (!window.electronAPI) {
  window.electronAPI = {
    namedQuery: async (queryName, params = []) => {
      try {
        const response = await authFetch(`${API_BASE}/api/namedQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queryName, params }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        return data;
      } catch (error) {
        console.error('[WebShim Error] namedQuery:', error);
        return { success: false, error: error.message || '連線至後端 API 發生異常' };
      }
    },

    // 多步驟交易：整串步驟在伺服器端的單一交易中執行，全成功才提交。
    // steps 為 [{ id?, queryName, params }]，params 內可用 { $ref: '步驟名.rows.0.id' }
    // 取用先前步驟的結果。
    runTransaction: async (steps) => {
      try {
        const response = await authFetch(`${API_BASE}/api/transaction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ steps }),
        });
        const data = await response.json();
        return response.ok ? data : { success: false, error: data.error || `HTTP ${response.status}` };
      } catch (error) {
        console.error('[WebShim Error] runTransaction:', error);
        return { success: false, error: error.message || '連線至後端 API 發生異常' };
      }
    },

    // 登入：送出帳號與密碼，由伺服器端驗證並回傳連線代碼。
    // 密碼不在前端做任何雜湊或比對。
    authLogin: async (username, password) => {
      try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await response.json();
        if (!response.ok) {
          return { success: false, error: data.error || `HTTP ${response.status}` };
        }
        if (data.token) setAuthToken(data.token);
        return data;
      } catch (error) {
        console.error('[WebShim Error] authLogin:', error);
        return { success: false, error: error.message === 'Failed to fetch' ? '無法連線至後端 API' : error.message };
      }
    },

    authLogout: async () => {
      try {
        await authFetch(`${API_BASE}/api/auth/logout`, { method: 'POST' });
      } catch { /* 即使伺服器端失敗，本機仍要清除 */ }
      setAuthToken(null);
      return { success: true };
    },

    /** 確認連線代碼是否仍有效，供重新整理後回復登入狀態 */
    authMe: async () => {
      try {
        const response = await authFetch(`${API_BASE}/api/auth/me`);
        return await response.json();
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    authChangePassword: async (currentPassword, newPassword) => {
      try {
        const response = await authFetch(`${API_BASE}/api/auth/change-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const data = await response.json();
        return response.ok ? data : { success: false, error: data.error || `HTTP ${response.status}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    authResetPassword: async (userId, newPassword) => {
      try {
        const response = await authFetch(`${API_BASE}/api/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, newPassword }),
        });
        const data = await response.json();
        return response.ok ? data : { success: false, error: data.error || `HTTP ${response.status}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    authCreateUser: async (payload) => {
      try {
        const response = await authFetch(`${API_BASE}/api/auth/create-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        return response.ok ? data : { success: false, error: data.error || `HTTP ${response.status}` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    getDashboardStats: async () => {
      try {
        const response = await authFetch(`${API_BASE}/api/dashboard/stats`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        return data;
      } catch (error) {
        console.error('[WebShim Error] getDashboardStats:', error);
        return { success: false, error: '無法取得儀表板資料' };
      }
    },

    saveFile: async (fileName, arrayBuffer) => {
      try {
        const formData = new FormData();
        const blob = new Blob([arrayBuffer]);
        formData.append('file', blob, fileName);

        const response = await authFetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          body: formData,
        });
        return await response.json();
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  };
}

// 全域處理圖片路徑轉化 (針對原本的 erp-media 協定)
window.getMediaUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('erp-media:///')) {
    return `/uploads/${path.replace('erp-media:///', '')}`;
  }
  return path;
};

console.log('[WebShim] Loaded: window.electronAPI is using relative path (via Vite Proxy)');
