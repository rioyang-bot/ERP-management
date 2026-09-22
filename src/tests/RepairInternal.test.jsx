import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RepairList from '../pages/RepairList';
import { queries } from '../../database/queries';
import { getRepairScopeLabel, getRepairSubLabel, hasCustomerContact, INTERNAL_LABEL } from '../utils/repairScope';

/**
 * 公司內部維修
 *
 * 維修單原本一定要填客戶名稱，但庫存裡有 389 台設備／硬體沒有客戶
 * （公司資產 6 台、尚未出貨的一般銷售品 383 台）。這些送修時只能在必填欄位
 * 硬編一個名字，客戶清單很快就會混進「本公司」「METECH」「自有」各種寫法，
 * 而且「這一季內部維修幾台」也查不出來。
 *
 * 改為在單上明確區分：客戶送修有客戶，公司內部沒有。
 */
describe('維修對象的顯示', () => {
  it('內部維修顯示公司內部，不是空白客戶', () => {
    expect(getRepairScopeLabel({ is_internal: true, customer_name: null })).toBe(INTERNAL_LABEL);
  });

  it('客戶送修顯示客戶名稱', () => {
    expect(getRepairScopeLabel({ is_internal: false, customer_name: '元大證券' })).toBe('元大證券');
  });

  it('內部維修就算資料裡殘留客戶也以內部為準', () => {
    expect(getRepairScopeLabel({ is_internal: true, customer_name: '不該出現' })).toBe(INTERNAL_LABEL);
  });

  it('兩者都沒有的舊資料仍給一個說法', () => {
    expect(getRepairScopeLabel({ is_internal: false, customer_name: '' })).toBe('未指定客戶');
    expect(getRepairScopeLabel({})).toBe('未指定客戶');
    expect(getRepairScopeLabel(null)).toBe('未指定客戶');
  });

  it('內部維修沒有客戶聯絡人', () => {
    expect(hasCustomerContact({ is_internal: true, contact_person: '某人' })).toBe(false);
    expect(hasCustomerContact({ is_internal: false, contact_person: '郭沛晴' })).toBe(true);
    expect(hasCustomerContact({ is_internal: false, contact_person: '  ' })).toBe(false);
  });
});

describe('維修單列表', () => {
  const ORDERS = [
    { id: 1, repair_no: 'RMA-01', customer_name: '元大證券', is_internal: false, status: 'ON_SITE_HANDLING', item_count: 1, items: [], created_at: '2026-09-22T00:00:00.000Z' },
    { id: 2, repair_no: 'RMA-02', customer_name: null, is_internal: true, status: 'ON_SITE_HANDLING', item_count: 1, items: [], created_at: '2026-09-22T00:00:00.000Z' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn((q) => Promise.resolve({ success: true, rows: q === 'fetchRepairOrders' ? ORDERS : [] })),
      runTransaction: vi.fn(), saveFile: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const show = async () => {
    render(<MemoryRouter><RepairList /></MemoryRouter>);
    await screen.findByText('RMA-01');
  };

  it('內部維修那一列顯示公司內部', async () => {
    await show();
    expect(screen.getByText('RMA-02').closest('tr')).toHaveTextContent(INTERNAL_LABEL);
  });

  it('客戶送修仍顯示客戶名稱', async () => {
    await show();
    expect(screen.getByText('RMA-01').closest('tr')).toHaveTextContent('元大證券');
  });

  it('可以用「公司內部」搜尋', async () => {
    await show();
    await userEvent.type(screen.getByPlaceholderText(/搜尋/), '公司內部');

    await waitFor(() => expect(screen.queryByText('RMA-01')).not.toBeInTheDocument());
    expect(screen.getByText('RMA-02')).toBeInTheDocument();
  });
});

describe('建單時的資料庫規則', () => {
  const sql = queries.createRepairOrder;

  it('內部維修不寫入客戶與聯絡人', () => {
    // 客戶、聯絡人、電話都以同一個旗標決定；逐欄比對比數個數可靠
    expect(sql).toContain("CASE WHEN $9::boolean THEN NULL ELSE NULLIF(TRIM(COALESCE($2, '')), '') END");
    expect(sql).toContain("CASE WHEN $9::boolean THEN NULL ELSE NULLIF(TRIM(COALESCE($7, '')), '') END");
    expect(sql).toContain("CASE WHEN $9::boolean THEN NULL ELSE NULLIF(TRIM(COALESCE($8, '')), '') END");
  });

  it('旗標沒傳時視為客戶送修，維持既有行為', () => {
    expect(sql).toContain('COALESCE($9::boolean, FALSE)');
  });

  it('可選設備帶出歸屬，內部維修才篩得出公司資產', () => {
    expect(queries.fetchAssetsForRepairSelection).toContain('a.ownership');
  });
});

describe('資料表的一致性條件', () => {
  it('migration 讓客戶名稱與旗標必須一致', async () => {
    const fs = await import('fs');
    const sql = fs.readFileSync('database/migration_repair_internal.sql', 'utf8');

    expect(sql).toContain('repair_orders_customer_matches_scope');
    expect(sql).toContain('is_internal = TRUE');
    expect(sql).toContain('is_internal = FALSE');
    // 客戶名稱不再強制有值，改由條件決定
    expect(sql).toContain('DROP NOT NULL');
  });
});

/**
 * 直接送原廠
 *
 * 還沒出給客戶的設備就在自己手上，沒有「到現場處理」或「取回」這回事，
 * 壞了是直接寄回原廠。這種單原本只能先建成現場處理、再按一次送修原廠，
 * 於是留下一個名不副實的現場處理日期。
 */
describe('起始階段', () => {
  const sql = queries.createRepairOrder;

  it('故障描述兩種階段都記', () => {
    // on_site_status 存的是故障描述，直接送原廠時同樣需要
    expect(sql).toContain('$4');
  });

  it('旗標沒傳時落到客戶送修，既有行為不變', () => {
    expect(sql).toContain('COALESCE($9::boolean, FALSE)');
  });
});

describe('詳情的流程時間軸', () => {
  it('略過現場處理的單會標示為不適用', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/components/RepairOrderDetailModal.jsx', 'utf8');

    expect(src).toContain('skippedOnSite');
    expect(src).toContain('不適用 (設備未出給客戶，直接送原廠)');
  });

  it('以「沒有現場日期但已有送原廠日期」判斷，不另外存欄位', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/components/RepairOrderDetailModal.jsx', 'utf8');

    expect(src).toContain('!repairOrder.on_site_date && !!repairOrder.send_oem_date');
  });
});

/**
 * 起始階段由維修對象決定，內部維修記的是供應商
 *
 * 客戶送修的東西在客戶端，一定先有現場處理或取回；內部的東西在自己手上，
 * 沒有現場可去，直接送原廠。兩者沒有第三種組合，因此不該讓人再選一次。
 *
 * 內部維修也沒有客戶聯絡人 —— 要追的是送回哪一家供應商。
 */
describe('維修對象決定起始階段與對象欄位', () => {
  const sql = queries.createRepairOrder;

  it('起始階段直接由內部旗標決定，沒有另一個參數', () => {
    expect(sql).toContain("CASE WHEN $9::boolean THEN 'SENT_OEM' ELSE 'ON_SITE_HANDLING' END");
    // 先前的 $10 起始階段參數已移除，$10/$11 改為供應商
    expect(sql).not.toContain('$10::boolean');
  });

  it('日期依同一個旗標寫到對應欄位', () => {
    expect(sql).toContain('CASE WHEN $9::boolean THEN NULL ELSE $3::date END');
    expect(sql).toContain('CASE WHEN $9::boolean THEN $3::date ELSE NULL END');
  });

  it('供應商只在內部維修時寫入', () => {
    expect(sql).toContain('CASE WHEN $9::boolean THEN $10::integer ELSE NULL END');
    expect(sql).toContain("CASE WHEN $9::boolean THEN NULLIF(TRIM(COALESCE($11, '')), '') ELSE NULL END");
  });

  it('供應商同時存 id 與名稱', () => {
    expect(sql).toContain('supplier_id');
    expect(sql).toContain('supplier_name');
  });
});

describe('對象底下的第二行', () => {
  it('客戶送修顯示聯絡人', () => {
    expect(getRepairSubLabel({ is_internal: false, contact_person: '郭沛晴' })).toBe('郭沛晴');
  });

  it('內部維修顯示送修的供應商', () => {
    expect(getRepairSubLabel({ is_internal: true, supplier_name: '肯微科技' })).toBe('送修：肯微科技');
  });

  it('內部維修還沒選供應商時不顯示', () => {
    expect(getRepairSubLabel({ is_internal: true, supplier_name: null })).toBe('');
    expect(getRepairSubLabel({ is_internal: true, supplier_name: '  ' })).toBe('');
  });

  it('內部維修不會顯示殘留的客戶聯絡人', () => {
    expect(getRepairSubLabel({ is_internal: true, contact_person: '不該出現', supplier_name: null })).toBe('');
  });

  it('缺資料時回空字串，不會是 undefined', () => {
    expect(getRepairSubLabel({})).toBe('');
    expect(getRepairSubLabel(null)).toBe('');
  });
});

describe('供應商的資料表規則', () => {
  it('供應商只屬於內部維修', async () => {
    const fs = await import('fs');
    const sql = fs.readFileSync('database/migration_repair_supplier.sql', 'utf8');

    expect(sql).toContain('repair_orders_supplier_only_internal');
    expect(sql).toContain('is_internal = TRUE');
  });

  it('供應商被刪除時單據留著，名稱仍看得到', async () => {
    const fs = await import('fs');
    const sql = fs.readFileSync('database/migration_repair_supplier.sql', 'utf8');

    expect(sql).toContain('ON DELETE SET NULL');
    // 名稱是另存的，不會跟著外來鍵一起消失
    expect(sql).toContain('supplier_name VARCHAR(100)');
  });
});

/**
 * 畫面上的說明要與實際行為一致
 *
 * 建單早就改成把設備標記為維修中，但幾處說明還停在舊行為，
 * 寫著「建立後將自動設為在庫」。使用者照著讀，自然會以為狀態沒改對。
 */
describe('設備狀態的說明文字', () => {
  const read = async (f) => (await import('fs')).readFileSync(f, 'utf8');

  it('建單畫面說的是維修中，不是在庫', async () => {
    const src = await read('src/components/RepairOrderRegistrationModal.jsx');

    expect(src).toContain('建立後將自動設為「維修中 (REPAIRING)」');
    expect(src).not.toContain('建立後將自動設為「在庫 (ACTIVE)」');
  });

  it('建單的說明會依維修對象調整', async () => {
    const src = await read('src/components/RepairOrderRegistrationModal.jsx');

    expect(src).toContain('公司自有或尚未出貨的設備');
    expect(src).toContain('自客戶端取回故障設備');
    // 兩種說法都要提到完工出貨才解除
    expect(src.match(/直到完工出貨才解除/g)).toHaveLength(2);
  });

  it('現場處理與送修原廠兩段都是維修中', async () => {
    const src = await read('src/components/RepairOrderDetailModal.jsx');
    const statuses = [...src.matchAll(/assetStatus: ([^,]+),/g)].map((m) => m[1].trim());

    // 後兩段依維修對象而異，另有測試涵蓋
    expect(statuses[0]).toBe("'REPAIRING (維修中)'");
    expect(statuses[1]).toBe("'REPAIRING (維修中)'");
    expect(statuses).toHaveLength(4);
  });

  it('原廠返還那一段不再說「已返還在庫」', async () => {
    const src = await read('src/components/RepairOrderDetailModal.jsx');

    expect(src).toContain('已返還，仍為維修中 (REPAIRING)');
    expect(src).not.toContain('已返還在庫 (ACTIVE)');
  });
});

/**
 * 內部維修在原廠返還時結案
 *
 * 公司自有或尚未出貨的設備沒有客戶可以出貨，原廠修好寄回、東西回到自己
 * 庫房，這張單就完成了。硬要再按一次「客戶出貨」不只多餘，還會把設備
 * 設成出庫 —— 明明就在庫房裡。
 */
describe('內部維修的終點', () => {
  const sql = queries.updateRepairOEMReturn;

  it('內部維修返還時直接結案', () => {
    expect(sql).toContain("CASE WHEN $5::boolean THEN 'COMPLETED' ELSE 'OEM_RETURNED' END");
  });

  it('完工日期就是返還日期', () => {
    expect(sql).toContain('CASE WHEN $5::boolean THEN $1::date ELSE completion_date END');
  });

  it('客戶送修不受影響，仍要再經過一次出貨', () => {
    expect(sql).toContain("ELSE 'OEM_RETURNED'");
    // 旗標沒傳時 CASE 落到 ELSE，維持舊行為
    expect(sql).not.toContain('COALESCE($5');
  });

  it('返還後設備回到在庫而不是出庫', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/components/RepairActionModal.jsx', 'utf8');

    expect(src).toContain("const returnStatus = isInternal ? 'ACTIVE' : 'REPAIRING'");
  });

  it('返還彈窗的說明講明這是結案', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/components/RepairActionModal.jsx', 'utf8');

    expect(src).toContain('原廠修復寄回並結案');
    expect(src).toContain('確認返還並結案 (設為在庫)');
  });

  it('列表不會對內部維修顯示客戶出貨的按鈕', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/pages/RepairList.jsx', 'utf8');

    expect(src).toContain("order.status === 'OEM_RETURNED' && !order.is_internal");
  });

  it('時間軸把客戶出貨那一段標為不適用', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/components/RepairOrderDetailModal.jsx', 'utf8');

    expect(src).toContain('客戶完工出貨（不適用）');
    expect(src).toContain('不適用 (公司內部維修，返還入庫即結案)');
  });

  it('時間軸的設備狀態：內部維修返還後是在庫', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/components/RepairOrderDetailModal.jsx', 'utf8');
    const statuses = [...src.matchAll(/assetStatus: ([^,]+),/g)].map((m) => m[1].trim());

    expect(statuses[2]).toBe("isInternal ? 'ACTIVE (在庫)' : 'REPAIRING (維修中)'");
    expect(statuses[3]).toBe("isInternal ? 'ACTIVE (在庫)' : 'SHIPPED (出庫)'");
  });
});
