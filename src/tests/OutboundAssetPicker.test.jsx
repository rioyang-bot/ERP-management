import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Outbound from '../pages/Outbound';
import AssetPickerModal from '../components/AssetPickerModal';
import { RoleContext } from '../context/RoleContext';
import { createRunTransactionMock } from './helpers/mockTransaction';
import { queries } from '../../database/queries';

/**
 * 出貨單：從清單勾選在庫的設備／硬體
 *
 * 搜尋框一次只能點一台加入，出很多台時很慢。
 * 勾選視窗列出所有在庫資產，可篩選後勾選多台一次加入。
 */
const ASSETS = [
  { sn: 'BC001', category_name: '設備', type: 'SERVER', brand: 'BLACKCORE', model: '3122-SM', specification: '26C', location: 'LAB' },
  { sn: 'BC002', category_name: '設備', type: 'SERVER', brand: 'BLACKCORE', model: '3122-SM', specification: '26C', location: 'LAB' },
  { sn: 'BC003', category_name: '設備', type: 'SERVER', brand: 'BLACKCORE', model: '3122-TX', specification: '96C', location: '' },
  { sn: 'LDA01', category_name: '設備', type: 'SWITCH', brand: 'LDA', model: 'NEOTAP', specification: '', location: '' },
  { sn: 'NIC01', category_name: '硬體', type: 'NIC', brand: 'Mellanox', model: 'CX5', specification: '25G', location: '' },
  { sn: 'NIC02', category_name: '硬體', type: 'NIC', brand: 'Mellanox', model: 'CX5', specification: '25G', location: '', server_sn: 'BC001' },
];

describe('勾選視窗本身', () => {
  const renderPicker = (props = {}) => {
    const onConfirm = vi.fn();
    render(<AssetPickerModal isOpen kind="device" assets={ASSETS} excludedSns={new Set()} onClose={vi.fn()} onConfirm={onConfirm} {...props} />);
    return onConfirm;
  };

  it('設備視窗只列設備', () => {
    renderPicker();
    expect(screen.getByTestId('picker-row-BC001')).toBeInTheDocument();
    expect(screen.queryByTestId('picker-row-NIC01')).not.toBeInTheDocument();
  });

  it('可以依廠牌、型號篩選，型號選項跟著廠牌縮小', async () => {
    renderPicker();
    await userEvent.selectOptions(screen.getByLabelText('廠牌'), 'BLACKCORE');
    expect(screen.queryByTestId('picker-row-LDA01')).not.toBeInTheDocument();
    const modelOptions = [...screen.getByLabelText('型號').options].map((o) => o.value);
    expect(modelOptions).toEqual(['', '3122-SM', '3122-TX']);
    await userEvent.selectOptions(screen.getByLabelText('型號'), '3122-SM');
    expect(screen.queryByTestId('picker-row-BC003')).not.toBeInTheDocument();
    expect(screen.getByTestId('picker-row-BC002')).toBeInTheDocument();
  });

  it('關鍵字可用空白分隔多個條件', async () => {
    renderPicker();
    await userEvent.type(screen.getByLabelText('搜尋'), 'server 96c');
    expect(screen.getByTestId('picker-row-BC003')).toBeInTheDocument();
    expect(screen.queryByTestId('picker-row-BC001')).not.toBeInTheDocument();
  });

  it('全選只勾目前列出的，按加入回傳勾選的序號', async () => {
    const onConfirm = renderPicker();
    await userEvent.selectOptions(screen.getByLabelText('型號'), '3122-SM');
    await userEvent.click(screen.getByLabelText('全選目前列出的'));
    await userEvent.click(screen.getByRole('button', { name: /加入出貨單 \(2\)/ }));
    expect(onConfirm).toHaveBeenCalledWith(['BC001', 'BC002']);
  });

  it('點整列就能勾選', async () => {
    const onConfirm = renderPicker();
    await userEvent.click(screen.getByTestId('picker-row-LDA01'));
    await userEvent.click(screen.getByRole('button', { name: /加入出貨單 \(1\)/ }));
    expect(onConfirm).toHaveBeenCalledWith(['LDA01']);
  });

  it('已在出貨單上的不能再勾', () => {
    renderPicker({ excludedSns: new Set(['bc001']) });
    const row = screen.getByTestId('picker-row-BC001');
    expect(within(row).getByRole('checkbox')).toBeDisabled();
    expect(within(row).getByText('已在出貨單上')).toBeInTheDocument();
  });

  it('掛在設備上的硬體不能單獨勾，會隨設備出貨', () => {
    renderPicker({ kind: 'hw' });
    const row = screen.getByTestId('picker-row-NIC02');
    expect(within(row).getByRole('checkbox')).toBeDisabled();
    expect(within(row).getByText('掛在 BC001 上，隨設備出貨')).toBeInTheDocument();
    expect(within(screen.getByTestId('picker-row-NIC01')).getByRole('checkbox')).not.toBeDisabled();
  });

  it('沒勾任何東西時不能按加入', () => {
    renderPicker();
    expect(screen.getByRole('button', { name: /加入出貨單 \(0\)/ })).toBeDisabled();
  });
});

describe('出貨單上使用勾選視窗', () => {
  let calls;
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    localStorage.clear();
    window.alert = vi.fn();
    const namedQuery = vi.fn(async (query, params) => {
      calls.push({ query, params });
      if (query === 'searchActiveAssetSNs') return { success: true, rows: ASSETS };
      if (query === 'fetchAssetDetailBySN') {
        const a = ASSETS.find((x) => x.sn === params[0]);
        return { success: true, rows: a ? [{ ...a, id: 1, item_master_id: 9, status: 'ACTIVE', components: [], mounted_consumables: [] }] : [] };
      }
      return { success: true, rows: [] };
    });
    window.electronAPI = { namedQuery, runTransaction: createRunTransactionMock(namedQuery), getDashboardStats: vi.fn() };
  });

  it('勾選多台後一次加入，逐台走既有的加入流程', async () => {
    render(
      <RoleContext.Provider value={{ authUser: { id: 1, full_name: '測試', role: 'ADMIN' } }}>
        <BrowserRouter><Outbound /></BrowserRouter>
      </RoleContext.Provider>
    );
    const [deviceBtn] = await screen.findAllByRole('button', { name: /從清單選取/ });
    fireEvent.click(deviceBtn);
    const dialog = await screen.findByRole('dialog', { name: '從清單選取設備' });
    await userEvent.click(within(dialog).getByLabelText('選取 BC001'));
    await userEvent.click(within(dialog).getByLabelText('選取 LDA01'));
    await userEvent.click(within(dialog).getByRole('button', { name: /加入出貨單 \(2\)/ }));

    await waitFor(() => expect(calls.filter((c) => c.query === 'fetchAssetDetailBySN').map((c) => c.params[0])).toEqual(['BC001', 'LDA01']));
    expect(screen.queryByRole('dialog', { name: '從清單選取設備' })).not.toBeInTheDocument();
    expect(await screen.findByText('BC001')).toBeInTheDocument();
    expect(screen.getByText('LDA01')).toBeInTheDocument();
  });
});

describe('查詢', () => {
  it('在庫清單帶出硬體掛在哪台設備上', () => {
    expect(queries.searchActiveAssetSNs).toContain("NULLIF(TRIM(a.custom_attributes->>'server_sn'), '') AS server_sn");
  });
});
