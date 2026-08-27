import { describe, it, expect } from 'vitest';
import { fixMojibake, decodeTextBuffer, parseSpreadsheetFile } from '../utils/encoding';

describe('encoding.js 繁簡中文編碼與亂碼修復測試', () => {
  it('應能正確將 UTF-8 誤解碼為 Windows-1252/Latin-1 的字串修復為正確中文', () => {
    // 使用者截圖中的案例
    expect(fixMojibake('Yuanta æ–°é‡‘')).toBe('Yuanta 新金');
    expect(fixMojibake('æ–°å…‰é‡‘æŽ§')).toBe('新光金控');
    expect(fixMojibake('å…ƒå¤§è­‰åˆ¸')).toBe('元大證券');
    expect(fixMojibake('å°åŒ—æ©Ÿæˆ¿')).not.toBe(null);
    expect(fixMojibake('Normal English 123')).toBe('Normal English 123');
    expect(fixMojibake('已經是正確的中文')).toBe('已經是正確的中文');
  });

  it('decodeTextBuffer 應能正確解析 UTF-8 與 UTF-8 BOM', () => {
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode('客戶名稱: 元大證券, 地點: 台北機房');
    expect(decodeTextBuffer(utf8Bytes.buffer)).toBe('客戶名稱: 元大證券, 地點: 台北機房');

    // 加入 BOM
    const withBom = new Uint8Array([0xEF, 0xBB, 0xBF, ...utf8Bytes]);
    expect(decodeTextBuffer(withBom.buffer)).toBe('客戶名稱: 元大證券, 地點: 台北機房');
  });
});
