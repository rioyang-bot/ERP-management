import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Outbound from '../pages/Outbound';
import { RoleContext } from '../context/RoleContext';

describe('Outbound 出貨時自動立案與設備專案屬性回寫功能測試', () => {
  const mockCustomers = [
    { id: 1, name: '元大證券', contact: '王大明', phone: '0912345678', address: '台北市南京東路' },
    { id: 2, name: '國法金融', contact: '張經理', phone: '0987654321', address: '台北市信義路' }
  ];

  const mockActiveProjects = [
    { project_no: 'PRJ-20260901-01', project_name: '國法專案' }
  ];

  const mockActiveAssets = [
    { sn: 'SRV-001', category_name: '設備', brand: 'Supermicro', model: 'SYS-1029P', specification: '1U Server' },
    { sn: 'NIC-001', category_name: '硬體', brand: 'Mellanox', model: 'MCX512A', specification: '25GbE' }
  ];

  let queriesCalled = [];

  beforeEach(() => {
    vi.clearAllMocks();
    queriesCalled = [];
    localStorage.clear();

    window.electronAPI = {
      namedQuery: vi.fn((query, params) => {
        queriesCalled.push({ query, params });

        if (query === 'fetchCustomers') {
          return Promise.resolve({ success: true, rows: mockCustomers });
        }
        if (query === 'fetchActiveProjects') {
          return Promise.resolve({ success: true, rows: mockActiveProjects });
        }
        if (query === 'searchActiveAssetSNs') {
          return Promise.resolve({ success: true, rows: mockActiveAssets });
        }
        if (query === 'countOutboundRequests') {
          return Promise.resolve({ success: true, rows: [{ count: '1' }] });
        }
        if (query === 'fetchAssetDetailBySN') {
          const sn = params[0];
          if (sn === 'SRV-001') {
            return Promise.resolve({
              success: true,
              rows: [{
                item_master_id: 101,
                sn: 'SRV-001',
                brand: 'Supermicro',
                model: 'SYS-1029P',
                specification: '1U Server',
                category_name: '設備',
                status: 'ACTIVE',
                components: [{ item_master_id: 201, sn: 'NIC-001', brand: 'Mellanox', model: 'MCX512A', type: '硬體' }]
              }]
            });
          }
          if (sn === 'SRV-SHIPPED') {
            return Promise.resolve({
              success: true,
              rows: [{
                item_master_id: 102,
                sn: 'SRV-SHIPPED',
                brand: 'BlackCore',
                model: 'BCHFT-1PC',
                specification: '1U Server',
                category_name: '設備',
                status: 'SHIPPED',
                components: []
              }]
            });
          }
        }
        if (query === 'checkProjectExistsByName') {
          const name = params[0];
          if (name === '國法專案') {
            return Promise.resolve({ success: true, rows: [{ id: 10, project_no: 'PRJ-20260901-01', name: '國法專案' }] });
          }
          return Promise.resolve({ success: true, rows: [] }); // 新專案
        }
        if (query === 'countProjectsByPrefix') {
          return Promise.resolve({ success: true, rows: [{ count: '2' }] });
        }
        if (query === 'createProject') {
          return Promise.resolve({ success: true, rows: [{ id: 99, project_no: params[0], name: params[3] }] });
        }
        if (query === 'insertOutboundRequestWithProject' || query === 'insertOutboundRequest') {
          return Promise.resolve({ success: true, rows: [{ id: 888 }] });
        }
        if (query === 'insertOutboundItem') {
          return Promise.resolve({ success: true, rows: [] });
        }
        if (query === 'updateAssetProjectAndClientBySn' || query === 'updateMountedHardwareProjectAndClient') {
          return Promise.resolve({ success: true, rows: [] });
        }
        if (query === 'migrateOutboundProjectName') {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true, rows: [] });
      }),
      authLogin: vi.fn(),
      getDashboardStats: vi.fn()
    };
  });

  const renderComponent = () => {
    return render(
      <RoleContext.Provider value={{ authUser: { id: 1, full_name: '測試管理員', role: 'ADMIN' } }}>
        <BrowserRouter>
          <Outbound />
        </BrowserRouter>
      </RoleContext.Provider>
    );
  };

  it('1. 出貨單專案欄位應支援自訂輸入新專案名稱並顯示提示標籤', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('出貨專案')).toBeInTheDocument();
    });

    const projectInput = screen.getByPlaceholderText(/選擇既有專案或直接輸入新專案名稱/i);
    expect(projectInput).toBeInTheDocument();

    // 輸入一個全新專案名稱
    fireEvent.change(projectInput, { target: { value: '全新高鐵專案' } });

    // 畫面應出現提示標籤
    await waitFor(() => {
      expect(screen.getByText(/新專案 \(出貨自動立案與綁定\)/i)).toBeInTheDocument();
    });
  });

  it('2. 出貨時指定全新專案，應自動建立專案 (createProject) 並自動回寫設備與搭載硬體之專案屬性', async () => {
    window.alert = vi.fn();
    renderComponent();

    // 選擇客戶
    await waitFor(() => {
      expect(screen.getByText(/請選擇客戶/i)).toBeInTheDocument();
    });
    const customerSelect = screen.getByDisplayValue('請選擇客戶...');
    fireEvent.change(customerSelect, { target: { value: '1' } }); // 元大證券

    // 輸入全新專案名稱
    const projectInput = screen.getByPlaceholderText(/選擇既有專案或直接輸入新專案名稱/i);
    fireEvent.change(projectInput, { target: { value: '全新AI專案' } });

    // 搜尋並新增設備 SRV-001
    const deviceInput = screen.getByPlaceholderText(/輸入設備序號/i);
    fireEvent.change(deviceInput, { target: { value: 'SRV-001' } });
    fireEvent.submit(deviceInput.closest('form'));

    // 等待設備加入清單
    await waitFor(() => {
      expect(screen.getByText('SRV-001')).toBeInTheDocument();
    });

    // 點擊「送出並建立出貨單」
    const submitBtn = screen.getByRole('button', { name: /送出並建立出貨單/i });
    fireEvent.click(submitBtn);

    // 驗證流程
    await waitFor(() => {
      // 1. 應呼叫 checkProjectExistsByName
      const checkCall = queriesCalled.find(q => q.query === 'checkProjectExistsByName');
      expect(checkCall).toBeDefined();
      expect(checkCall.params[0]).toBe('全新AI專案');

      // 2. 應呼叫 createProject 自動立案
      const createProjCall = queriesCalled.find(q => q.query === 'createProject');
      expect(createProjCall).toBeDefined();
      expect(createProjCall.params[1]).toBe('元大證券');
      expect(createProjCall.params[3]).toBe('全新AI專案');

      // 3. 應呼叫 insertOutboundRequestWithProject 寫入專案
      const insertReqCall = queriesCalled.find(q => q.query === 'insertOutboundRequestWithProject');
      expect(insertReqCall).toBeDefined();
      expect(insertReqCall.params[8]).toBe('全新AI專案');

      // 4. 應自動將設備 SRV-001 回寫專案屬性
      const bindAssetCall = queriesCalled.find(
        q => q.query === 'updateAssetProjectAndClientBySn' && q.params[2] === 'SRV-001'
      );
      expect(bindAssetCall).toBeDefined();
      expect(bindAssetCall.params[0]).toBe('全新AI專案');
      expect(bindAssetCall.params[1]).toBe('元大證券');

      // 5. 應自動將搭載硬體 NIC-001 回寫專案屬性
      const bindCompCall = queriesCalled.find(
        q => q.query === 'updateAssetProjectAndClientBySn' && q.params[2] === 'NIC-001'
      );
      expect(bindCompCall).toBeDefined();
      expect(bindCompCall.params[0]).toBe('全新AI專案');
    });
  });

  it('3. 出貨時選擇既有專案，不應重複建立專案，但應正確回寫設備專案屬性', async () => {
    window.alert = vi.fn();
    renderComponent();

    // 選擇客戶
    await waitFor(() => {
      expect(screen.getByText(/請選擇客戶/i)).toBeInTheDocument();
    });
    const customerSelect = screen.getByDisplayValue('請選擇客戶...');
    fireEvent.change(customerSelect, { target: { value: '2' } }); // 國法金融

    // 輸入既有專案名稱「國法專案」
    const projectInput = screen.getByPlaceholderText(/選擇既有專案或直接輸入新專案名稱/i);
    fireEvent.change(projectInput, { target: { value: '國法專案' } });

    // 搜尋並新增設備 SRV-001
    const deviceInput = screen.getByPlaceholderText(/輸入設備序號/i);
    fireEvent.change(deviceInput, { target: { value: 'SRV-001' } });
    fireEvent.submit(deviceInput.closest('form'));

    await waitFor(() => {
      expect(screen.getByText('SRV-001')).toBeInTheDocument();
    });

    // 點擊送出
    const submitBtn = screen.getByRole('button', { name: /送出並建立出貨單/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      // 1. checkProjectExistsByName 發現已存在
      const checkCall = queriesCalled.find(q => q.query === 'checkProjectExistsByName');
      expect(checkCall).toBeDefined();

      // 2. 不得重複呼叫 createProject
      const createProjCall = queriesCalled.find(q => q.query === 'createProject');
      expect(createProjCall).toBeUndefined();

      // 3. 仍應回寫專案屬性至該設備
      const bindAssetCall = queriesCalled.find(
        q => q.query === 'updateAssetProjectAndClientBySn' && q.params[2] === 'SRV-001'
      );
      expect(bindAssetCall).toBeDefined();
      expect(bindAssetCall.params[0]).toBe('國法專案');
    });
  });

  it('4. 若嘗試輸入已出貨 (SHIPPED) 的設備序號，系統應彈出警示並禁止加入出貨清單，避免重複出貨', async () => {
    window.alert = vi.fn();
    renderComponent();

    // 輸入已出貨的序號 SRV-SHIPPED
    const deviceInput = screen.getByPlaceholderText(/輸入設備序號/i);
    fireEvent.change(deviceInput, { target: { value: 'SRV-SHIPPED' } });
    fireEvent.submit(deviceInput.closest('form'));

    await waitFor(() => {
      // 應彈出警告視窗
      expect(window.alert).toHaveBeenCalled();
      const alertMsg = window.alert.mock.calls[0][0];
      expect(alertMsg).toMatch(/無法加入出貨清單/i);
      expect(alertMsg).toMatch(/已出貨 \(SHIPPED\)/i);
      expect(alertMsg).toMatch(/避免重複出貨/i);

      // 清單中絕不可出現 SRV-SHIPPED
      expect(screen.queryByText('SRV-SHIPPED')).not.toBeInTheDocument();
    });
  });
});
