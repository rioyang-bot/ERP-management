import { describe, it, expect, vi } from 'vitest';
import { runTransaction } from '../../server/transaction.js';

/**
 * 交易執行器的「最少異動筆數」檢查
 *
 * UPDATE 常帶有防呆條件（例如「庫存要夠才扣」）。條件不成立時 SQL 不會報錯，
 * 只是 0 筆異動，交易照樣提交 —— 結果就是「單據狀態改了、庫存卻沒扣」。
 * expectRows 讓這種情況主動中止並回滾。
 */
describe('交易執行器：expectRows 最少異動筆數', () => {
  const namedQueries = {
    deductStock: 'UPDATE item_master SET stock_qty = stock_qty - $1 WHERE id = $2 AND stock_qty >= $1',
    markShipped: 'UPDATE outbound_requests SET status = $1 WHERE id = $2',
    insertItem: 'INSERT INTO outbound_items (request_id) VALUES ($1) RETURNING id',
  };
  const prepareParams = (params) => params;

  /** 依照每一步預先安排的異動筆數，模擬一個資料庫連線 */
  const makePool = (rowCounts) => {
    const executed = [];
    const client = {
      query: vi.fn(async (sql, params) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          executed.push(sql);
          return { rows: [], rowCount: 0 };
        }
        executed.push({ sql, params });
        const n = rowCounts.shift();
        return { rows: n > 0 ? [{ id: 1 }] : [], rowCount: n };
      }),
      release: vi.fn(),
    };
    return { pool: { connect: async () => client }, executed, client };
  };

  it('步驟實際異動 0 筆時整筆回滾，且不繼續執行後面的步驟', async () => {
    const { pool, executed } = makePool([0, 1]); // 第一步被條件擋下
    const res = await runTransaction({ pool, namedQueries, prepareParams }, [
      { queryName: 'deductStock', params: [10, 1], expectRows: 1, errorMessage: '庫存不足' },
      { queryName: 'markShipped', params: ['SHIPPED', 5], expectRows: 1 },
    ]);

    expect(res.success).toBe(false);
    expect(res.error).toBe('庫存不足');
    expect(executed).toContain('ROLLBACK');
    expect(executed).not.toContain('COMMIT');
    // 單據狀態那一步不該被執行到
    expect(executed.some((e) => e.sql === namedQueries.markShipped)).toBe(false);
  });

  it('每一步都有異動時正常提交', async () => {
    const { pool, executed } = makePool([1, 1]);
    const res = await runTransaction({ pool, namedQueries, prepareParams }, [
      { queryName: 'deductStock', params: [10, 1], expectRows: 1 },
      { queryName: 'markShipped', params: ['SHIPPED', 5], expectRows: 1 },
    ]);

    expect(res.success).toBe(true);
    expect(executed).toContain('COMMIT');
    expect(executed).not.toContain('ROLLBACK');
  });

  it('沒有設 expectRows 的步驟異動 0 筆屬正常，不會中止', async () => {
    // 例如「更新掛載硬體」：設備沒有掛載任何硬體時本來就是 0 筆
    const { pool, executed } = makePool([0, 1]);
    const res = await runTransaction({ pool, namedQueries, prepareParams }, [
      { queryName: 'markShipped', params: ['SHIPPED', 5] },
      { queryName: 'deductStock', params: [10, 1], expectRows: 1 },
    ]);

    expect(res.success).toBe(true);
    expect(executed).toContain('COMMIT');
  });

  it('未指定 errorMessage 時回傳的訊息要能指出是第幾步、哪支查詢', async () => {
    const { pool } = makePool([0]);
    const res = await runTransaction({ pool, namedQueries, prepareParams }, [
      { queryName: 'deductStock', params: [10, 1], expectRows: 1 },
    ]);

    expect(res.success).toBe(false);
    expect(res.error).toContain('第 1 步');
    expect(res.error).toContain('deductStock');
  });

  it('步驟參照 $ref 仍可取得前一步的結果', async () => {
    const { pool, executed } = makePool([1, 1]);
    const res = await runTransaction({ pool, namedQueries, prepareParams }, [
      { id: 'request', queryName: 'insertItem', params: [null], expectRows: 1 },
      { queryName: 'insertItem', params: [{ $ref: 'request.rows.0.id' }] },
    ]);

    expect(res.success).toBe(true);
    const second = executed.filter((e) => e.sql === namedQueries.insertItem)[1];
    expect(second.params).toEqual([1]);
  });
});
