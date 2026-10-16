import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Outbound from '../pages/Outbound';
import { RoleContext } from '../context/RoleContext';
import { createRunTransactionMock } from './helpers/mockTransaction';
import { queries } from '../../database/queries';

/**
 * 新增出貨單的 End-user 欄位
 *
 * 單頭記一份（編輯時帶回）；有加入設備／硬體時，建單一併寫入那些資產的 End-user，
 * 設備上搭載的硬體也一起寫。沒填就不動資產上原本的 End-user。
 */
describe('新增出貨單：End-user', () => {
  const CUSTOMERS = [{ id: 1, name: '元大證券', contact: '王大明', phone: '0912', address: '台北市' }];
  let calls;
  let txSteps;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    calls = [];
    txSteps = [];
    window.alert = vi.fn();
    const namedQuery = vi.fn(async (query, params) => {
      calls.push({ query, params });
      if (query === 'fetchCustomers') return { success: true, rows: CUSTOMERS };
      if (query === 'fetchCustomerEndUsers') return { success: true, rows: [{ end_user: '元大期貨' }, { end_user: '元大投信' }] };
      if (query === 'countOutboundRequests') return { success: true, rows: [{ count: '1' }] };
      if (query === 'fetchAssetDetailBySN' && params[0] === 'SRV-001') {
        return { success: true, rows: [{
          item_master_id: 101, sn: 'SRV-001', brand: 'Supermicro', model: 'SYS-1029P', category_name: '設備', status: 'ACTIVE',
          components: [{ item_master_id: 201, sn: 'NIC-001', brand: 'Mellanox', model: 'MCX512A', type: 'NIC' }],
        }] };
      }
      if (query === 'insertOutboundRequestWithProject') return { success: true, rows: [{ id: 888 }] };
      if (query === 'updateOutboundRequestHeader') return { success: true, rows: [{ id: 5 }] };
      return { success: true, rows: [] };
    });
    const tx = createRunTransactionMock(namedQuery);
    window.electronAPI = {
      namedQuery,
      runTransaction: vi.fn((steps) => { txSteps = steps; return tx(steps); }),
    };
  });

  const renderOutbound = (props = {}) => render(
    <RoleContext.Provider value={{ authUser: { id: 1, full_name: '測試管理員', role: 'ADMIN' } }}>
      <BrowserRouter><Outbound {...props} /></BrowserRouter>
    </RoleContext.Provider>
  );

  const fillAndAddDevice = async (endUser) => {
    await waitFor(() => expect(screen.getByRole('option', { name: /元大證券/ })).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('請選擇客戶...'), { target: { value: '1' } });
    if (endUser !== undefined) fireEvent.change(screen.getByLabelText(/^End-user/), { target: { value: endUser } });
    const deviceInput = screen.getByPlaceholderText(/輸入設備序號/i);
    fireEvent.change(deviceInput, { target: { value: 'SRV-001' } });
    fireEvent.submit(deviceInput.closest('form'));
    await screen.findByText('SRV-001');
  };

  const submit = async () => {
    fireEvent.click(screen.getByRole('button', { name: /送出並建立出貨單/ }));
    await waitFor(() => expect(window.electronAPI.runTransaction).toHaveBeenCalled());
  };

  const auditLogs = () => calls.filter((c) => c.query === 'insertAuditLog')
    .map(({ params: p }) => ({ actionType: p[3], module: p[4], target: p[6], summary: p[8], details: p[9] }));

  it('單據基本資訊有 End-user 欄位，選了客戶就列出它用過的 End-user', async () => {
    renderOutbound();
    await waitFor(() => expect(screen.getByRole('option', { name: /元大證券/ })).toBeInTheDocument());
    const input = screen.getByLabelText(/^End-user/);
    expect(input).toHaveValue('');
    fireEvent.change(screen.getByDisplayValue('請選擇客戶...'), { target: { value: '1' } });
    await waitFor(() => expect(calls.find((c) => c.query === 'fetchCustomerEndUsers')?.params).toEqual(['元大證券']));
    const list = document.getElementById(input.getAttribute('list'));
    await waitFor(() => expect([...list.querySelectorAll('option')].map((o) => o.value)).toEqual(['元大期貨', '元大投信']));
  });

  it('有填 End-user：寫進單頭，也寫進設備與搭載的硬體', async () => {
    renderOutbound();
    await fillAndAddDevice('元大期貨');
    await submit();

    const header = txSteps.find((s) => s.queryName === 'updateOutboundRequestEndUser');
    expect(header.params).toEqual(['元大期貨', { $ref: 'request.rows.0.id' }]);
    expect(txSteps.indexOf(header)).toBeGreaterThan(txSteps.findIndex((s) => s.queryName === 'insertOutboundRequestWithProject'));
    expect(txSteps.find((s) => s.queryName === 'updateAssetEndUserBySn').params).toEqual(['元大期貨', 'SRV-001']);
    expect(txSteps.find((s) => s.queryName === 'updateMountedHardwareEndUser').params).toEqual(['元大期貨', 'SRV-001']);

    // 事件紀錄帶上 End-user 與寫入的序號
    await waitFor(() => expect(auditLogs().find((l) => l.module === 'OUTBOUND')).toBeDefined());
    const log = auditLogs().find((l) => l.module === 'OUTBOUND');
    expect(log.summary).toContain('(End-user: 元大期貨)');
    expect(log.details).toMatchObject({ end_user: '元大期貨', endUserSns: ['SRV-001', 'NIC-001'] });
  });

  it('沒填 End-user：不動資產上原本的', async () => {
    renderOutbound();
    await fillAndAddDevice();
    await submit();
    expect(txSteps.find((s) => s.queryName === 'updateOutboundRequestEndUser').params[0]).toBe('');
    expect(txSteps.some((s) => s.queryName === 'updateAssetEndUserBySn' || s.queryName === 'updateMountedHardwareEndUser')).toBe(false);
  });

  it('編輯待出貨單：帶回原本的 End-user，改過的寫回單頭與資產', async () => {
    const base = window.electronAPI.namedQuery.getMockImplementation();
    window.electronAPI.namedQuery.mockImplementation(async (q, p) => (q === 'fetchDNItems'
      ? { success: true, rows: [{ id: 1, item_id: 101, sn: 'SRV-001', brand: 'Supermicro', model: 'SYS-1029P', category_name: '設備', quantity: 1, asset_id: 9 }] }
      : base(q, p)));
    renderOutbound({
      isModalMode: true,
      editingDn: { id: 5, request_no: 'DN-20261016-01', customer: '元大證券', shipping_date: '2026-10-16', end_user: '元大投信', status: 'PENDING' },
    });
    const input = await screen.findByLabelText(/^End-user/);
    expect(input).toHaveValue('元大投信');
    await screen.findByText('SRV-001');
    fireEvent.change(input, { target: { value: '元大期貨' } });
    fireEvent.click(screen.getByRole('button', { name: /儲存修改/ }));
    await waitFor(() => expect(window.electronAPI.runTransaction).toHaveBeenCalled());
    expect(txSteps.find((s) => s.queryName === 'updateOutboundRequestEndUser').params).toEqual(['元大期貨', 5]);
    expect(txSteps.find((s) => s.queryName === 'updateAssetEndUserBySn').params).toEqual(['元大期貨', 'SRV-001']);
  });

  it('資產的 End-user 欄位與 custom_attributes 兩處一起寫', () => {
    for (const name of ['updateAssetEndUserBySn', 'updateMountedHardwareEndUser']) {
      expect(queries[name]).toContain('end_user = $1::text');
      expect(queries[name]).toContain("jsonb_build_object('end_user', $1::text)");
    }
  });
});
