import { describe, it, expect, vi } from 'vitest';
import { sanitizeParams } from '../../server/sanitize';
import { prepareQueryParams } from '../../server/queryParams';
import { runTransaction } from '../../server/transaction';
import { FREE_TEXT_PARAMS, FREE_TEXT_MAX_LENGTH, cleanFreeText } from '../../server/freeTextParams';
import { queries } from '../../database/queries';

/**
 * 說明文字參數的例外
 *
 * sanitizeParams 會刪掉 | & ; $ % @ ' \ ( ) + 與換行，拍攝說明寫「正面 & 背面」
 * 會變成「正面  背面」，分行寫的步驟黏成一行。白名單上的參數不刪字元、保留換行，
 * 其他參數維持原本的過濾。
 */
const DESC = '1. 關機狀態 (正面平視)\r\n2. 前面板 & 序號貼紙都要入鏡；亮度 50%\n3. Insert the cable, then select port 1';

describe('白名單上的說明文字', () => {
  it('特殊字元與英文字都留著，換行統一成 LF', () => {
    const out = prepareQueryParams([2, 'PHOTO', '正面', 0, DESC], queries.insertChecklistItem, 'insertChecklistItem');
    expect(out[4]).toBe('1. 關機狀態 (正面平視)\n2. 前面板 & 序號貼紙都要入鏡；亮度 50%\n3. Insert the cable, then select port 1');
  });

  it('同一支查詢裡不在白名單的參數照舊過濾', () => {
    const out = prepareQueryParams([2, 'PHOTO', '正面 & 背面', 0, DESC], queries.insertChecklistItem, 'insertChecklistItem');
    expect(out[2]).toBe('正面  背面');
  });

  it('沒有傳查詢名稱時一律照舊過濾', () => {
    const out = prepareQueryParams([2, 'PHOTO', '正面', 0, DESC], queries.insertChecklistItem);
    expect(out[4]).not.toContain('&');
    expect(out[4]).not.toContain('\n');
  });

  it('其他查詢的同位置參數不受影響', () => {
    const out = sanitizeParams(['a & b (c)'], new Set());
    expect(out[0]).toBe('a  b c');
  });

  it('範例說明也適用', () => {
    const out = prepareQueryParams(['背面', 'A & B\nC'], queries.insertChecklistPhotoExample, 'insertChecklistPhotoExample');
    expect(out).toEqual(['背面', 'A & B\nC', null]);
  });

  it('控制字元移除、超長截斷', () => {
    expect(cleanFreeText('a\u0000b\u0007c\td')).toBe('abc\td');
    expect(cleanFreeText('x'.repeat(FREE_TEXT_MAX_LENGTH + 50))).toHaveLength(FREE_TEXT_MAX_LENGTH);
  });

  it('不是字串的參數原樣傳回', () => {
    expect(cleanFreeText(null)).toBeNull();
    expect(prepareQueryParams([null, 61], queries.updateChecklistItemDescription, 'updateChecklistItemDescription')).toEqual([null, 61]);
  });
});

describe('白名單本身', () => {
  it('列出的查詢都存在，索引也在該查詢的參數範圍內', () => {
    for (const [name, idxs] of Object.entries(FREE_TEXT_PARAMS)) {
      const sql = queries[name];
      expect(sql, name).toBeTruthy();
      const max = Math.max(...(sql.match(/\$(\d+)/g) || []).map((m) => Number(m.slice(1))));
      idxs.forEach((i) => expect(i, `${name}[${i}]`).toBeLessThan(max));
    }
  });

  it('白名單上的參數都是寫進 description 欄位的', () => {
    // 防止日後有人把名稱、代碼之類的欄位也加進來
    for (const [name, idxs] of Object.entries(FREE_TEXT_PARAMS)) {
      idxs.forEach((i) => {
        const placeholder = new RegExp(`description\\s*=\\s*NULLIF\\(TRIM\\(COALESCE\\(\\$${i + 1}\\b|NULLIF\\(TRIM\\(COALESCE\\(\\$${i + 1}, ''\\)\\), ''\\)`);
        expect(queries[name], `${name} $${i + 1}`).toMatch(placeholder);
      });
    }
    expect(queries.insertChecklistItem).toMatch(/sort_order, description\)/);
  });
});

describe('交易路徑與單筆查詢一致', () => {
  it('交易的每一步把查詢名稱交給參數前處理', async () => {
    const client = { query: vi.fn(async () => ({ rows: [], rowCount: 1 })), release: vi.fn() };
    const pool = { connect: vi.fn(async () => client) };
    const res = await runTransaction(
      { pool, namedQueries: queries, prepareParams: prepareQueryParams },
      [{ queryName: 'updateChecklistItemDescription', params: ['A & B\nC', 61] }],
    );
    expect(res.success).toBe(true);
    const call = client.query.mock.calls.find(([sql]) => sql === queries.updateChecklistItemDescription);
    expect(call[1]).toEqual(['A & B\nC', 61]);
  });
});
