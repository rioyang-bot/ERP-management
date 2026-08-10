import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeviceList from '../pages/DeviceList';
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
      if (query === 'updateAssetStatus' || query === 'updateMountedHardwareStatus') {
        return Promise.resolve({ success: true });
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
    const statsCard = await screen.findByText(/PowerEdge R740/);
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
    const statsCard = await screen.findByText(/PowerEdge R740/);
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
    const statsCard = await screen.findByText(/PowerEdge R740/);
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
});
