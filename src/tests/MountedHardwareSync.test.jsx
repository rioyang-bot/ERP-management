import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeviceList from '../pages/DeviceList';
import HwList from '../pages/HwList';
import { queries } from '../../database/queries';
import { MemoryRouter } from 'react-router-dom';

describe('設備更新狀態同步至掛載硬體之整合測試', () => {
  const querySpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    querySpy.mockClear();
    
    // Mock the window.confirm
    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      querySpy(query, params);
      if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') {
        return Promise.resolve({
          success: true,
          rows: [
            {
              id: 10,
              sn: 'STG100385Y25',
              brand: 'Dell',
              model: 'PowerEdge R740',
              status: 'ACTIVE',
              custom_attributes: {}
            }
          ]
        });
      }
      if (query === 'fetchCustomers') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'getSystemSetting') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'checkAssetSnExistsExcludeSelf') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (
        query === 'updateAssetStatus' || 
        query === 'updateMountedHardwareStatus' || 
        query === 'updateAssetDetails' || 
        query === 'updateMountedHardwareServerSn' ||
        query === 'updateRepairItemsSn' ||
        query === 'updateOutboundItemsSn' ||
        query === 'bindHardwareToServerSn' ||
        query === 'unbindHardwareServerSn'
      ) {
        return Promise.resolve({ success: true });
      }
      if (query === 'fetchAvailableHardwares') {
        return Promise.resolve({
          success: true,
          rows: [
            { id: 201, sn: 'HW-NIC-001', brand: 'Mellanox', model: 'MCX512A', type: '網路卡', server_sn: null },
            { id: 202, sn: 'HW-NIC-002', brand: 'Intel', model: 'X520', type: '網路卡', server_sn: 'OTHER-SRV' }
          ]
        });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  });

  it('當設備狀態變更為出貨時，應該一併同步更新其搭載的硬體狀態為出貨', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    );

    // 等待統計卡片載入
    const statsCard = await screen.findByText('Dell');
    expect(statsCard).toBeInTheDocument();
    await user.click(statsCard);

    // 等待詳細列表載入並尋找到對應設備的序號
    const targetCell = await screen.findByText('STG100385Y25');
    expect(targetCell).toBeInTheDocument();

    // 點擊功能選單按鈕
    const moreHorizontalIcon = document.querySelector('.lucide-ellipsis');
    expect(moreHorizontalIcon).toBeInTheDocument();
    const rowMenuBtn = moreHorizontalIcon.closest('button');
    expect(rowMenuBtn).toBeInTheDocument();
    await user.click(rowMenuBtn);

    // 尋找「標記為出貨」按鈕並點選
    const shipBtn = await screen.findByText('標記為出貨');
    expect(shipBtn).toBeInTheDocument();
    await user.click(shipBtn);

    // 驗證 updateMountedHardwareStatus 已經被以正確的參數呼叫
    await waitFor(() => {
      const calls = querySpy.mock.calls;
      const syncCall = calls.find(call => call[0] === 'updateMountedHardwareStatus');
      expect(syncCall).toBeDefined();
      expect(syncCall[1]).toEqual(['SHIPPED', 'STG100385Y25']);
    });
  });

  it('當設備狀態變更為在庫時，應該一併同步更新其搭載的硬體狀態為在庫', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    );

    // 等待統計卡片載入
    const statsCard = await screen.findByText('Dell');
    expect(statsCard).toBeInTheDocument();
    await user.click(statsCard);

    // 等待詳細列表載入並尋找到對應設備的序號
    const targetCell = await screen.findByText('STG100385Y25');
    expect(targetCell).toBeInTheDocument();

    // 點擊功能選單按鈕
    const moreHorizontalIcon = document.querySelector('.lucide-ellipsis');
    expect(moreHorizontalIcon).toBeInTheDocument();
    const rowMenuBtn = moreHorizontalIcon.closest('button');
    expect(rowMenuBtn).toBeInTheDocument();
    await user.click(rowMenuBtn);

    // 尋找「標記為在庫」按鈕並點選
    const activeBtn = await screen.findByText('標記為在庫');
    expect(activeBtn).toBeInTheDocument();
    await user.click(activeBtn);

    // 驗證 updateMountedHardwareStatus 已經被以正確的參數呼叫
    await waitFor(() => {
      const calls = querySpy.mock.calls;
      const syncCall = calls.find(call => call[0] === 'updateMountedHardwareStatus' && call[1][0] === 'ACTIVE');
      expect(syncCall).toBeDefined();
      expect(syncCall[1]).toEqual(['ACTIVE', 'STG100385Y25']);
    });
  });

  it('當設備狀態變更為維修或報廢時，不應同步更新其搭載的硬體狀態', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    );

    // 等待統計卡片載入
    const statsCard = await screen.findByText('Dell');
    expect(statsCard).toBeInTheDocument();
    await user.click(statsCard);

    // 等待詳細列表載入並尋找到對應設備的序號
    const targetCell = await screen.findByText('STG100385Y25');
    expect(targetCell).toBeInTheDocument();

    // 點擊功能選單按鈕
    const moreHorizontalIcon = document.querySelector('.lucide-ellipsis');
    expect(moreHorizontalIcon).toBeInTheDocument();
    const rowMenuBtn = moreHorizontalIcon.closest('button');
    expect(rowMenuBtn).toBeInTheDocument();
    await user.click(rowMenuBtn);

    // 尋找「標記為維修」按鈕並點選
    const repairBtn = await screen.findByText('標記為維修');
    expect(repairBtn).toBeInTheDocument();
    await user.click(repairBtn);

    // 驗證 updateMountedHardwareStatus 沒有被呼叫
    await waitFor(() => {
      const calls = querySpy.mock.calls;
      const syncCall = calls.find(call => call[0] === 'updateMountedHardwareStatus');
      expect(syncCall).toBeUndefined();
    });
  });

  it('當在設備編輯彈窗中變更設備序號時，應連同掛載硬體的設備序號一併同步變更', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    );

    // 點擊 Dell 卡片
    const statsCard = await screen.findByText('Dell');
    await user.click(statsCard);

    // 找到目標設備
    const targetCell = await screen.findByText('STG100385Y25');
    expect(targetCell).toBeInTheDocument();

    // 點擊功能選單按鈕
    const moreHorizontalIcon = document.querySelector('.lucide-ellipsis');
    const rowMenuBtn = moreHorizontalIcon.closest('button');
    await user.click(rowMenuBtn);

    // 點選「編輯詳細資訊」
    const editBtn = await screen.findByText('編輯詳細資訊');
    await user.click(editBtn);

    // 等待編輯彈窗出現
    expect(await screen.findByText('修改詳細設備資訊')).toBeInTheDocument();

    // 找到序號輸入框
    const snInput = screen.getByDisplayValue('STG100385Y25');
    expect(snInput).toBeInTheDocument();

    // 清空並輸入新序號
    await user.clear(snInput);
    await user.type(snInput, 'STG100385Y25-NEW');

    // 點擊「儲存變更」按鈕
    const saveBtn = screen.getByRole('button', { name: /儲存變更/i });
    await user.click(saveBtn);

    // 驗證 updateAssetDetails 是否以新序號呼叫
    await waitFor(() => {
      const calls = querySpy.mock.calls;
      const updateDetailsCall = calls.find(call => call[0] === 'updateAssetDetails');
      expect(updateDetailsCall).toBeDefined();
      expect(updateDetailsCall[1][0]).toBe('STG100385Y25-NEW');

      // 驗證 updateMountedHardwareServerSn 是否同步被呼叫，並傳入新舊序號
      const syncHwCall = calls.find(call => call[0] === 'updateMountedHardwareServerSn');
      expect(syncHwCall).toBeDefined();
      expect(syncHwCall[1]).toEqual(['STG100385Y25-NEW', 'STG100385Y25']);
    });
  });

  it('當變更設備序號遇到重號時，應中斷儲存並阻擋更新', async () => {
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
    querySpy.mockClear();

    // 設定 checkAssetSnExistsExcludeSelf 回傳重複
    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      querySpy(query, params);
      if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') {
        return Promise.resolve({
          success: true,
          rows: [
            {
              id: 10,
              sn: 'STG100385Y25',
              brand: 'Dell',
              model: 'PowerEdge R740',
              status: 'ACTIVE',
              components: [],
              custom_attributes: {}
            }
          ]
        });
      }
      if (query === 'checkAssetSnExistsExcludeSelf') {
        return Promise.resolve({ success: true, rows: [{ id: 999, sn: 'DUPLICATE_SN' }] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    );

    const statsCard = await screen.findByText('Dell');
    await user.click(statsCard);

    const targetCell = await screen.findByText('STG100385Y25');
    expect(targetCell).toBeInTheDocument();

    const moreHorizontalIcon = document.querySelector('.lucide-ellipsis');
    const rowMenuBtn = moreHorizontalIcon.closest('button');
    await user.click(rowMenuBtn);

    const editBtn = await screen.findByText('編輯詳細資訊');
    await user.click(editBtn);

    const snInput = screen.getByDisplayValue('STG100385Y25');
    await user.clear(snInput);
    await user.type(snInput, 'DUPLICATE_SN');

    const saveBtn = screen.getByRole('button', { name: /儲存變更/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('已存在於其他設備或資產'));
      const calls = querySpy.mock.calls;
      const updateDetailsCall = calls.find(call => call[0] === 'updateAssetDetails');
      expect(updateDetailsCall).toBeUndefined();
    });

    alertMock.mockRestore();
  });

  it('在設備編輯彈窗中新增搭載硬體 SN，儲存時應呼叫 bindHardwareToServerSn 將硬體與伺服器 SN 綁定', async () => {
    querySpy.mockClear();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    );

    // 點選 Dell 卡片
    const statsCard = await screen.findByText('Dell');
    await user.click(statsCard);

    // 找到目標設備 STG100385Y25
    const targetCell = await screen.findByText('STG100385Y25');
    expect(targetCell).toBeInTheDocument();

    // 點擊功能選單
    const moreHorizontalIcon = document.querySelector('.lucide-ellipsis');
    const rowMenuBtn = moreHorizontalIcon.closest('button');
    await user.click(rowMenuBtn);

    // 點選「編輯詳細資訊」
    const editBtn = await screen.findByText('編輯詳細資訊');
    await user.click(editBtn);

    // 等待編輯彈窗出現
    expect(await screen.findByText('修改詳細設備資訊')).toBeInTheDocument();

    // 找到搭載硬體 SN 輸入框
    const hwInput = screen.getByLabelText(/搭載硬體 SN/i);
    expect(hwInput).toBeInTheDocument();

    // 輸入新的硬體序號
    await user.type(hwInput, 'HW-NIC-001, HW-NIC-002');

    // 驗證已解析標籤出現
    expect(await screen.findByText(/已設定/i)).toBeInTheDocument();
    expect(screen.getByText('HW-NIC-001')).toBeInTheDocument();
    expect(screen.getByText('HW-NIC-002')).toBeInTheDocument();

    // 點擊「儲存變更」
    const saveBtn = screen.getByRole('button', { name: /儲存變更/i });
    await user.click(saveBtn);

    // 驗證 bindHardwareToServerSn 是否被正確呼叫，將兩個硬體綁定至 STG100385Y25
    await waitFor(() => {
      const calls = querySpy.mock.calls;
      const bindCalls = calls.filter(call => call[0] === 'bindHardwareToServerSn');
      expect(bindCalls.length).toBe(2);
      expect(bindCalls[0][1].slice(0, 2)).toEqual(['STG100385Y25', 'HW-NIC-001']);
      expect(bindCalls[1][1].slice(0, 2)).toEqual(['STG100385Y25', 'HW-NIC-002']);
    });
  });

  it('在設備編輯彈窗中移除已掛載之硬體 SN，儲存時應呼叫 unbindHardwareServerSn 解除該硬體綁定', async () => {
    // 讓設備原本就帶有掛載硬體 HW-ORIG-001 與 HW-ORIG-002
    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      querySpy(query, params);
      if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') {
        return Promise.resolve({
          success: true,
          rows: [
            {
              id: 10,
              sn: 'STG100385Y25',
              brand: 'Dell',
              model: 'PowerEdge R740',
              status: 'ACTIVE',
              components: [
                { brand: 'Mellanox', model: 'MCX512A', sn: 'HW-ORIG-001' },
                { brand: 'Intel', model: 'X520', sn: 'HW-ORIG-002' }
              ],
              custom_attributes: {}
            }
          ]
        });
      }
      if (
        query === 'updateAssetStatus' || 
        query === 'updateMountedHardwareStatus' || 
        query === 'updateAssetDetails' || 
        query === 'updateMountedHardwareServerSn' ||
        query === 'updateRepairItemsSn' ||
        query === 'updateOutboundItemsSn' ||
        query === 'bindHardwareToServerSn' ||
        query === 'unbindHardwareServerSn'
      ) {
        return Promise.resolve({ success: true });
      }
      if (query === 'fetchAvailableHardwares') {
        return Promise.resolve({ success: true, rows: [] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    querySpy.mockClear();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    );

    const statsCard = await screen.findByText('Dell');
    await user.click(statsCard);

    const targetCell = await screen.findByText('STG100385Y25');
    expect(targetCell).toBeInTheDocument();

    const moreHorizontalIcon = document.querySelector('.lucide-ellipsis');
    const rowMenuBtn = moreHorizontalIcon.closest('button');
    await user.click(rowMenuBtn);

    const editBtn = await screen.findByText('編輯詳細資訊');
    await user.click(editBtn);

    expect(await screen.findByText('修改詳細設備資訊')).toBeInTheDocument();

    // 檢查輸入框初始是否帶有原本的兩筆硬體序號
    const hwInput = screen.getByLabelText(/搭載硬體 SN/i);
    expect(hwInput.value).toContain('HW-ORIG-001');
    expect(hwInput.value).toContain('HW-ORIG-002');

    // 修改輸入框，只保留 HW-ORIG-001，移除 HW-ORIG-002
    await user.clear(hwInput);
    await user.type(hwInput, 'HW-ORIG-001');

    const saveBtn = screen.getByRole('button', { name: /儲存變更/i });
    await user.click(saveBtn);

    // 驗證 unbindHardwareServerSn 是否被以 HW-ORIG-002 呼叫
    await waitFor(() => {
      const calls = querySpy.mock.calls;
      const unbindCall = calls.find(call => call[0] === 'unbindHardwareServerSn');
      expect(unbindCall).toBeDefined();
      expect(unbindCall[1]).toEqual(['HW-ORIG-002']);

      // HW-ORIG-001 依然保持綁定
      const bindCall = calls.find(call => call[0] === 'bindHardwareToServerSn' && call[1][1] === 'HW-ORIG-001');
      expect(bindCall).toBeDefined();
      expect(bindCall[1].slice(0, 2)).toEqual(['STG100385Y25', 'HW-ORIG-001']);

      // 驗證 updateAssetDetails 是否將 mounted_hw_sns 存入 custom_attributes
      const updateDetailsCall = calls.find(call => call[0] === 'updateAssetDetails');
      expect(updateDetailsCall).toBeDefined();
      expect(updateDetailsCall[1][10]).toHaveProperty('mounted_hw_sns', 'HW-ORIG-001');
    });
  });

  it('設備即使沒有 components，若 custom_attributes 內有 mounted_hw_sns，開啟編輯彈窗時應能正確載入該序號', async () => {
    const user = userEvent.setup();
    const querySpy = vi.fn((query, params) => {
      if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') {
        return Promise.resolve({
          success: true,
          rows: [
            {
              id: 99,
              sn: 'SRV-CUSTOM-ATTR',
              brand: 'Dell',
              model: 'PowerEdge R740',
              specification: 'Xeon 64GB',
              category_name: '設備',
              status: 'ACTIVE',
              components: null,
              custom_attributes: {
                mounted_hw_sns: 'HW-CA-001, HW-CA-002'
              }
            }
          ]
        });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    window.electronAPI.namedQuery = querySpy;

    render(
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    );

    const statsCard = await screen.findByText('Dell');
    await user.click(statsCard);

    expect(await screen.findByText('SRV-CUSTOM-ATTR')).toBeInTheDocument();

    const moreHorizontalIcon = document.querySelector('.lucide-ellipsis');
    const rowMenuBtn = moreHorizontalIcon.closest('button');
    await user.click(rowMenuBtn);

    const editBtn = await screen.findByText('編輯詳細資訊');
    await user.click(editBtn);

    expect(await screen.findByText('修改詳細設備資訊')).toBeInTheDocument();

    const hwInput = screen.getByLabelText(/搭載硬體 SN/i);
    expect(hwInput.value).toContain('HW-CA-001');
    expect(hwInput.value).toContain('HW-CA-002');
  });

  it('queries.js 中的硬體綁定與查詢語法應具備 JSONB 防呆、RETURNING 與 server_sn 欄位投影', () => {
    // 驗證 bindHardwareToServerSn 具備 jsonb_typeof 防呆且有 RETURNING
    expect(queries.bindHardwareToServerSn).toContain('jsonb_typeof');
    expect(queries.bindHardwareToServerSn).toContain('RETURNING id, sn');

    // 驗證 unbindHardwareServerSn 具備 jsonb_typeof 防呆
    expect(queries.unbindHardwareServerSn).toContain('jsonb_typeof');

    // 驗證 fetchNicList 與 fetchNicListByType 包含 server_sn 欄位投影與大小寫不敏感 JOIN
    expect(queries.fetchNicList).toContain("a.custom_attributes->>'server_sn' as server_sn");
    expect(queries.fetchNicList).toContain("TRIM(LOWER(a.custom_attributes->>'server_sn')) = TRIM(LOWER(s.sn))");
    expect(queries.fetchNicListByType).toContain("a.custom_attributes->>'server_sn' as server_sn");
  });

  it('HwList 應相容解析字串型態 custom_attributes 並正確顯示對應伺服器 SN', async () => {
    window.electronAPI.namedQuery.mockImplementation((query) => {
      if (query === 'fetchNicList' || query === 'fetchNicListByType') {
        return Promise.resolve({
          success: true,
          rows: [
            {
              id: 99,
              sn: 'NIC-TEST-999',
              brand: 'Intel',
              type: 'NIC',
              model: 'E810',
              status: 'ACTIVE',
              // 模擬後端回傳字串型態的 custom_attributes 與 server_sn
              server_sn: 'SRV-STG-999',
              custom_attributes: JSON.stringify({ server_sn: 'SRV-STG-999' })
            }
          ]
        });
      }
      if (query === 'getSystemSetting' || query === 'fetchCustomers' || query === 'fetchActiveProjects') {
        return Promise.resolve({ success: true, rows: [] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    render(
      <MemoryRouter>
        <HwList />
      </MemoryRouter>
    );

    // 等待卡片出現並點擊卡片以展開明細表格
    const card = await screen.findByText('Intel');
    fireEvent.click(card);

    // 驗證表格中正確呈現對應伺服器 SN 與硬體序號
    await waitFor(() => {
      expect(screen.getByText('SRV-STG-999')).toBeInTheDocument();
      expect(screen.getByText('NIC-TEST-999')).toBeInTheDocument();
    });
  });

  it('在設備編輯彈窗輸入尚未建檔之硬體 SN 時，不可自動建立硬體資產，且應跳出警告告警並阻止儲存', async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const querySpy = vi.fn((query, params) => {
      if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') {
        return Promise.resolve({
          success: true,
          rows: [
            {
              id: 50,
              sn: 'SRV-AUTO-001',
              brand: 'Supermicro',
              model: 'SYS-2029U',
              status: 'ACTIVE',
              client: 'MetaTech',
              location: 'Room-A',
              ownership: 'COMPANY',
              custom_attributes: { project_name: 'PJ-ALPHA' }
            }
          ]
        });
      }
      if (query === 'fetchAvailableHardwares') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'checkHardwareSnExists') {
        // 模擬該硬體在資料庫中查無紀錄
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'bindHardwareToServerSn') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'updateAssetDetails') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    window.electronAPI.namedQuery.mockImplementation(querySpy);

    render(
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    );

    const statsCard = await screen.findByText('Supermicro');
    await user.click(statsCard);

    const targetRow = await screen.findByText('SRV-AUTO-001');
    expect(targetRow).toBeInTheDocument();

    const moreHorizontalIcon = document.querySelector('.lucide-ellipsis');
    const rowMenuBtn = moreHorizontalIcon.closest('button');
    await user.click(rowMenuBtn);

    const editBtn = await screen.findByText('編輯詳細資訊');
    await user.click(editBtn);

    const hwInput = screen.getByLabelText(/搭載硬體 SN/i);
    await user.type(hwInput, 'NEW-UNREGISTERED-HW-888');

    const saveBtn = screen.getByRole('button', { name: /儲存變更/i });
    await user.click(saveBtn);

    await waitFor(() => {
      const calls = querySpy.mock.calls;
      // 1. 驗證絕對不可呼叫 insertAssetRecord 自動建檔
      const insertCall = calls.find(call => call[0] === 'insertAssetRecord');
      expect(insertCall).toBeUndefined();

      // 2. 驗證不可呼叫 updateAssetDetails 儲存無效資料
      const updateCall = calls.find(call => call[0] === 'updateAssetDetails');
      expect(updateCall).toBeUndefined();

      // 3. 驗證跳出告警視窗提示使用者
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('NEW-UNREGISTERED-HW-888'));
    });

    alertSpy.mockRestore();
  });
});


