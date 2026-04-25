// Web 模擬層：讓原本呼叫 electronAPI 的程式碼能在瀏覽器運行
// 透過 Vite Proxy，我們只需使用相對路徑
const API_BASE = ''; 

window.electronAPI = {


  namedQuery: async (queryName, params = []) => {
    try {
      const response = await fetch(`${API_BASE}/api/namedQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryName, params }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    } catch (error) {
      console.error('[WebShim Error] namedQuery:', error);
      return { success: false, error: '無法連線至後端 API (Named Query)' };
    }
  },

  authLogin: async (username) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    } catch (error) {
      console.error('[WebShim Error] authLogin:', error);
      return { success: false, error: error.message === 'Failed to fetch' ? '無法連線至後端 API' : error.message };
    }
  },

  getDashboardStats: async () => {
    try {
      const response = await fetch(`${API_BASE}/api/dashboard/stats`);
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

      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// 全域處理圖片路徑轉化 (針對原本的 erp-media 協定)
window.getMediaUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('erp-media:///')) {
    return `/uploads/${path.replace('erp-media:///', '')}`;
  }
  return path;
};

console.log('[WebShim] Loaded: window.electronAPI is using relative path (via Vite Proxy)');
