import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ProcurementRegistration from '../pages/Purchasing';
import { RoleContext } from '../context/RoleContext';

const mockAuthUser = {
  id: 1,
  username: 'METECH',
  full_name: '系統管理員',
  role: 'ADMIN'
};

const mockItemMaster = [
  {
    id: 101,
    category_id: 1,
    cat_name: '設備',
    brand: 'Dell',
    type: '伺服器',
    model: 'PowerEdge R750',
    specification: 'Dell Server Spec 1',
    unit: '台',
    current_stock: 3,
    safety_stock: 5
  },
  {
    id: 102,
    category_id: 1,
    cat_name: '設備',
    brand: 'Cisco',
    type: 'switch',
    model: 'C3548',
    specification: '48 Port Switch',
    unit: '台',
    current_stock: 1,
    safety_stock: 2
  },
  {
    id: 103,
    category_id: 1,
    cat_name: '設備',
    brand: 'Dell',
    type: 'Server',
    model: 'R740',
    specification: '2U Server',
    unit: '台',
    current_stock: 0,
    safety_stock: 2
  }
];

describe('採購單建檔品項選取與卡片一致性測試', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    window.electronAPI = {
      namedQuery: vi.fn().mockImplementation((query, params) => {
        if (query === 'fetchPurchasingRecords') {
          return Promise.resolve({ success: true, rows: [] });
        }
        if (query === 'fetchSuppliers') {
          return Promise.resolve({ success: true, rows: [{ id: 1, name: '供應商A' }] });
        }
        if (query === 'fetchCategories') {
          return Promise.resolve({ success: true, rows: [{ id: 1, name: '設備' }] });
        }
        if (query === 'fetchInboundItemMaster') {
          return Promise.resolve({ success: true, rows: mockItemMaster });
        }
        if (query === 'fetchBrandsByCategory') {
          return Promise.resolve({ success: true, rows: [{ name: 'Dell' }, { name: 'Cisco' }] });
        }
        if (query === 'fetchTypesByCategory') {
          return Promise.resolve({
            success: true,
            rows: [
              { name: '伺服器', brand: 'Dell' },
              { name: 'switch', brand: 'Cisco' },
              { name: 'Server', brand: 'Dell' }
            ]
          });
        }
        if (query === 'fetchModelsByCategory') {
          return Promise.resolve({
            success: true,
            rows: [
              { model: 'PowerEdge R750', type: '伺服器', brand: 'Dell', specification: 'Dell Server Spec 1', unit: '台' },
              { model: 'C3548', type: 'switch', brand: 'Cisco', specification: '48 Port Switch', unit: '台' },
              { model: 'R740', type: 'Server', brand: 'Dell', specification: '2U Server', unit: '台' }
            ]
          });
        }
        if (query === 'countPurchaseOrders') {
          return Promise.resolve({ success: true, rows: [{ count: 0 }] });
        }
        return Promise.resolve({ success: true, rows: [] });
      })
    };
  });

  it('應呈現與進貨單一致的「點擊選取採購品項」虛線按鈕，點擊開啟彈窗選取後正確轉化為卡片，且可清除', async () => {
    render(
      <RoleContext.Provider value={{ authUser: mockAuthUser, role: 'ADMIN' }}>
        <MemoryRouter>
          <ProcurementRegistration />
        </MemoryRouter>
      </RoleContext.Provider>
    );

    // 1. 等待頁面載入
    await waitFor(() => {
      expect(screen.getByText(/採購建檔/)).toBeInTheDocument();
    });

    // 2. 驗證明細表格欄位標題與進貨單一致（採購品項項目、類別、供應商、數量、移除）
    expect(screen.getByText('採購品項項目')).toBeInTheDocument();
    expect(screen.getByText('類別')).toBeInTheDocument();
    expect(screen.getByText('供應商')).toBeInTheDocument();
    expect(screen.getByText('數量')).toBeInTheDocument();
    expect(screen.getByText('移除')).toBeInTheDocument();

    // 3. 檢查未選品項時，顯示精緻虛線按鈕
    const selectItemBtn = screen.getByText(/點擊選取採購品項/);
    expect(selectItemBtn).toBeInTheDocument();

    // 4. 點擊按鈕開啟彈窗
    fireEvent.click(selectItemBtn);

    await waitFor(() => {
      expect(screen.getByText('挑選採購品項 (Select Purchase Items)')).toBeInTheDocument();
    });

    // 5. 在彈窗中挑選 Dell PowerEdge R750 (點擊單筆加入)
    const addBtn = screen.getByTestId('single-add-btn-101');
    fireEvent.click(addBtn);

    // 6. 驗證彈窗關閉，表格列轉化為淡藍色卡片
    await waitFor(() => {
      expect(screen.getByText(/Dell PowerEdge R750/)).toBeInTheDocument();
      expect(screen.getByText('Dell Server Spec 1')).toBeInTheDocument();
      expect(screen.getByText('設備')).toBeInTheDocument(); // 類別徽章
    });

    // 7. 驗證卡片上有「更換」與「清除」按鈕
    expect(screen.getByText('更換')).toBeInTheDocument();
    const clearBtn = screen.getByTitle('清除品項');
    expect(clearBtn).toBeInTheDocument();

    // 8. 點擊清除按鈕，應回退為選取按鈕
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText(/點擊選取採購品項/)).toBeInTheDocument();
    });
  });

  it('已匯入之設備 (如 Server 與 switch) 應能在採購品項庫彈窗中被搜尋與挑選', async () => {
    render(
      <RoleContext.Provider value={{ authUser: mockAuthUser, role: 'ADMIN' }}>
        <MemoryRouter>
          <ProcurementRegistration />
        </MemoryRouter>
      </RoleContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/採購建檔/)).toBeInTheDocument();
    });

    // 點擊「📦 從品項庫挑選 (可批次勾選加入)」按鈕
    const batchPickBtn = screen.getByTestId('open-purchase-item-modal-btn');
    fireEvent.click(batchPickBtn);

    await waitFor(() => {
      expect(screen.getByText('挑選採購品項 (Select Purchase Items)')).toBeInTheDocument();
    });

    // 驗證彈窗中能檢索出 Server 與 switch 品項
    expect(screen.getByText('C3548')).toBeInTheDocument();
    expect(screen.getByText('R740')).toBeInTheDocument();

    // 測試多關鍵字搜尋 switch
    const searchInput = screen.getByTestId('purchase-search-input');
    fireEvent.change(searchInput, { target: { value: 'switch Cisco' } });

    expect(screen.getByText('C3548')).toBeInTheDocument();
    expect(screen.queryByText('PowerEdge R750')).toBeNull();

    // 勾選 switch 品項並批次加入
    fireEvent.click(screen.getByTestId('item-checkbox-102'));
    fireEvent.click(screen.getByTestId('batch-add-confirm-btn'));

    // 表格中應成功渲染出 Cisco C3548
    await waitFor(() => {
      expect(screen.getByText(/Cisco C3548/)).toBeInTheDocument();
      expect(screen.getByText('48 Port Switch')).toBeInTheDocument();
    });
  });
});
