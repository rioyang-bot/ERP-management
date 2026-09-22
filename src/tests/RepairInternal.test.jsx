import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RepairList from '../pages/RepairList';
import { queries } from '../../database/queries';
import { getRepairScopeLabel, hasCustomerContact, INTERNAL_LABEL } from '../utils/repairScope';

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
    expect(sql).toContain('CASE WHEN $9::boolean THEN NULL');
    // 客戶、聯絡人、電話三個欄位都要受同一個旗標控制
    expect(sql.match(/CASE WHEN \$9::boolean THEN NULL/g)).toHaveLength(3);
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

  it('第十個參數決定從哪一階段起算', () => {
    expect(sql).toContain("CASE WHEN $10::boolean THEN 'SENT_OEM' ELSE 'ON_SITE_HANDLING' END");
  });

  it('起始日期依階段寫到對應欄位，不會兩邊都填', () => {
    expect(sql).toContain('CASE WHEN $10::boolean THEN NULL ELSE $3::date END');
    expect(sql).toContain('CASE WHEN $10::boolean THEN $3::date ELSE NULL END');
  });

  it('故障描述兩種階段都記', () => {
    // on_site_status 存的是故障描述，直接送原廠時同樣需要
    expect(sql).toContain('$4');
  });

  it('沒傳時維持現場處理起算，既有行為不變', () => {
    // $10 為 null 時 CASE 落到 ELSE
    expect(sql).not.toContain('COALESCE($10');
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
