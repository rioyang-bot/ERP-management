import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RepairActionModal from '../components/RepairActionModal';
import { queries } from '../../database/queries';
import { aggregateCards } from '../utils/cardAggregation';

/**
 * 進了維修單的設備一律標記維修，直到完工出貨
 *
 * 先前建立維修單時把設備設成「在庫」（註解寫「自客戶端取回放置在庫檢測」），
 * 原廠返還時又設回「在庫」—— 結果是整個維修過程中，設備在列表上看起來
 * 都像是可以拿去用的庫存。實際上資料庫裡連一台 REPAIRING 都沒有。
 *
 * 現在從建單到完工出貨全程維持 REPAIRING，卡片上的「維修」數量才有意義。
 */
const ORDER = {
  id: 7, repair_no: 'RMA-20260921-01', customer_name: '元大Yuanta',
  status: 'SENT_OEM', no_oem_required: false,
  items: [{ id: 1, sn: 'SRV-001' }, { id: 2, sn: 'SRV-002' }],
};

describe('原廠返還', () => {
  const namedQuery = vi.fn();
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      return Promise.resolve({ success: true, rows: [{ id: 7 }] });
    });
    window.electronAPI = { namedQuery, runTransaction: vi.fn(), saveFile: vi.fn() };
  });

  const statusCalls = () => calls.filter((c) => c.query === 'updateAssetStatusBySn');

  it('返還之後設備維持維修中，不會回到在庫', async () => {
    render(<RepairActionModal isOpen onClose={() => {}} repairOrder={ORDER}
      actionType="OEM_RETURN" onSuccess={() => {}} />);
    await userEvent.type(await screen.findByPlaceholderText(/OS 重灌/), '更換主機板');
    await userEvent.click(screen.getByRole('button', { name: /確認原廠返還/ }));

    await waitFor(() => expect(statusCalls()).toHaveLength(2));
    statusCalls().forEach((c) => expect(c.params[0]).toBe('REPAIRING'));
  });

  it('按鈕與說明講的是維持維修中，不是設為在庫', async () => {
    render(<RepairActionModal isOpen onClose={() => {}} repairOrder={ORDER}
      actionType="OEM_RETURN" onSuccess={() => {}} />);

    expect(await screen.findByRole('button', { name: /維持維修中/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /設為在庫/ })).not.toBeInTheDocument();
  });

  it('完工出貨才解除維修，設為出庫', async () => {
    render(<RepairActionModal isOpen onClose={() => {}} repairOrder={{ ...ORDER, status: 'OEM_RETURNED' }}
      actionType="COMPLETE" onSuccess={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /確認出貨完工/ }));

    await waitFor(() => expect(statusCalls()).toHaveLength(2));
    statusCalls().forEach((c) => expect(c.params[0]).toBe('SHIPPED'));
  });

  it('自行維修完工同樣是出庫', async () => {
    render(<RepairActionModal isOpen onClose={() => {}}
      repairOrder={{ ...ORDER, status: 'ON_SITE_HANDLING', no_oem_required: true }}
      actionType="IN_HOUSE_COMPLETE" onSuccess={() => {}} />);
    await userEvent.type(await screen.findByPlaceholderText(/重新插拔記憶體/), '重開機正常');
    await userEvent.click(screen.getByRole('button', { name: /確認自行維修完工/ }));

    await waitFor(() => expect(statusCalls()).toHaveLength(2));
    statusCalls().forEach((c) => expect(c.params[0]).toBe('SHIPPED'));
  });
});

describe('刪除維修單時的還原', () => {
  const sql = queries.restoreAssetsFromRepair;

  it('只還原還停在維修中的設備', () => {
    expect(sql).toContain("a.status = 'REPAIRING'");
    expect(sql).toContain("SET status = 'ACTIVE'");
  });

  it('已完工出貨或報廢的不會被改動', () => {
    // 條件限定 REPAIRING，其餘狀態一概不碰
    expect(sql).not.toContain("status IN (");
    expect(sql).toContain('RETURNING');
  });

  it('以序號比對，忽略大小寫與前後空白', () => {
    expect(sql).toContain('UPPER(TRIM(a.sn)) = UPPER(TRIM(ri.sn))');
  });
});

describe('卡片上的維修計數', () => {
  it('REPAIRING 計入維修，不計入在庫', () => {
    const rows = [
      { brand: 'DELL', type: 'SERVER', model: 'R760', specification: '', status: 'REPAIRING' },
      { brand: 'DELL', type: 'SERVER', model: 'R760', specification: '', status: 'REPAIRING' },
      { brand: 'DELL', type: 'SERVER', model: 'R760', specification: '', status: 'ACTIVE' },
    ];
    const st = Object.values(aggregateCards(rows, 'SPEC', []).activeStatsMap)[0];

    expect(st.repair).toBe(2);
    expect(st.active).toBe(1);
    expect(st.total).toBe(3);
  });

  it.each([
    ['設備列表', 'src/pages/DeviceList.jsx'],
    ['硬體列表', 'src/pages/HwList.jsx'],
  ])('%s 的計數標籤是「維修」而不是「故障」', async (_label, file) => {
    const fs = await import('fs');
    const src = fs.readFileSync(file, 'utf8');
    const rows = src.split('\n').filter((l) => l.includes('{st.repair}'));

    expect(rows.length).toBe(3);
    rows.forEach((row) => {
      expect(row).toContain('>維修</span>');
      expect(row).not.toContain('>故障</span>');
    });
  });
});

/**
 * 硬體與設備的維修狀態要講同一種話
 *
 * 硬體列表原本自己用 'REPAIR'，維修流程與設備列表用的是 'REPAIRING'。
 * 兩邊在卡片統計上都算「維修」，但硬體列表的狀態標籤只認得 REPAIR ——
 * 被維修單標成 REPAIRING 的硬體會掉進預設值，顯示成「在庫」。
 */
describe('維修狀態的用詞', () => {
  const read = async (file) => {
    const fs = await import('fs');
    return fs.readFileSync(file, 'utf8');
  };

  it('硬體列表認得 REPAIRING，不會顯示成在庫', async () => {
    const src = await read('src/pages/HwList.jsx');
    expect(src).toContain("case 'REPAIRING':");
    expect(src).toContain("case 'REPAIR':");
  });

  it('硬體列表的選單寫入 REPAIRING，與維修流程一致', async () => {
    const src = await read('src/pages/HwList.jsx');
    const line = src.split('\n').find((l) => l.includes('標記為維修'));

    expect(line).toBeTruthy();
    expect(line).toContain("'REPAIRING'");
    expect(line).not.toContain("'REPAIR',");
  });

  it('硬體列表已無「故障」字樣', async () => {
    const src = await read('src/pages/HwList.jsx');
    expect(src).not.toContain('故障');
  });

  it('兩種寫法在排序上同樣優先', async () => {
    const src = await read('src/pages/HwList.jsx');
    const line = src.split('\n').find((l) => l.includes('statusPriority'));

    expect(line).toContain("'REPAIRING': 1");
    expect(line).toContain("'REPAIR': 1");
  });

  it('兩種寫法都計入卡片的維修數量', () => {
    const rows = [
      { brand: 'X', type: 'NIC', model: 'M', specification: '', status: 'REPAIR' },
      { brand: 'X', type: 'NIC', model: 'M', specification: '', status: 'REPAIRING' },
    ];
    const st = Object.values(aggregateCards(rows, 'SPEC', []).activeStatsMap)[0];
    expect(st.repair).toBe(2);
  });
});
