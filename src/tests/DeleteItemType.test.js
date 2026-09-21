import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteItemType } from '../utils/deleteItemType';
import { queries } from '../../database/queries';

/**
 * 移除打錯的類型
 *
 * 類型只能在新增品項時順手建立，打錯字之後沒有任何畫面能移除，
 * 只能一直留在下拉選單裡。deleteDeviceType 這支查詢存在但從未被呼叫。
 *
 * 條件是「沒有任何品項在用」：item_models.type_id 是 ON DELETE CASCADE，
 * 刪掉類型會連帶帶走它底下的型號。
 */
describe('移除類型', () => {
  let api, calls;

  const setup = ({ used = 0, deleted = 1, countOk = true, delOk = true } = {}) => {
    calls = [];
    api = {
      namedQuery: vi.fn((query, params) => {
        calls.push({ query, params });
        if (query === 'countItemMasterByType') {
          return Promise.resolve(countOk
            ? { success: true, rows: [{ used }] }
            : { success: false, error: '連線異常' });
        }
        if (query === 'deleteItemTypeIfUnused') {
          return Promise.resolve(delOk
            ? { success: true, rows: deleted ? [{ id: 1, name: 'RARITAN' }] : [] }
            : { success: false, error: '資料庫忙碌' });
        }
        return Promise.resolve({ success: true, rows: [] });
      }),
    };
  };

  beforeEach(() => { vi.clearAllMocks(); setup(); });

  it('沒有品項在用就移除', async () => {
    const r = await deleteItemType(api, 'RARITAN', '設備');

    expect(r.ok).toBe(true);
    expect(r.message).toContain('已移除');
    expect(calls.map((c) => c.query)).toEqual(['countItemMasterByType', 'deleteItemTypeIfUnused']);
  });

  it('有品項在用就擋下，並說明有幾筆', async () => {
    setup({ used: 12 });
    const r = await deleteItemType(api, 'SERVER', '設備');

    expect(r.ok).toBe(false);
    expect(r.used).toBe(12);
    expect(r.message).toContain('已有 12 筆設備在使用');
    // 擋下時不該送出刪除
    expect(calls.map((c) => c.query)).toEqual(['countItemMasterByType']);
  });

  it('查不到使用狀況時不硬刪', async () => {
    setup({ countOk: false });
    const r = await deleteItemType(api, 'RARITAN', '設備');

    expect(r.ok).toBe(false);
    expect(r.message).toContain('無法確認使用狀況');
    expect(calls.map((c) => c.query)).toEqual(['countItemMasterByType']);
  });

  it('查詢與刪除之間有人開始使用時，回報而不是假裝成功', async () => {
    setup({ used: 0, deleted: 0 });
    const r = await deleteItemType(api, 'RARITAN', '設備');

    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/剛剛已有資料開始使用|已被其他人移除/);
  });

  it('刪除失敗時回報原因', async () => {
    setup({ delOk: false });
    const r = await deleteItemType(api, 'RARITAN', '設備');

    expect(r.ok).toBe(false);
    expect(r.message).toContain('資料庫忙碌');
  });

  it.each([
    ['', '空字串'], ['   ', '只有空白'], [null, 'null'], [undefined, 'undefined'],
  ])('沒有指定類型時不動作（%s）', async (name) => {
    const r = await deleteItemType(api, name, '設備');

    expect(r.ok).toBe(false);
    expect(api.namedQuery).not.toHaveBeenCalled();
  });

  it('類別會一起傳下去，不會誤刪其他類別的同名類型', async () => {
    await deleteItemType(api, 'DUPNAME', '硬體');

    calls.forEach((c) => expect(c.params[1]).toBe('硬體'));
  });
});

describe('移除類型的資料庫護欄', () => {
  const sql = queries.deleteItemTypeIfUnused;

  it('SQL 本身也檢查有沒有人在用，不是只靠前端先查一次', () => {
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('item_master');
  });

  it('限定類別，避免誤刪其他類別的同名類型', () => {
    expect(sql).toContain('c.name = $2');
  });

  it('比對忽略大小寫與前後空白', () => {
    expect(sql).toContain('UPPER(TRIM(t.name)) = UPPER(TRIM($1))');
  });

  it('回傳資料列，沒刪到時呼叫端才知道', () => {
    expect(sql).toContain('RETURNING');
  });
});
