/**
 * 將字串轉換為 SHA-256 雜湊字串 (Hash String)
 * 使用瀏覽器原生微妙加密 API (SubtleCrypto)
 * @param {string} message 
 * @returns {Promise<string>}
 */
export async function hashPassword(message) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error('當前瀏覽器環境不支援加密功能 (crypto.subtle 不可用)');
  }
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
