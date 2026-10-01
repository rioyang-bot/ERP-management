import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import fs from 'fs';
import Outbound from '../pages/Outbound';
import DNList from '../pages/DNList';
import MountedConsumablesSection from '../components/MountedConsumablesSection';
import { RoleContext } from '../context/RoleContext';
import { createRunTransactionMock } from './helpers/mockTransaction';
import {
  isMountedRow, findMountedMismatches, shipMountedSteps, lendOutMountedSteps, lendReturnMountedSteps,
} from '../utils/mountedConsumables';
import { queries } from '../../database/queries';

/**
 * 耗材掛載到設備上
 *
 * 掛載＝庫存移到 LAB，並記在設備上。出貨單／借用單加入設備時一併帶入，
 * 掛多少出多少、單上不能改（要調整只能到設備上卸載），出貨時從 LAB 扣。
 */
const DAC = { item_master_id: 301, brand: 'METECH', type: 'DAC CABLE', model: 'DAC-10G 2M', specification: '', unit: '條', quantity: 4 };
const MOUNTED_ROW = { id: 2, category_name: '耗材', item_id: 301, quantity: 4, lab_asset_id: 55, lab_device_sn: 'SRV-001', brand: 'METECH', model: 'DAC-10G 2M' };

let calls;
const called = (name) => calls.filter((c) => c.query === name);

describe('共用規則', () => {
  beforeEach(() => { calls = []; });

  it('只有掛在設備上的耗材列才走 LAB', () => {
    expect(isMountedRow(MOUNTED_ROW)).toBe(true);
    expect(isMountedRow({ ...MOUNTED_ROW, lab_asset_id: null })).toBe(false);
    expect(isMountedRow({ ...MOUNTED_ROW, category_name: '設備' })).toBe(false);
  });

  it('出貨：從 LAB 扣，並從那台設備上扣掉', () => {
    const [lab, ledger] = shipMountedSteps(MOUNTED_ROW, 'DN-01');
    expect(lab).toMatchObject({ queryName: 'updateLabQtyOnOutbound', params: [4, 301], expectRows: 1 });
    expect(ledger).toMatchObject({ queryName: 'deductLabAssignment', params: [301, 55, 4, '出貨單 DN-01 隨設備出貨'], expectRows: 1 });
  });

  it('借出記為借出中；歸還回到 LAB 並掛回設備', () => {
    expect(lendOutMountedSteps(MOUNTED_ROW, 'LN-01').map((s) => s.queryName)).toEqual(['updateLabQtyOnLendOut', 'deductLabAssignment']);
    const back = lendReturnMountedSteps(MOUNTED_ROW, 'LN-01');
    expect(back.map((s) => s.queryName)).toEqual(['updateLabQtyOnLendReturn', 'insertLabAssignment']);
    expect(back[1].params.slice(0, 3)).toEqual([301, 55, 4]);
  });

  it('單上數量與設備上目前掛的不一致就列出來', async () => {
    window.electronAPI = { namedQuery: vi.fn(async () => ({ success: true, rows: [{ ...DAC, quantity: 2 }] })) };
    expect(await findMountedMismatches([MOUNTED_ROW])).toEqual(['設備 [SRV-001] 的 METECH DAC-10G 2M：單上 4，設備上目前掛 2']);

    window.electronAPI.namedQuery = vi.fn(async () => ({ success: true, rows: [DAC] }));
    expect(await findMountedMismatches([MOUNTED_ROW])).toEqual([]);
  });

  it('設備上另外加掛、不在單上的也算不一致', async () => {
    window.electronAPI = { namedQuery: vi.fn(async () => ({ success: true, rows: [DAC, { ...DAC, item_master_id: 302, model: 'SFP+ LR', quantity: 1 }] })) };
    expect(await findMountedMismatches([MOUNTED_ROW])).toEqual(['設備 [SRV-001] 另外掛了 METECH SFP+ LR 1 個，不在單上']);
  });
});

describe('出貨單：加入設備時帶入掛載的耗材', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    localStorage.clear();
    window.alert = vi.fn();
    const namedQuery = vi.fn(async (query, params) => {
      calls.push({ query, params });
      if (query === 'fetchCustomers') return { success: true, rows: [{ id: 1, name: '元大證券', contact: '王', phone: '', address: '台北' }] };
      if (query === 'countOutboundRequests') return { success: true, rows: [{ count: '1' }] };
      if (query === 'fetchAssetDetailBySN') {
        return { success: true, rows: [{
          id: 55, item_master_id: 101, sn: 'SRV-001', brand: 'Supermicro', model: 'SYS-1029P', category_name: '設備', status: 'ACTIVE',
          components: [], mounted_consumables: [DAC],
        }] };
      }
      if (query === 'insertOutboundRequestWithProject' || query === 'insertOutboundRequest') return { success: true, rows: [{ id: 888 }] };
      return { success: true, rows: [] };
    });
    window.electronAPI = { namedQuery, runTransaction: createRunTransactionMock(namedQuery), getDashboardStats: vi.fn() };
  });

  const addDevice = async () => {
    render(
      <RoleContext.Provider value={{ authUser: { id: 1, full_name: '測試', role: 'ADMIN' } }}>
        <BrowserRouter><Outbound /></BrowserRouter>
      </RoleContext.Provider>
    );
    await waitFor(() => expect(screen.getByText(/請選擇客戶/)).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('請選擇客戶...'), { target: { value: '1' } });
    const deviceInput = screen.getByPlaceholderText(/輸入設備序號/i);
    fireEvent.change(deviceInput, { target: { value: 'SRV-001' } });
    fireEvent.submit(deviceInput.closest('form'));
    return screen.findByTestId('mounted-consumables-SRV-001');
  };

  it('掛載的耗材跟著設備出現，鎖住不能改', async () => {
    const box = await addDevice();
    expect(within(box).getByText(/掛載耗材 \(1\)/)).toBeInTheDocument();
    expect(within(box).getByText('× 4 條')).toBeInTheDocument();
    expect(within(box).getByText(/🔒/)).toBeInTheDocument();
    // 掛載耗材沒有數量輸入框
    expect(within(box).queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('存檔時寫成隨設備出貨的明細，記著是哪一台設備', async () => {
    await addDevice();
    fireEvent.click(screen.getByRole('button', { name: /送出並建立出貨單/i }));
    await waitFor(() => expect(called('insertOutboundLabItem')).toHaveLength(1));
    const [requestId, itemId, qty, , assetId] = called('insertOutboundLabItem')[0].params;
    expect([requestId, itemId, qty, assetId]).toEqual([888, 301, 4, 55]);
  });
});

describe('確認出貨', () => {
  let mountedNow;
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    mountedNow = [DAC];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const namedQuery = vi.fn(async (query, params) => {
      calls.push({ query, params });
      if (query === 'fetchDNList') return { success: true, rows: [{ id: 1, request_no: 'DN-20261001-01', request_type: 'SALE', customer: '元大', status: 'PENDING', item_count: 2 }] };
      if (query === 'fetchDNItems') {
        return { success: true, rows: [
          { id: 1, category_name: '設備', item_id: 101, sn: 'SRV-001', quantity: 1, brand: 'Supermicro', model: 'SYS-1029P' },
          MOUNTED_ROW,
        ] };
      }
      if (query === 'checkAssetActive') return { success: true, rows: [{ status: 'ACTIVE' }] };
      if (query === 'fetchMountedConsumables') return { success: true, rows: mountedNow };
      return { success: true, rows: [{ id: 1 }] };
    });
    window.electronAPI = { namedQuery, runTransaction: createRunTransactionMock(namedQuery), getDashboardStats: vi.fn() };
  });

  const confirmShipping = async () => {
    render(<BrowserRouter><DNList /></BrowserRouter>);
    await userEvent.click(await screen.findByRole('button', { name: '檢視' }));
    expect(await screen.findByText(/掛載於 SRV-001，隨設備出貨/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: '確認出貨' }));
  };

  it('掛載耗材從 LAB 扣，不從庫存扣', async () => {
    await confirmShipping();
    await waitFor(() => expect(called('updateLabQtyOnOutbound')[0]?.params).toEqual([4, 301]));
    expect(called('deductLabAssignment')[0].params.slice(0, 3)).toEqual([301, 55, 4]);
    expect(called('updateStockQtyOnOutbound')).toHaveLength(0);
    expect(called('checkItemStock')).toHaveLength(0);
  });

  it('建單後設備上的掛載有變動，就擋下來、要先編輯出貨單', async () => {
    mountedNow = [{ ...DAC, quantity: 3 }];
    await confirmShipping();
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('單上 4，設備上目前掛 3')));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('請先編輯這張出貨單'));
    expect(called('updateLabQtyOnOutbound')).toHaveLength(0);
    expect(called('updateOutboundRequestStatus')).toHaveLength(0);
  });
});

describe('設備上掛載與卸載', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const namedQuery = vi.fn(async (query, params) => {
      calls.push({ query, params });
      if (query === 'fetchMountedConsumables') return { success: true, rows: [DAC] };
      if (query === 'fetchConsumablesList') return { success: true, rows: [{ id: 302, brand: 'METECH', type: 'SFP', model: 'SFP+ LR', stock_qty: 10, unit: '個' }, { id: 303, brand: 'X', model: '缺貨品', stock_qty: 0 }] };
      return { success: true, rows: [{ id: 1 }] };
    });
    window.electronAPI = { namedQuery, runTransaction: createRunTransactionMock(namedQuery) };
  });

  const device = { id: 55, sn: 'SRV-001', status: 'ACTIVE' };

  it('掛載：庫存移到 LAB 並記在這台設備上', async () => {
    const onChanged = vi.fn();
    render(<MountedConsumablesSection device={device} onChanged={onChanged} />);
    await userEvent.selectOptions(await screen.findByLabelText('要掛載的耗材'), '302');
    await userEvent.clear(screen.getByLabelText('掛載數量'));
    await userEvent.type(screen.getByLabelText('掛載數量'), '3');
    await userEvent.click(screen.getByRole('button', { name: /掛載$/ }));

    await waitFor(() => expect(called('mountConsumableStock')[0]?.params).toEqual([3, 302]));
    expect(called('insertLabAssignment')[0].params.slice(0, 3)).toEqual([302, 55, 3]);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('沒有庫存的耗材不能選', async () => {
    render(<MountedConsumablesSection device={device} />);
    const option = await screen.findByRole('option', { name: /缺貨品/ });
    expect(option).toBeDisabled();
  });

  it('卸載：從 LAB 移回庫存並從設備上扣掉', async () => {
    render(<MountedConsumablesSection device={device} />);
    const qty = await screen.findByLabelText('卸載 DAC CABLE - METECH DAC-10G 2M 的數量');
    await userEvent.clear(qty);
    await userEvent.type(qty, '1');
    await userEvent.click(screen.getByRole('button', { name: '卸載 DAC CABLE - METECH DAC-10G 2M' }));

    await waitFor(() => expect(called('unmountConsumableStock')[0]?.params).toEqual([1, 301]));
    expect(called('deductLabAssignment')[0].params.slice(0, 3)).toEqual([301, 55, 1]);
  });

  it('設備不在庫時不能再掛載', async () => {
    render(<MountedConsumablesSection device={{ ...device, status: 'SHIPPED' }} />);
    expect(await screen.findByText(/設備不在庫/)).toBeInTheDocument();
    expect(screen.queryByLabelText('要掛載的耗材')).not.toBeInTheDocument();
  });
});

describe('資料庫', () => {
  const oneLine = (s) => s.replace(/\s+/g, ' ');

  it('LAB 流水帳可以記負數（卸載、出貨），不能是 0', () => {
    const sql = fs.readFileSync('database/migration_consumable_mount_on_device.sql', 'utf8');
    expect(sql).toContain('CHECK (quantity <> 0)');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS lab_asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL');
  });

  it('扣設備上的掛載數量時，不夠就不寫入', () => {
    expect(oneLine(queries.deductLabAssignment)).toContain('WHERE item_master_id = $1::int AND asset_id = $2::int) >= $3::int');
  });

  it('出貨單與借用單加入設備時都帶出掛載的耗材', () => {
    expect(queries.fetchAssetDetailBySN).toContain('as mounted_consumables');
    expect(queries.fetchAssetsByProject).toContain('as mounted_consumables');
  });

  it('不指定設備移回庫存時，只能動沒有掛在設備上的部分', () => {
    expect(oneLine(queries.transferUnassignedLabToStock)).toContain('COALESCE(lab_qty, 0) - COALESCE((SELECT SUM(quantity) FROM item_lab_assignments WHERE item_master_id = $2), 0) >= $1::int');
  });
});
