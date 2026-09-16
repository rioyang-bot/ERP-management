import { describe, it, expect } from 'vitest';
import {
  buildFillPlan,
  buildFillParams,
  buildSnListParam,
  getKeptFieldLabels,
  indexAssetsBySn,
  isEmptyValue,
  FILLABLE_COLUMNS,
} from '../utils/assetFillImport';
import { queries } from '../../database/queries';

/**
 * 重新匯入補齊既有資產的空白欄位
 *
 * 規則只有一條，而且不留例外：已經有值的欄位一律不動。
 * 匯入檔的內容不見得比系統裡的新，覆蓋過去就救不回來了。
 */
describe('判斷欄位是不是空的', () => {
  it('null、undefined、空字串與只有空白都算沒填', () => {
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue('   ')).toBe(true);
  });

  it('有內容就不算空', () => {
    expect(isEmptyValue('A')).toBe(false);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue(new Date())).toBe(false);
  });
});

describe('算出可以補進去的欄位', () => {
  const existing = {
    id: 99,
    sn: 'SN-1',
    client: '',              // 空 → 可補
    hostname: null,          // 空 → 可補
    location: '台北機房',     // 已有值 → 不可動
    remarks: '   ',          // 只有空白 → 可補
    installed_date: null,
    customer_warranty_expire: null,
    system_date: null,
    warranty_expire: new Date('2030-01-01'),
    custom_attributes: { project_name: '既有專案', end_user: '' },
  };

  const row = {
    sn: 'SN-1',
    client: '新客戶',
    hostname: 'HOST-1',
    location: '高雄機房',
    remarks: '新備註',
    installed_date: '2026-01-05',
    warranty_expire: '2099-12-31',
    custom_attributes: { project_name: '檔案裡的專案', end_user: '小王' },
  };

  it('只挑出系統裡是空的、而檔案裡有值的欄位', () => {
    const plan = buildFillPlan(existing, row);
    expect(Object.keys(plan.columns).sort()).toEqual(['client', 'hostname', 'installed_date', 'remarks']);
    expect(plan.columns.client).toBe('新客戶');
  });

  it('系統裡已經有值的欄位一律不碰', () => {
    const plan = buildFillPlan(existing, row);
    expect(plan.columns).not.toHaveProperty('location');
    expect(plan.columns).not.toHaveProperty('warranty_expire');
  });

  it('自訂屬性同樣只補空的', () => {
    const plan = buildFillPlan(existing, row);
    expect(plan.attributes).toEqual({ end_user: '小王' });
    expect(plan.attributes).not.toHaveProperty('project_name');
  });

  it('列出將補上哪些欄位，讓使用者先看得到', () => {
    const plan = buildFillPlan(existing, row);
    expect(plan.labels).toContain('客戶');
    expect(plan.labels).toContain('End-user');
    expect(plan.count).toBe(5);
  });

  it('檔案裡沒填的欄位不會被拿來把既有資料洗成空的', () => {
    const plan = buildFillPlan(existing, { sn: 'SN-1', client: '  ', hostname: '' });
    expect(plan).toBeNull();
  });

  it('沒有任何空白可補時回傳 null，不會送出無意義的更新', () => {
    const full = {
      ...existing,
      client: 'A', hostname: 'B', remarks: 'C', installed_date: '2020-01-01',
      custom_attributes: { project_name: '既有專案', end_user: '既有使用者' },
    };
    expect(buildFillPlan(full, row)).toBeNull();
  });

  it('自訂欄位用設定的名稱顯示，看得出是哪一欄', () => {
    const plan = buildFillPlan(
      { id: 1, sn: 'S', custom_attributes: {} },
      { sn: 'S', custom_attributes: { mac_addr: '00:11:22' } },
      { attributeLabels: { mac_addr: 'MAC 位址' } }
    );
    expect(plan.labels).toEqual(['MAC 位址']);
  });

  it('匯入自己留下的紀錄不算資料，不會被當成要補的欄位', () => {
    const plan = buildFillPlan(
      { id: 1, sn: 'S', custom_attributes: {} },
      { sn: 'S', custom_attributes: { batch_imported: true, import_file: 'a.xlsx', import_date: '2026-01-01' } }
    );
    expect(plan).toBeNull();
  });

  it('缺少既有資料或匯入列時回傳 null，不會出錯', () => {
    expect(buildFillPlan(null, row)).toBeNull();
    expect(buildFillPlan(existing, null)).toBeNull();
  });
});

describe('告知哪些欄位因為已有資料而保留原值', () => {
  it('兩邊都有值但內容不同時列出來', () => {
    const kept = getKeptFieldLabels(
      { location: '台北機房', client: '原客戶' },
      { location: '高雄機房', client: '原客戶' }
    );
    expect(kept).toEqual(['位置']);
  });

  it('內容一樣就不用提醒', () => {
    expect(getKeptFieldLabels({ client: 'A' }, { client: 'A' })).toEqual([]);
  });

  it('日期格式不同但其實是同一天，不算被保留', () => {
    const kept = getKeptFieldLabels(
      { installed_date: new Date('2026-01-05T00:00:00Z') },
      { installed_date: '2026-01-05' }
    );
    expect(kept).toEqual([]);
  });
});

describe('組出寫入用的參數', () => {
  it('沒有要補的欄位傳 null，SQL 端就會維持原值', () => {
    const plan = buildFillPlan(
      { id: 7, sn: 'S', client: '', custom_attributes: {} },
      { sn: 'S', client: '新客戶' }
    );
    const params = buildFillParams(plan);

    expect(params[0]).toBe(7);
    // 第一個欄位是客戶，其餘欄位都沒有值
    expect(params[1]).toBe('新客戶');
    expect(params.slice(2, 1 + FILLABLE_COLUMNS.length)).toEqual(new Array(FILLABLE_COLUMNS.length - 1).fill(null));
  });

  it('參數個數與欄位定義一致，避免改欄位時漏改 SQL', () => {
    const plan = buildFillPlan({ id: 1, sn: 'S', custom_attributes: {} }, { sn: 'S', client: 'A' });
    // 資產 id + 每個可補欄位 + 自訂屬性
    expect(buildFillParams(plan)).toHaveLength(1 + FILLABLE_COLUMNS.length + 1);
  });

  it('可一併帶上這次補齊的來源，日後查得到是哪個檔案補的', () => {
    const plan = buildFillPlan({ id: 1, sn: 'S', custom_attributes: {} }, { sn: 'S', client: 'A' });
    const params = buildFillParams(plan, { fill_import_file: 'a.xlsx' });
    expect(params.at(-1)).toEqual({ fill_import_file: 'a.xlsx' });
  });

  it('自訂屬性以物件傳出，不是 JSON 字串', () => {
    // 字串參數會被伺服器的安全過濾洗掉 ( ) + @ 等字元，JSON 內容會被改壞
    const plan = buildFillPlan(
      { id: 1, sn: 'S', custom_attributes: {} },
      { sn: 'S', custom_attributes: { contact_person: '吳沛恆 (Sales) & 分機+123' } }
    );
    const attrs = buildFillParams(plan).at(-1);
    expect(typeof attrs).toBe('object');
    expect(attrs.contact_person).toBe('吳沛恆 (Sales) & 分機+123');
  });
});

/**
 * 使用者回報：87 筆序號全部標成重複、可補齊卻是 0 筆，確認匯入按鈕整個點不下去。
 *
 * 原因是序號清單以「陣列」當查詢參數傳出去。具名查詢的參數前處理會把物件
 * （陣列也是物件）轉成 JSON 字串，$1::text[] 收到 ["A","B"] 直接轉型失敗，
 * 查詢整個報錯，既有資料一筆也讀不到，算出來自然是 0 筆可補。
 */
describe('序號清單的查詢參數', () => {
  it('組成逗號分隔的字串，而不是陣列', () => {
    expect(buildSnListParam(['a-1', 'b-2'])).toBe('A-1,B-2');
    expect(typeof buildSnListParam(['a'])).toBe('string');
  });

  it('大小寫與前後空白都正規化，才對得上資料庫的比對方式', () => {
    expect(buildSnListParam([' dfe322328070001 '])).toBe('DFE322328070001');
  });

  it('空值不會產生多餘的分隔符號', () => {
    expect(buildSnListParam(['A', '', null, ' ', 'B'])).toBe('A,B');
    expect(buildSnListParam([])).toBe('');
    expect(buildSnListParam(null)).toBe('');
  });

  it('查詢以逗號拆解字串，與組參數的方式一致', () => {
    // 換行不能當分隔符號：伺服器的參數過濾會把 CR/LF 濾掉
    expect(queries.fetchAssetsBySnListForFill).toContain("string_to_array($1, ',')");
    expect(queries.fetchAssetsBySnListForFill).not.toContain('$1::text[]');
  });
});

describe('以序號對應既有資產', () => {
  it('不分大小寫與前後空白', () => {
    const map = indexAssetsBySn([{ id: 1, sn: ' sn-1 ' }]);
    expect(map.get('SN-1').id).toBe(1);
  });

  it('沒有序號的資料不會進來，也不會出錯', () => {
    expect(indexAssetsBySn([{ id: 1 }, null]).size).toBe(0);
    expect(indexAssetsBySn(null).size).toBe(0);
  });
});

describe('補齊用的 SQL 本身就擋掉覆蓋', () => {
  const sql = queries.fillEmptyAssetFieldsBySn;

  it('文字欄位先判斷既有值是不是空的才寫入', () => {
    ['client', 'hostname', 'location', 'remarks'].forEach((col) => {
      // 前端算好的結果仍可能過期（預覽到寫入之間別人填了），因此 SQL 要自己擋
      expect(sql).toContain(`${col} = CASE WHEN COALESCE(TRIM(${col}), '') = '' THEN`);
    });
  });

  it('日期欄位以 COALESCE 保留既有值', () => {
    ['installed_date', 'customer_warranty_expire', 'system_date', 'warranty_expire'].forEach((col) => {
      expect(sql).toContain(`${col} = COALESCE(${col},`);
    });
  });

  it('自訂屬性以既有的為底再合併，不會整包換掉', () => {
    expect(sql).toContain("custom_attributes = COALESCE(custom_attributes, '{}'::jsonb) ||");
  });

  it('狀態與歸屬不在補齊範圍內，那是流程算出來的', () => {
    expect(sql).not.toMatch(/\bstatus\s*=/);
    expect(sql).not.toMatch(/\bownership\s*=/);
  });

  it('只動指定的那一筆資產', () => {
    expect(sql).toContain('WHERE id = $1');
    // 沒有 RETURNING 就分不出「真的改到」與「條件不成立」
    expect(sql).toContain('RETURNING id, sn');
  });
});
