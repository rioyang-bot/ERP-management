import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeviceRegistrationModal from '../components/DeviceRegistrationModal';
import HwRegistrationModal from '../components/HwRegistrationModal';
import ConsumableRegistrationModal from '../components/ConsumableRegistrationModal';
import PurchaseOrderRegistrationModal from '../components/PurchaseOrderRegistrationModal';
import InboundRegistrationModal from '../components/InboundRegistrationModal';
import OutboundRegistrationModal from '../components/OutboundRegistrationModal';
import { RoleContext } from '../context/RoleContext';
import { BrowserRouter } from 'react-router-dom';

describe('全模組彈窗建檔 (Registration Modals) 整合測試', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    window.electronAPI = {
      namedQuery: vi.fn(async (queryName, params) => {
        if (queryName === 'fetchDeviceBrands') {
          return { success: true, rows: [{ name: 'Dell' }, { name: 'Supermicro' }] };
        }
        if (queryName === 'fetchTypesByBrand') {
          return { success: true, rows: [{ name: 'Server' }] };
        }
        if (queryName === 'fetchModelsByBrandType') {
          return { success: true, rows: [{ name: 'R740' }] };
        }
        if (queryName === 'fetchCustomers') {
          return { success: true, rows: [{ id: 1, name: '測試客戶 A', contact: '王小明', phone: '0912345678' }] };
        }
        if (queryName === 'getSystemSetting') {
          return { success: true, rows: [] };
        }
        if (queryName === 'fetchActiveProjects') {
          return { success: true, rows: [] };
        }
        if (queryName === 'fetchNicBrands') {
          return { success: true, rows: [{ name: 'Mellanox' }] };
        }
        if (queryName === 'fetchNicTypesByBrand') {
          return { success: true, rows: [{ name: 'NIC' }] };
        }
        if (queryName === 'fetchNicModelsByBrandType') {
          return { success: true, rows: [{ name: 'ConnectX-5' }] };
        }
        if (queryName === 'fetchConsumableBrands') {
          return { success: true, rows: [{ name: 'Cisco' }] };
        }
        if (queryName === 'fetchConsumableTypesByBrand') {
          return { success: true, rows: [{ name: 'Cable' }] };
        }
        if (queryName === 'fetchConsumableModelsByBrandType') {
          return { success: true, rows: [{ name: 'DAC-10G' }] };
        }
        if (queryName === 'checkDuplicateConsumable') {
          return { success: true, rows: [] };
        }
        if (queryName === 'fetchSuppliers') {
          return { success: true, rows: [{ id: 1, name: '供應商 A' }] };
        }
        if (queryName === 'fetchCategories') {
          return { success: true, rows: [{ id: 1, name: '設備' }] };
        }
        if (queryName === 'fetchPurchasingRecords') {
          return { success: true, rows: [] };
        }
        if (queryName === 'fetchInboundItemMaster') {
          return { success: true, rows: [] };
        }
        if (queryName === 'fetchPendingPurchases') {
          return { success: true, rows: [] };
        }
        if (queryName === 'countPurchaseOrders' || queryName === 'countInboundOrders') {
          return { success: true, rows: [{ count: 1 }] };
        }
        return { success: true, rows: [] };
      }),
      logAudit: vi.fn(async () => ({ success: true })),
      saveFile: vi.fn(async () => ({ success: true, fileName: 'mock.pdf' }))
    };

    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
  });

  it('DeviceRegistrationModal 應能順利渲染並在未填規格時給予警示', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    render(
      <DeviceRegistrationModal
        isOpen={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    expect(screen.getByText(/新增設備建檔/i)).toBeInTheDocument();
    expect(screen.getByText(/儲存並關閉/i)).toBeInTheDocument();
    expect(screen.getByText(/儲存並繼續新增/i)).toBeInTheDocument();

    const saveBtn = screen.getByText(/儲存並關閉/i);
    fireEvent.click(saveBtn);

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('請填寫必填欄位'));
  });

  it('HwRegistrationModal 應能順利渲染並支援單筆/多筆連續建檔模式切換', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    render(
      <HwRegistrationModal
        isOpen={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    expect(screen.getByText(/新增硬體建檔/i)).toBeInTheDocument();
    expect(screen.getByText(/單筆建檔模式/i)).toBeInTheDocument();
    expect(screen.getByText(/多筆連續建檔模式/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/多筆連續建檔模式/i));
    expect(screen.getByText(/批次序號清單/i)).toBeInTheDocument();
  });

  it('ConsumableRegistrationModal 應能順利渲染並呈現規格必填提示', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    render(
      <ConsumableRegistrationModal
        isOpen={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    expect(screen.getByText(/新增耗材主檔/i)).toBeInTheDocument();
    expect(screen.getByText(/初始庫存數量/i)).toBeInTheDocument();
    expect(screen.getByText(/安全庫存警示量/i)).toBeInTheDocument();
  });

  it('PurchaseOrderRegistrationModal 應能順利渲染', async () => {
    render(
      <BrowserRouter>
        <RoleContext.Provider value={{ authUser: { id: 1, role: 'ADMIN' } }}>
          <PurchaseOrderRegistrationModal
            isOpen={true}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
          />
        </RoleContext.Provider>
      </BrowserRouter>
    );

    expect(screen.getByText(/新增採購單建檔/i)).toBeInTheDocument();
  });

  it('InboundRegistrationModal 應能順利渲染', async () => {
    render(
      <InboundRegistrationModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText(/新增進貨入庫單/i)).toBeInTheDocument();
  });

  it('OutboundRegistrationModal 應能順利渲染', async () => {
    render(
      <BrowserRouter>
        <RoleContext.Provider value={{ authUser: { id: 1, role: 'ADMIN' } }}>
          <OutboundRegistrationModal
            isOpen={true}
            onClose={vi.fn()}
            onSuccess={vi.fn()}
          />
        </RoleContext.Provider>
      </BrowserRouter>
    );

    expect(screen.getByText(/新增出貨單建檔/i)).toBeInTheDocument();
  });
});
