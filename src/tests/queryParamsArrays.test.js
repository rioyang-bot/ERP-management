import { describe, it, expect } from 'vitest';
import { prepareQueryParams, isPgArrayParam } from '../../server/queryParams.js';
import { queries } from '../../database/queries';

/**
 * 陣列參數交給 PostgreSQL 陣列
 *
 * 參數前處理原本把所有物件（陣列也是物件）都轉成 JSON 字串給 JSONB 欄位用，
 * 但 `$1::text[]` 收到 '["A","B"]' 會報 malformed array literal。
 * 確認進貨的序號檢查、刪除進貨單的動用檢查都因此在伺服器上失敗
 * （前端測試直接把陣列交給模擬的查詢，抓不到）。
 */
describe('哪些參數是 PostgreSQL 陣列', () => {
  it('寫明 ::text[]、::int[] 轉型的才算', () => {
    expect(isPgArrayParam('WHERE sn = ANY($1::text[])', 1)).toBe(true);
    expect(isPgArrayParam('WHERE id = ANY($2::int[])', 2)).toBe(true);
    expect(isPgArrayParam('unnest($1::text[])', 1)).toBe(true);
    expect(isPgArrayParam('SET attachments = $1::jsonb', 1)).toBe(false);
    expect(isPgArrayParam('VALUES ($1, $2)', 1)).toBe(false);
  });

  it('$1 不會誤認成 $10、$11', () => {
    expect(isPgArrayParam('ANY($10::text[]) AND $1 = 1', 1)).toBe(false);
    expect(isPgArrayParam('ANY($11::text[])', 1)).toBe(false);
  });
});

describe('參數前處理', () => {
  it('陣列型參數原樣交給 pg', () => {
    const out = prepareQueryParams([['BC001', 'BC002']], 'SELECT 1 WHERE x = ANY($1::text[])', 'q');
    expect(out).toEqual([['BC001', 'BC002']]);
  });

  it('JSONB 參數照舊轉成 JSON 字串', () => {
    const out = prepareQueryParams([{ a: 1 }, ['x']], 'UPDATE t SET c = $1::jsonb, d = $2', 'q');
    expect(out).toEqual(['{"a":1}', '["x"]']);
  });

  it('用到陣列的進貨查詢都拿得到陣列', () => {
    for (const name of ['fetchExistingAssetSns', 'fetchInboundAssetUsage', 'deleteAssetsBySnList']) {
      expect(prepareQueryParams([['SN-1']], queries[name], name), name).toEqual([['SN-1']]);
    }
    expect(prepareQueryParams([[7, 9]], queries.fetchOrphanItemMasters, 'fetchOrphanItemMasters')).toEqual([[7, 9]]);
  });
});
