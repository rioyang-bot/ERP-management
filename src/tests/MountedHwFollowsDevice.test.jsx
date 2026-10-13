import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DNList from '../pages/DNList';
import RepairActionModal from '../components/RepairActionModal';
import { RoleContext } from '../context/RoleContext';
import { queries } from '../../database/queries';

/**
 * 搭載硬體的狀態跟著設備
 *
 * 先前只有設備列表手動改狀態會連動。確認出貨、借出／歸還、維修、換貨、
 * 設備出貨後才掛上去的硬體都不會，硬體列表就出現「設備已出貨、硬體還在庫」，
 * 硬體的在庫數量也跟著灌水。
 */
describe('查詢與資料修正', () => {
  it('同步只看在庫／已出貨／借出／維修中；報廢的不動；序號忽略大小寫與空白', () => {
    for (const q of [queries.syncMountedHardwareToDevice, queries.syncHardwareToItsDevice]) {
      expect(q).toContain("d.status IN ('ACTIVE', 'SHIPPED', 'LENT', 'REPAIRING')");
      expect(q).toContain("COALESCE(h.status, '') NOT IN ('SCRAPPED', 'PENDING_SCRAP')");
      // 硬體的 server_sn 對到設備序號，兩邊都去空白、轉小寫
      expect(q).toMatch(/TRIM\(LOWER\(h\.custom_attributes->>'server_sn'\)\) = TRIM\(LOWER\(d\.sn\)\)|TRIM\(LOWER\(d\.sn\)\) = TRIM\(LOWER\(h\.custom_attributes->>'server_sn'\)\)/);
      expect(q).toContain('SET status = d.status');
    }
  });

  it('資料修正一次對齊既有的不一致，條件與程式相同，並列在遷移清單（資料修正）', () => {
    const root = path.resolve(__dirname, '../..');
    const sql = fs.readFileSync(path.join(root, 'database/migration_mounted_hw_status_sync.sql'), 'utf8');
    expect(sql).toContain("d.status IN ('ACTIVE', 'SHIPPED', 'LENT', 'REPAIRING')");
    expect(sql).toContain("NOT IN ('SCRAPPED', 'PENDING_SCRAP')");
    expect(sql).toContain('h.status IS DISTINCT FROM d.status');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'database/migrations.manifest.json'), 'utf8'));
    expect(manifest.migrations.find((m) => m.file === 'migration_mounted_hw_status_sync.sql')?.type).toBe('data');
  });
});

describe('出貨單確認出貨', () => {
  const DN = {
    id: 7, request_no: 'DN-20261013-01', request_type: 'SALE', customer: '凱基', location: 'COLO',
    shipping_date: '2026-10-13', status: 'PENDING', item_count: 1, creator_name: 'Admin',
  };
  const ITEMS = [{ id: 1, item_id: 10, brand: 'BLACKCORE', model: '3122-SM', type: 'SERVER', category_name: '設備', sn: 'DEV-1', quantity: 1, location: 'COLO' }];
  let txSteps;
  beforeEach(() => {
    vi.clearAllMocks();
    txSteps = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.electronAPI = {
      namedQuery: vi.fn(async (query) => {
        if (query === 'fetchDNList') return { success: true, rows: [DN] };
        if (query === 'fetchDNItems') return { success: true, rows: ITEMS };
        if (query === 'checkAssetActive') return { success: true, rows: [{ status: 'ACTIVE' }] };
        return { success: true, rows: [] };
      }),
      runTransaction: vi.fn(async (steps) => { txSteps.push(steps); return { success: true, results: {} }; }),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  it('設備改成已出貨之後，掛在上面的硬體跟著同步', async () => {
    render(
      <MemoryRouter>
        <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1 }, setAuthUser: vi.fn() }}>
          <DNList />
        </RoleContext.Provider>
      </MemoryRouter>
    );
    const row = (await screen.findByText(DN.request_no)).closest('tr');
    await userEvent.click(within(row).getByTitle('查看詳情'));
    await userEvent.click(await screen.findByRole('button', { name: /確認出貨/ }));
    await waitFor(() => expect(txSteps).toHaveLength(1));
    const names = txSteps[0].map((s) => s.queryName);
    const statusIdx = names.indexOf('updateAssetStatusLocationAndInstalledDateBySn');
    const syncIdx = names.indexOf('syncMountedHardwareToDevice');
    expect(syncIdx).toBeGreaterThan(statusIdx);
    expect(txSteps[0][syncIdx].params).toEqual(['DEV-1']);
  });
});

describe('維修單完工出貨', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn(async (query, params) => {
        if (query === 'updateRepairCompleted') return { success: true, rows: [{ id: params[2] }] };
        return { success: true, rows: [] };
      }),
    };
  });

  it('設備改成已出貨後，搭載硬體跟著同步', async () => {
    const order = { id: 3, repair_no: 'RMA-1', customer_name: '凱基', status: 'OEM_RETURNED', items: [{ id: 1, sn: 'DEV-1' }] };
    render(<RepairActionModal isOpen repairOrder={order} actionType="COMPLETE" onClose={vi.fn()} onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /確認出貨完工/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    const calls = window.electronAPI.namedQuery.mock.calls.map(([q, p]) => [q, p]);
    const statusIdx = calls.findIndex(([q, p]) => q === 'updateAssetStatusBySn' && p[0] === 'SHIPPED');
    const syncIdx = calls.findIndex(([q]) => q === 'syncMountedHardwareToDevice');
    expect(statusIdx).toBeGreaterThanOrEqual(0);
    expect(syncIdx).toBeGreaterThan(statusIdx);
    expect(calls[syncIdx][1]).toEqual(['DEV-1']);
  });
});
