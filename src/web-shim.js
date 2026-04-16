// Web 模擬層：讓原本呼叫 electronAPI 的程式碼能在瀏覽器運行
const API_BASE = `http://${window.location.hostname}:3000`;

window.electronAPI = {
  dbQuery: async (sql, params = []) => {
    try {
      const response = await fetch(`${API_BASE}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, params }),
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
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
    return `${API_BASE}/uploads/${path.replace('erp-media:///', '')}`;
  }
  return path;
};

console.log('[WebShim] Loaded: window.electronAPI is now pointing to ' + API_BASE);
