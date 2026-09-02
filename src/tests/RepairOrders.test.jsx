import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RepairList from '../pages/RepairList';
import RepairOrderRegistrationModal from '../components/RepairOrderRegistrationModal';
import RepairActionModal from '../components/RepairActionModal';
import { MemoryRouter } from 'react-router-dom';

describe('維修單管理系統 (Repair Orders / RMA List) 四階段流程與設備狀態連動測試', () => {
  const alertMock = vi.fn();
  const confirmMock = vi.fn();

  const mockAssets = [
    {
      asset_id: 101,
      sn: 'X0342639',
      status: 'SHIPPED',
      client: 'Yuanta Ryan',
      brand: 'BC',
      type: '56C H100',
      model: '56C H100',
      specification: '2U Server',
      category_name: '設備',
      item_master_id: 1
    },
    {
      asset_id: 102,
      sn: 'BC025778',
      status: 'SHIPPED',
      client: 'Yuanta Ryan',
      brand: 'BC',
      type: '96C',
      model: '96C',
      specification: '',
      category_name: '設備',
      item_master_id: 2
    }
  ];

  const mockRepairOrders = [
    {
      id: 1,
      repair_no: 'RMA-20260902-001',
      customer_name: 'Yuanta Ryan',
      status: 'ON_SITE_HANDLING',
      on_site_date: '2026-06-25',
      on_site_status: '取回 重灌OS',
      send_oem_date: null,
      oem_return_date: null,
      results: null,
      completion_date: null,
      creator_name: 'Admin',
      items: [
        {
          id: 11,
          brand: 'BC',
          type: '56C H100',
          model: '56C H100',
          sn: 'X0342639',
          asset_id: 101,
          item_master_id: 1
        }
      ]
    },
    {
      id: 2,
      repair_no: 'RMA-20260902-002',
      customer_name: 'Yuanta Ryan',
      status: 'SENT_OEM',
      on_site_date: '2026-06-25',
      on_site_status: 'CPU溫度過高 (水冷正常) 取回 RMA',
      send_oem_date: '2026-06-30',
      oem_return_date: null,
      results: null,
      completion_date: null,
      creator_name: 'Admin',
      items: [
        {
          id: 12,
          brand: 'BC',
          type: '96C',
          model: '96C',
          sn: 'BC025778',
          asset_id: 102,
          item_master_id: 2
        }
      ]
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = alertMock;
    window.confirm = confirmMock.mockReturnValue(true);

    window.electronAPI = {
      namedQuery: vi.fn(async (query, params) => {
        if (query === 'initRepairTables') {
          return { success: true, rows: [] };
        }
        if (query === 'fetchRepairOrders') {
          return { success: true, rows: mockRepairOrders };
        }
        if (query === 'fetchAssetsForRepairSelection') {
          return { success: true, rows: mockAssets };
        }
        if (query === 'fetchCustomers') {
          return { success: true, rows: [{ name: 'Yuanta Ryan' }] };
        }
        if (query === 'countRepairOrders') {
          return { success: true, rows: [{ count: 1 }] };
        }
        if (query === 'createRepairOrder') {
          return {
            success: true,
            rows: [
              {
                id: 3,
                repair_no: params[0],
                customer_name: params[1],
                status: 'ON_SITE_HANDLING',
                on_site_date: params[2],
                on_site_status: params[3]
              }
            ]
          };
        }
        if (query === 'createRepairOrderItem') {
          return { success: true, rows: [{ id: 13 }] };
        }
        if (query === 'updateAssetStatusBySn') {
          return { success: true, rowCount: 1 };
        }
        if (query === 'updateRepairSendOEM') {
          return { success: true, rows: [{ id: params[2], status: 'SENT_OEM', send_oem_date: params[0] }] };
        }
        if (query === 'updateRepairOEMReturn') {
          return { success: true, rows: [{ id: params[3], status: 'OEM_RETURNED', oem_return_date: params[0], results: params[1] }] };
        }
        if (query === 'updateRepairCompleted') {
          return { success: true, rows: [{ id: params[2], status: 'COMPLETED', completion_date: params[0] }] };
        }
        if (query === 'deleteRepairOrder') {
          return { success: true, rowCount: 1 };
        }
        return { success: true, rows: [] };
      })
    };
  });

  it('1. 應正確渲染 RepairList 列表並呈現維修單、客戶與設備序號', async () => {
    render(
      <MemoryRouter>
        <RepairList />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('維修單列表 (Repair Orders / RMA List)')).toBeInTheDocument();
      expect(screen.getByText('RMA-20260902-001')).toBeInTheDocument();
      expect(screen.getByText('RMA-20260902-002')).toBeInTheDocument();
      expect(screen.getByText(/X0342639/)).toBeInTheDocument();
      expect(screen.getByText(/BC025778/)).toBeInTheDocument();
      expect(screen.getByText('取回 重灌OS')).toBeInTheDocument();
    });
  });

  it('2. 階段 1 建立維修單：寫入 On-site handling Date 與 Status，並將設備狀態設為 在庫 (ACTIVE)', async () => {
    const onSuccessMock = vi.fn();
    render(
      <RepairOrderRegistrationModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={onSuccessMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('新增維修單 (Create Repair Order / RMA)')).toBeInTheDocument();
      expect(screen.getByText('X0342639')).toBeInTheDocument();
    });

    // 點選加入設備
    const addButtons = screen.getAllByText('+ 加入');
    fireEvent.click(addButtons[0]);

    // 點選常用故障原因
    const tagBtn = screen.getByText('+ 取回 重灌OS');
    fireEvent.click(tagBtn);

    // 提交表單
    const submitBtn = screen.getByText(/確認建立維修單/i);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      // 驗證呼叫 createRepairOrder
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'createRepairOrder',
        expect.arrayContaining(['Yuanta Ryan', '取回 重灌OS'])
      );

      // 驗證將設備序號狀態改為 ACTIVE (在庫)
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'updateAssetStatusBySn',
        ['ACTIVE', 'X0342639']
      );

      expect(onSuccessMock).toHaveBeenCalled();
    });
  });

  it('3. 階段 2 送修原廠確認：寫入 Send OEM Date，並將設備狀態設為 維修 (REPAIRING)', async () => {
    const onSuccessMock = vi.fn();
    render(
      <RepairActionModal
        isOpen={true}
        onClose={vi.fn()}
        repairOrder={mockRepairOrders[0]}
        actionType="SEND_OEM"
        onSuccess={onSuccessMock}
      />
    );

    expect(screen.getByText('送修原廠確認 (Send to OEM)')).toBeInTheDocument();
    expect(screen.getByText('RMA-20260902-001')).toBeInTheDocument();

    const submitBtn = screen.getByText(/確認送修原廠/i);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'updateRepairSendOEM',
        expect.arrayContaining([mockRepairOrders[0].id])
      );
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'updateAssetStatusBySn',
        ['REPAIRING', 'X0342639']
      );
      expect(onSuccessMock).toHaveBeenCalled();
    });
  });

  it('4. 階段 3 原廠返還確認：寫入 OEM Return Date 與 Results，並將設備狀態設為 在庫 (ACTIVE)', async () => {
    const onSuccessMock = vi.fn();
    render(
      <RepairActionModal
        isOpen={true}
        onClose={vi.fn()}
        repairOrder={mockRepairOrders[1]}
        actionType="OEM_RETURN"
        onSuccess={onSuccessMock}
      />
    );

    expect(screen.getByText('原廠修復寄回確認 (OEM Return)')).toBeInTheDocument();

    // 點選快速結果
    const quickResultBtn = screen.getByText('+ 原廠修復寄回');
    fireEvent.click(quickResultBtn);

    const submitBtn = screen.getByText(/確認原廠返還/i);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'updateRepairOEMReturn',
        expect.arrayContaining(['原廠修復寄回', mockRepairOrders[1].id])
      );
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'updateAssetStatusBySn',
        ['ACTIVE', 'BC025778']
      );
      expect(onSuccessMock).toHaveBeenCalled();
    });
  });

  it('5. 階段 4 客戶出貨確認：寫入 Completion Date，並將設備狀態設為 出庫 (SHIPPED)', async () => {
    const onSuccessMock = vi.fn();
    render(
      <RepairActionModal
        isOpen={true}
        onClose={vi.fn()}
        repairOrder={{ ...mockRepairOrders[1], status: 'OEM_RETURNED' }}
        actionType="COMPLETE"
        onSuccess={onSuccessMock}
      />
    );

    expect(screen.getByText('客戶出貨/完工確認 (Completion & Ship)')).toBeInTheDocument();

    const submitBtn = screen.getByText(/確認出貨完工/i);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'updateRepairCompleted',
        expect.arrayContaining([mockRepairOrders[1].id])
      );
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'updateAssetStatusBySn',
        ['SHIPPED', 'BC025778']
      );
      expect(onSuccessMock).toHaveBeenCalled();
    });
  });
});
