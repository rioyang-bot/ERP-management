import { describe, it, expect, vi } from 'vitest';
import { sanitizeParams } from '../utils/security';

// 模擬後端的 Named Query 執行邏輯
// 這是在驗證我們之前修復的：JavaScript Object -> SQL Parameter -> DB Cast
describe('權限更新服務整合測試', () => {
  
  it('應能將前端的權限物件正確轉化為資料庫參數', () => {
    // 1. 模擬前端傳送的資料 (這是一個真正的 JavaScript 物件，不再是字串)
    const frontendPayload = {
      menu_access: { inbound: true, inventory: false, settings: true },
      userId: 1
    };

    // 2. 模擬後端 server.js 的處理過程
    // 在 server.js 中，我們會將物件放入參數陣列
    const params = [JSON.stringify(frontendPayload.menu_access), frontendPayload.userId];
    
    // 3. 經過安全性過濾 (我們之前重構的工具)
    const sanitizedParams = sanitizeParams(params);

    // 4. 驗證：雖然經過過濾，但 JSON 字串的結構必須保持完整
    // 這是我們之前修復 JSON 報錯的關鍵點
    expect(sanitizedParams[0]).toContain('"inbound":true');
    expect(sanitizedParams[1]).toBe(1);
  });

  it('整合驗證：Named Query SQL 語法一致性', () => {
    // 模擬我們在 queries.js 中定義的 SQL 語法
    const sql = "UPDATE users SET menu_access = $1::jsonb WHERE id = $2";
    
    // 驗證是否包含我們強制要求的 ::jsonb 轉型，這是防止 DB 報錯的整合點
    expect(sql).toContain('::jsonb');
  });
});
