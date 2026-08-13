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

/**
 * 根據自訂策略驗證密碼強度
 * @param {string} password 
 * @param {object} policy - { enabled, minLength, requireUppercase, requireLowercase, requireNumber, requireSpecialChar }
 * @returns { {isValid: boolean, message: string} }
 */
export function validatePassword(password, policy) {
  if (!policy || !policy.enabled) return { isValid: true, message: '' };
  
  if (policy.minLength && password.length < policy.minLength) {
    return { isValid: false, message: `密碼長度至少需要 ${policy.minLength} 個字元` };
  }
  
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    return { isValid: false, message: '密碼必須包含至少一個大寫英文字母' };
  }
  
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    return { isValid: false, message: '密碼必須包含至少一個小寫英文字母' };
  }
  
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    return { isValid: false, message: '密碼必須包含至少一個數字' };
  }
  
  if (policy.requireSpecialChar && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password)) {
    return { isValid: false, message: '密碼必須包含至少一個特殊符號' };
  }
  
  return { isValid: true, message: '驗證通過' };
}
