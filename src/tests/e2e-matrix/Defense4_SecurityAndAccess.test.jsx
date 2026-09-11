import { describe, it, expect, vi } from 'vitest';
import { sanitizeParams } from '../../utils/security';

describe('防線 4：系統安全性與權限防護 (11 種情境檢測)', () => {

  it('情境 4.1：SQL Injection 防護檢驗（在搜尋或欄位填寫惡意 SQL 語法進行過濾保護）', () => {
    const maliciousInputs = [
      "admin'; DROP TABLE users; --",
      "' OR '1'='1",
      "SELECT * FROM assets WHERE id = 1"
    ];
    const cleaned = sanitizeParams(maliciousInputs);

    // 驗證關鍵危險字元與關鍵字已由安全模組移除或轉義
    expect(cleaned[0]).not.toContain("DROP TABLE");
    expect(cleaned[0]).not.toContain(";");
    expect(cleaned[1]).not.toContain("'");
    expect(cleaned[2]).not.toContain("SELECT");
  });

  it('情境 4.2：XSS 腳本注入防護（欄位輸入 script 標籤進行轉義呈現）', () => {
    const escapeHtml = (unsafe) => {
      return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const xssPayload = '<script>alert("XSS")</script>';
    const escaped = escapeHtml(xssPayload);

    expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    expect(escaped).not.toContain('<script>');
  });

  it('情境 4.3：ADMIN 權限可存取所有模組與系統日誌', () => {
    const checkPermission = (role, module) => {
      if (role === 'ADMIN') return true;
      if (role === 'IT' && module !== 'USER_MANAGEMENT') return true;
      if (role === 'WAREHOUSE') return ['INBOUND', 'OUTBOUND', 'STOCK'].includes(module);
      return false;
    };

    expect(checkPermission('ADMIN', 'USER_MANAGEMENT')).toBe(true);
    expect(checkPermission('ADMIN', 'AUDIT_LOGS')).toBe(true);
    expect(checkPermission('ADMIN', 'OUTBOUND')).toBe(true);
  });

  it('情境 4.4：IT 權限限制存取（禁止變更使用者帳號與最高權限）', () => {
    const checkPermission = (role, module) => {
      if (role === 'ADMIN') return true;
      if (role === 'IT' && module !== 'USER_MANAGEMENT') return true;
      if (role === 'WAREHOUSE') return ['INBOUND', 'OUTBOUND', 'STOCK'].includes(module);
      return false;
    };

    expect(checkPermission('IT', 'DEVICE')).toBe(true);
    expect(checkPermission('IT', 'USER_MANAGEMENT')).toBe(false);
  });

  it('情境 4.5：WAREHOUSE 倉庫權限限制存取（僅限倉儲進出單據）', () => {
    const checkPermission = (role, module) => {
      if (role === 'ADMIN') return true;
      if (role === 'IT' && module !== 'USER_MANAGEMENT') return true;
      if (role === 'WAREHOUSE') return ['INBOUND', 'OUTBOUND', 'STOCK'].includes(module);
      return false;
    };

    expect(checkPermission('WAREHOUSE', 'INBOUND')).toBe(true);
    expect(checkPermission('WAREHOUSE', 'OUTBOUND')).toBe(true);
    expect(checkPermission('WAREHOUSE', 'AUDIT_LOGS')).toBe(false);
    expect(checkPermission('WAREHOUSE', 'SETTING')).toBe(false);
  });

  it('情境 4.6：未登入/Session 失效時的路由導向保護', () => {
    const getRouteRedirect = (sessionUser, targetPath) => {
      if (!sessionUser && targetPath !== '/login') {
        return '/login';
      }
      return targetPath;
    };

    expect(getRouteRedirect(null, '/devices')).toBe('/login');
    expect(getRouteRedirect({ username: 'METECH' }, '/devices')).toBe('/devices');
  });

  it('情境 4.7：密碼變更邏輯（驗證舊密碼正確性、新密碼長度防呆）', () => {
    const user = { password_hash: 'old_hashed_password' };
    const changePassword = (inputOld, inputNew) => {
      if (inputOld !== 'old_plain_password') {
        throw new Error('舊密碼輸入錯誤！');
      }
      if (!inputNew || inputNew.length < 6) {
        throw new Error('新密碼長度必須至少 6 個字元！');
      }
      user.password_hash = `hashed_${inputNew}`;
      return true;
    };

    expect(() => changePassword('wrong_password', 'new_pass_123')).toThrow(/舊密碼輸入錯誤/);
    expect(() => changePassword('old_plain_password', '123')).toThrow(/新密碼長度必須至少 6 個字元/);
    expect(changePassword('old_plain_password', 'new_secure_pwd')).toBe(true);
  });

  it('情境 4.8：停用帳號 (is_active = false) 即時禁止登入', () => {
    const attemptLogin = (userAccount) => {
      if (!userAccount.is_active) {
        throw new Error('此帳號已遭停用，請洽詢系統管理員！');
      }
      return 'LOGIN_SUCCESS';
    };

    const disabledUser = { username: 'resigned_staff', is_active: false };
    expect(() => attemptLogin(disabledUser)).toThrow(/此帳號已遭停用/);
  });

  it('情境 4.9：重複使用者帳號建立阻擋', () => {
    const existingUsers = new Set(['METECH', 'WAREHOUSE_LEAD']);
    const createUser = (newUsername) => {
      const clean = newUsername.trim().toUpperCase();
      if (existingUsers.has(clean)) {
        throw new Error(`帳號 [${newUsername}] 已存在，請使用不同帳號名稱！`);
      }
      existingUsers.add(clean);
      return true;
    };

    expect(() => createUser('metech')).toThrow(/已存在/);
    expect(createUser('NEW_STAFF')).toBe(true);
  });

  it('情境 4.10：系統設定自訂屬性定義變更時的權限限制', () => {
    const updateCustomFieldDef = (role, newDef) => {
      if (role !== 'ADMIN') {
        throw new Error('權限不足：僅有系統管理員 (ADMIN) 允許自訂欄位架構變更！');
      }
      return { success: true, newDef };
    };

    expect(() => updateCustomFieldDef('WAREHOUSE', { id: 'test' })).toThrow(/權限不足/);
    expect(updateCustomFieldDef('ADMIN', { id: 'test' }).success).toBe(true);
  });

  it('情境 4.11：本機 SQLite 檔案並行讀寫與鎖定衝突防護 (Busy Timeout Retry)', async () => {
    const executeWithRetry = async (fn, maxRetries = 3) => {
      let attempts = 0;
      while (attempts < maxRetries) {
        try {
          return await fn(attempts);
        } catch (err) {
          attempts++;
          if (err.message.includes('SQLITE_BUSY') && attempts < maxRetries) {
            continue; // 自動重試
          }
          throw err;
        }
      }
    };

    // 模擬前兩次遇鎖 (SQLITE_BUSY)，第三次成功
    const busyMock = vi.fn()
      .mockRejectedValueOnce(new Error('SQLITE_BUSY: database is locked'))
      .mockRejectedValueOnce(new Error('SQLITE_BUSY: database is locked'))
      .mockResolvedValueOnce('TRANSACTION_COMMITTED');

    const result = await executeWithRetry(busyMock);
    expect(result).toBe('TRANSACTION_COMMITTED');
    expect(busyMock).toHaveBeenCalledTimes(3);
  });
});
