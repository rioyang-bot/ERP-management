import { sha256 } from 'js-sha256';

/**
 * 將字串轉換為 SHA-256 雜湊字串 (Hash String)
 * 優先使用瀏覽器原生微妙加密 API (SubtleCrypto)，若環境不支援則回退至 js-sha256
 * @param {string} message 
 * @returns {Promise<string>}
 */
export async function hashPassword(message) {
  // 檢查是否支援原生 SubtleCrypto (僅在安全內容 HTTPS/localhost 下可用)
  if (window.crypto && window.crypto.subtle) {
    try {
      const msgUint8 = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch (error) {
      console.warn('原生加密失敗，改用回退方案:', error);
    }
  }

  // 回退至純 JavaScript 實作 (可用於 HTTP 或舊版瀏覽器)
  return sha256(message);
}
