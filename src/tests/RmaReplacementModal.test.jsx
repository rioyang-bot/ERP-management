import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RmaReplacementModal from '../components/RmaReplacementModal';

describe('RmaReplacementModal 彈窗整合測試', () => {
  const onSuccessMock = vi.fn();
  const onCloseMock = vi.fn();

  const mockAsset = {
    id: 101,
    item_master_id: 15,
    sn: 'OLD_SN_999',
    brand: 'Supermicro',
    model: 'SYS-6029P-WTR',
    type: '伺服器',
    client: '緯創資通',
    end_user: '測試部',
    hostname: 'WISTRON-NODE-01',
    location: '1F機房',
    ownership: 'FOR_SALE',
    status: 'REPAIR',
    components: [
      { id: 1, sn: 'NIC-111', model: 'MCX512A-ACAT' },
      { id: 2, sn: 'NIC-222', model: 'MCX512A-ACAT' }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    window.electronAPI = {
      namedQuery: vi.fn().mockImplementation((query, params) => {
        if (query === 'checkAssetSnExists' || query === 'checkAssetSnExistsExcludeSelf') {
          if (params[0] === 'DUPLICATE_SN') {
            return Promise.resolve({ success: true, rows: [{ id: 99, sn: 'DUPLICATE_SN' }] });
          }
          return Promise.resolve({ success: true, rows: [] });
        }
        if (query === 'updateAssetDetails' || query === 'updateAssetStatus') {
          return Promise.resolve({ success: true });
        }
        if (query === 'updateMountedHardwareServerSn') {
          return Promise.resolve({ success: true });
        }
        if (query === 'updateRepairItemsSn' || query === 'updateOutboundItemsSn') {
          return Promise.resolve({ success: true });
        }
        if (query === 'updateAssetStatusAndAttributes') {
          return Promise.resolve({ success: true });
        }
        if (query === 'insertRmaAssetRecord') {
          return Promise.resolve({ success: true, rows: [{ id: 999, sn: params[1], status: 'ACTIVE' }] });
        }
        if (query === 'insertAuditLog') {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true, rows: [] });
      })
    };
  });

  it('應正確顯示目標資產資訊與雙模式選項卡片', () => {
    render(
      <RmaReplacementModal
        isOpen={true}
        onClose={onCloseMock}
        asset={mockAsset}
        onSuccess={onSuccessMock}
      />
    );

    expect(screen.getByText(/原廠換新 \/ 更換序號/i)).toBeInTheDocument();
    expect(screen.getByText('OLD_SN_999')).toBeInTheDocument();
    expect(screen.getByText(/模式一：直接更換序號/i)).toBeInTheDocument();
    expect(screen.getByText(/模式二：RMA 一換一更換/i)).toBeInTheDocument();
    expect(screen.getByText(/2 件（將自動連動新序號）/i)).toBeInTheDocument();
  });

  it('若輸入的新序號與舊序號相同，應顯示警告阻擋送出', async () => {
    render(
      <RmaReplacementModal
        isOpen={true}
        onClose={onCloseMock}
        asset={mockAsset}
        onSuccess={onSuccessMock}
      />
    );

    const input = screen.getByPlaceholderText(/請輸入或掃描原廠新品序號/i);
    fireEvent.change(input, { target: { value: 'OLD_SN_999' } });

    const submitBtn = screen.getByRole('button', { name: /確認直接更換序號/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/新序號不可與當前舊序號完全相同/i)).toBeInTheDocument();
    });
    expect(onSuccessMock).not.toHaveBeenCalled();
  });

  it('模式一直接換號送出應呼叫 updateAssetDetails 與 updateMountedHardwareServerSn', async () => {
    render(
      <RmaReplacementModal
        isOpen={true}
        onClose={onCloseMock}
        asset={mockAsset}
        onSuccess={onSuccessMock}
      />
    );

    const input = screen.getByPlaceholderText(/請輸入或掃描原廠新品序號/i);
    fireEvent.change(input, { target: { value: 'NEW_SN_2026_01' } });

    const submitBtn = screen.getByRole('button', { name: /確認直接更換序號/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'updateAssetDetails',
        expect.arrayContaining(['NEW_SN_2026_01'])
      );
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'updateMountedHardwareServerSn',
        ['NEW_SN_2026_01', 'OLD_SN_999']
      );
      expect(onSuccessMock).toHaveBeenCalled();
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  it('切換為模式二 RMA 一換一換新，應建立新品入庫並將舊品報廢', async () => {
    render(
      <RmaReplacementModal
        isOpen={true}
        onClose={onCloseMock}
        asset={mockAsset}
        onSuccess={onSuccessMock}
      />
    );

    // 點擊模式二
    const mode2Card = screen.getByText(/模式二：RMA 一換一更換/i);
    fireEvent.click(mode2Card);

    // 確認按鈕文字變成確認一換一換新入庫
    const submitBtn = screen.getByRole('button', { name: /確認一換一換新入庫/i });
    expect(submitBtn).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/請輸入或掃描原廠新品序號/i);
    fireEvent.change(input, { target: { value: 'NEW_ONE_TO_ONE_SN' } });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'updateAssetStatusAndAttributes',
        ['SCRAPPED', expect.any(Object), 101]
      );
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'insertRmaAssetRecord',
        expect.arrayContaining(['NEW_ONE_TO_ONE_SN'])
      );
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'updateMountedHardwareServerSn',
        ['NEW_ONE_TO_ONE_SN', 'OLD_SN_999']
      );
      expect(onSuccessMock).toHaveBeenCalled();
      expect(onCloseMock).toHaveBeenCalled();
    });
  });
});
