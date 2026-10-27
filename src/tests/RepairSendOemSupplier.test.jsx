import React from 'react';
import fs from 'fs';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RepairActionModal from '../components/RepairActionModal';
import RepairOrderDetailModal from '../components/RepairOrderDetailModal';
import { queries } from '../../database/queries';

/**
 * 客戶送修也要記送去哪一家供應商
 *
 * 原本只有公司內部維修在建單時選供應商，客戶送修的單送出原廠後
 * 看不出是寄到哪一家。改成在「送修原廠」那一步選，明細上也能更正。
 */
const SUPPLIERS = [
  { id: 11, name: '技嘉 Gigabyte', contact: '王小明' },
  { id: 12, name: '華碩 ASUS', contact: null },
];

/** insertAuditLog 的參數順序見 utils/auditLogger.js */
const auditLogs = () => window.electronAPI.namedQuery.mock.calls
  .filter(([q]) => q === 'insertAuditLog')
  .map(([, p]) => ({ actionType: p[3], module: p[4], target: p[6], summary: p[8], details: p[9] }));

const calledWith = (query) => window.electronAPI.namedQuery.mock.calls.filter(([q]) => q === query).map(([, p]) => p);

const mockDb = () => {
  window.electronAPI = {
    namedQuery: vi.fn(async (query, params) => {
      if (query === 'fetchSuppliers') return { success: true, rows: SUPPLIERS };
      if (query === 'updateAssetStatusBySn') {
        return { success: true, rows: [{ id: 9, sn: params[1], old_status: 'REPAIRING' }] };
      }
      if (query === 'syncMountedHardwareToDevice') return { success: true, rows: [] };
      return { success: true, rows: [{ id: 3 }] };
    }),
    runTransaction: vi.fn(),
  };
};

const order = (extra = {}) => ({
  id: 3, repair_no: 'RMA-1', customer_name: '凱基', status: 'ON_SITE_HANDLING',
  is_internal: false, items: [{ id: 1, sn: 'DEV-1', brand: 'GIGABYTE', model: 'G293' }], ...extra,
});

describe('送修原廠選供應商', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    mockDb();
  });

  const openSendOem = (o = order()) => render(
    <RepairActionModal isOpen repairOrder={o} actionType="SEND_OEM" onClose={vi.fn()} onSuccess={vi.fn()} />
  );

  it('客戶送修的單可以選供應商，存進維修單', async () => {
    openSendOem();
    const select = screen.getByLabelText(/送修供應商/);
    await waitFor(() => expect(screen.getByRole('option', { name: '技嘉 Gigabyte（王小明）' })).toBeInTheDocument());
    await userEvent.selectOptions(select, '11');
    await userEvent.click(screen.getByRole('button', { name: /確認送修原廠/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    const [params] = calledWith('updateRepairSendOEM');
    expect(params[2]).toBe(3);
    expect(params[3]).toBe(11);
    expect(params[4]).toBe('技嘉 Gigabyte');
    expect(queries.updateRepairSendOEM).toContain('supplier_id = $4::integer');
    expect(queries.updateRepairSendOEM).toContain('supplier_name');
  });

  it('事件紀錄：維修單一筆帶供應商，設備歷程一筆寫明送去哪一家', async () => {
    openSendOem();
    await waitFor(() => expect(screen.getByRole('option', { name: '華碩 ASUS' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/送修供應商/), '12');
    await userEvent.click(screen.getByRole('button', { name: /確認送修原廠/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    const logs = auditLogs();
    const repair = logs.filter((l) => l.module === 'REPAIR');
    expect(repair).toHaveLength(1);
    expect(repair[0].target).toBe('RMA-1');
    expect(repair[0].details).toMatchObject({ repairNo: 'RMA-1', action: 'SEND_OEM', supplier: '華碩 ASUS' });

    const dev = logs.filter((l) => l.module === 'DEVICE');
    expect(dev).toHaveLength(1);
    expect(dev[0]).toMatchObject({ target: 'DEV-1', summary: '維修單 [RMA-1] 寄出送修原廠 [華碩 ASUS]' });
    // 設備本來就是維修中，記的是實際的原狀態，不是在庫
    expect(dev[0].details).toMatchObject({ status: 'REPAIRING', repairNo: 'RMA-1', supplier: '華碩 ASUS' });
  });

  it('不選也能送出，供應商留空', async () => {
    openSendOem();
    await userEvent.click(screen.getByRole('button', { name: /確認送修原廠/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    const [params] = calledWith('updateRepairSendOEM');
    expect(params[3]).toBeNull();
    expect(params[4]).toBeNull();
    expect(auditLogs().find((l) => l.module === 'DEVICE').summary).toBe('維修單 [RMA-1] 寄出送修原廠');
  });

  it('單上已有供應商就帶入；已停用不在清單裡也看得到、不會被清掉', async () => {
    openSendOem(order({ supplier_id: 99, supplier_name: '已停用的廠商' }));
    expect(screen.getByLabelText(/送修供應商/)).toHaveValue('99');
    expect(screen.getByRole('option', { name: '已停用的廠商' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /確認送修原廠/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    const [params] = calledWith('updateRepairSendOEM');
    expect(params[3]).toBe(99);
    expect(params[4]).toBe('已停用的廠商');
  });
});

describe('維修單明細更正送修供應商', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    mockDb();
  });

  it('顯示單上的供應商，改了之後存檔並記一筆事件紀錄', async () => {
    const onUpdated = vi.fn();
    render(
      <RepairOrderDetailModal
        isOpen
        repairOrder={order({ status: 'SENT_OEM', send_oem_date: '2026-10-20', supplier_id: 11, supplier_name: '技嘉 Gigabyte' })}
        onClose={vi.fn()}
        onUpdated={onUpdated}
      />
    );
    expect(within(screen.getByTestId('repair-oem-info')).getByText('技嘉 Gigabyte')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '修改送修供應商' }));
    await waitFor(() => expect(screen.getByRole('option', { name: '華碩 ASUS' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('送修供應商'), '12');
    await userEvent.click(screen.getByRole('button', { name: '儲存送修供應商' }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ supplier_id: 12, supplier_name: '華碩 ASUS' }));
    expect(calledWith('updateRepairSupplier')).toEqual([[12, '華碩 ASUS', 3]]);
    const logs = auditLogs().filter((l) => l.module === 'REPAIR');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ target: 'RMA-1', summary: '修改維修單 [RMA-1] 的送修供應商' });
    expect(logs[0].details).toMatchObject({ before: '技嘉 Gigabyte', after: '華碩 ASUS' });
  });

  it('沒改就不存', async () => {
    render(
      <RepairOrderDetailModal
        isOpen
        repairOrder={order({ status: 'SENT_OEM', supplier_id: 11, supplier_name: '技嘉 Gigabyte' })}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: '修改送修供應商' }));
    await userEvent.click(screen.getByRole('button', { name: '儲存送修供應商' }));
    expect(calledWith('updateRepairSupplier')).toEqual([]);
    expect(auditLogs()).toEqual([]);
  });
});

describe('維修單明細的原廠資訊', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb();
  });

  const show = (extra) => {
    render(<RepairOrderDetailModal isOpen repairOrder={order(extra)} onClose={vi.fn()} onUpdated={vi.fn()} />);
    return within(screen.getByTestId('repair-oem-info'));
  };

  it('只列送修供應商的名稱', () => {
    const info = show({ status: 'SENT_OEM', supplier_id: 12, supplier_name: '華碩 ASUS' });
    expect(info.getByText('原廠資訊 (Supplier)')).toBeInTheDocument();
    expect(info.getByText('華碩 ASUS')).toBeInTheDocument();
    expect(info.queryByText(/聯絡人|電話|Email|地址/)).not.toBeInTheDocument();
  });

  it('供應商已刪除仍看得到單上記的名稱', () => {
    const info = show({ status: 'SENT_OEM', supplier_id: null, supplier_name: '已刪除的廠商' });
    expect(info.getByText('已刪除的廠商')).toBeInTheDocument();
  });

  it('還沒選供應商時說明在哪裡選', () => {
    expect(show({}).getByText(/尚未選擇/)).toBeInTheDocument();
  });

  it('不需送回原廠的單標示不適用', () => {
    expect(show({ no_oem_required: true }).getByText('不適用（不需送回原廠）')).toBeInTheDocument();
  });
});

describe('資料表規則', () => {
  it('拿掉「只有內部維修才有供應商」的限制，並列在 migration 清單', () => {
    const sql = fs.readFileSync('database/migration_repair_supplier_any.sql', 'utf8');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS repair_orders_supplier_only_internal');
    const manifest = JSON.parse(fs.readFileSync('database/migrations.manifest.json', 'utf8'));
    const files = manifest.migrations.map((m) => m.file);
    expect(files.indexOf('migration_repair_supplier_any.sql')).toBeGreaterThan(files.indexOf('migration_repair_supplier.sql'));
  });
});
