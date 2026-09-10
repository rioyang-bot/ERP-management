import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PurchaseItemSelectModal from '../components/PurchaseItemSelectModal';
import Purchasing from '../pages/Purchasing';
import { RoleContext } from '../context/RoleContext';
import { BrowserRouter } from 'react-router-dom';

const mockItems = [
  {
    id: 101,
    category_id: 1,
    cat_name: '設備',
    brand: 'Cisco',
    model: 'N3K-C3548P-XL',
    type: '交換器',
    specification: '48 Port 10G SFP+',
    unit: '台',
    current_stock: 2,
    safety_stock: 5 // 低於安全庫存
  },
  {
    id: 102,
    category_id: 1,
    cat_name: '設備',
    brand: 'Dell',
    model: 'PowerEdge R740',
    type: '伺服器',
    specification: '2U Rack Server',
    unit: '台',
    current_stock: 8,
    safety_stock: 4 // 正常
  },
  {
    id: 103,
    category_id: 2,
    cat_name: '硬體',
    brand: 'Mellanox',
    model: 'MCX512A-ACAT',
    type: '網卡',
    specification: 'ConnectX-5 25GbE',
    unit: '張',
    current_stock: 1,
    safety_stock: 3 // 低於安全庫存
  },
  {
    id: 104,
    category_id: 3,
    cat_name: '耗材',
    brand: 'METECH',
    model: 'LC-LC-OM4-3M',
    type: '光纖線',
    specification: '多模雙芯光纖跳線 3米',
    unit: '條',
    current_stock: 80,
    safety_stock: 20 // 正常
  }
];

const mockCategories = [
  { id: 1, name: '設備' },
  { id: 2, name: '硬體' },
  { id: 3, name: '耗材' }
];

describe('PurchaseItemSelectModal 組件測試', () => {
  it('當 isOpen 為 false 時不渲染任何內容', () => {
    const { container } = render(
      <PurchaseItemSelectModal
        isOpen={false}
        onClose={vi.fn()}
        items={mockItems}
        onBatchAdd={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('正確渲染類別切換標籤與低於安全庫存警示', () => {
    render(
      <PurchaseItemSelectModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        onBatchAdd={vi.fn()}
      />
    );

    expect(screen.getByText('挑選採購品項 (Select Purchase Items)')).toBeInTheDocument();
    expect(screen.getByText('全部品項')).toBeInTheDocument();

    // 檢查庫存與安全庫存呈現
    expect(screen.getByText('2 / 5 台')).toBeInTheDocument();
    expect(screen.getAllByText(/⚠️ 需補貨/).length).toBe(2); // Cisco 與 Mellanox
  });

  it('僅看低於安全庫存篩選開關能正確過濾', () => {
    render(
      <PurchaseItemSelectModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        onBatchAdd={vi.fn()}
      />
    );

    // 點擊「僅看低於安全庫存」
    fireEvent.click(screen.getByTestId('low-stock-toggle'));

    expect(screen.getByText('N3K-C3548P-XL')).toBeInTheDocument();
    expect(screen.getByText('MCX512A-ACAT')).toBeInTheDocument();
    expect(screen.queryByText('PowerEdge R740')).toBeNull();
    expect(screen.queryByText('LC-LC-OM4-3M')).toBeNull();
  });

  it('支援多關鍵字搜尋與單筆加入', () => {
    const onSingleAdd = vi.fn();
    render(
      <PurchaseItemSelectModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        onSingleAdd={onSingleAdd}
      />
    );

    const searchInput = screen.getByTestId('purchase-search-input');
    fireEvent.change(searchInput, { target: { value: 'METECH 3米' } });

    expect(screen.getByText('LC-LC-OM4-3M')).toBeInTheDocument();
    expect(screen.queryByText('N3K-C3548P-XL')).toBeNull();

    // 點擊單筆加入
    fireEvent.click(screen.getByTestId('single-add-btn-104'));
    expect(onSingleAdd).toHaveBeenCalledWith(
      expect.objectContaining({ id: 104, model: 'LC-LC-OM4-3M' }),
      1
    );
  });

  it('支援勾選多筆品項、修改數量並批次加入', () => {
    const onBatchAdd = vi.fn();
    render(
      <PurchaseItemSelectModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        onBatchAdd={onBatchAdd}
      />
    );

    // 勾選 Cisco 並設定數量為 3
    fireEvent.click(screen.getByTestId('item-checkbox-101'));
    const qtyInput1 = screen.getByTestId('item-qty-input-101');
    fireEvent.change(qtyInput1, { target: { value: '3' } });

    // 勾選 METECH 耗材並設定數量為 20
    fireEvent.click(screen.getByTestId('item-checkbox-104'));
    const qtyInput4 = screen.getByTestId('item-qty-input-104');
    fireEvent.change(qtyInput4, { target: { value: '20' } });

    // 檢查已勾選筆數
    expect(screen.getByText(/已勾選/)).toBeInTheDocument();

    // 點擊批次加入採購單
    fireEvent.click(screen.getByTestId('batch-add-confirm-btn'));

    expect(onBatchAdd).toHaveBeenCalledWith([
      expect.objectContaining({ id: 101, quantity: 3 }),
      expect.objectContaining({ id: 104, quantity: 20 })
    ]);
  });

  it('對於零庫存/孤立品項應提供刪除垃圾桶按鈕，且能確認刪除並自列表移除', async () => {
    const mockZeroStockItems = [
      ...mockItems,
      {
        id: 999,
        category_id: 2,
        cat_name: '硬體',
        brand: 'AMD',
        model: 'Solarflar X4522',
        type: '硬體',
        specification: '2 彳ㄟ',
        unit: '個',
        current_stock: 0,
        safety_stock: 0
      }
    ];

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    window.electronAPI = {
      namedQuery: vi.fn().mockResolvedValue({ success: true, rows: [{ id: 999 }] })
    };

    const onItemDeleted = vi.fn();

    render(
      <PurchaseItemSelectModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockZeroStockItems}
        onItemDeleted={onItemDeleted}
      />
    );

    // 檢查錯誤規格品項存在於清單中
    expect(screen.getByText('2 彳ㄟ')).toBeInTheDocument();

    // 庫存為 0 的品項應有刪除按鈕
    const deleteBtn = screen.getByTestId('delete-orphan-btn-999');
    expect(deleteBtn).toBeInTheDocument();

    // 庫存 > 0 的品項 (例如 101, 102, 103, 104) 不應有刪除按鈕
    expect(screen.queryByTestId('delete-orphan-btn-101')).toBeNull();

    // 點擊刪除
    fireEvent.click(deleteBtn);

    expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('deleteItemMasterIfOrphan', [999]);
    await waitFor(() => {
      expect(screen.queryByText('2 彳ㄟ')).toBeNull();
      expect(onItemDeleted).toHaveBeenCalledWith(999);
    });
  });
});

describe('Purchasing 頁面整合測試', () => {
  beforeEach(() => {
    window.electronAPI = {
      namedQuery: vi.fn().mockImplementation((queryName) => {
        if (queryName === 'fetchPurchasingRecords') {
          return Promise.resolve({ success: true, rows: [] });
        }
        if (queryName === 'fetchSuppliers') {
          return Promise.resolve({ success: true, rows: [{ id: 1, name: '測試供應商' }] });
        }
        if (queryName === 'fetchCategories') {
          return Promise.resolve({ success: true, rows: mockCategories });
        }
        if (queryName === 'fetchInboundItemMaster') {
          return Promise.resolve({ success: true, rows: mockItems });
        }
        if (queryName === 'fetchBrandsByCategory') {
          return Promise.resolve({ success: true, rows: [{ name: 'Cisco' }] });
        }
        if (queryName === 'fetchTypesByCategory') {
          return Promise.resolve({ success: true, rows: [{ id: 1, name: '交換器', brand: 'Cisco' }] });
        }
        if (queryName === 'fetchModelsByCategory') {
          return Promise.resolve({ success: true, rows: [{ id: 1, model: 'N3K-C3548P-XL', type: '交換器', brand: 'Cisco' }] });
        }
        if (queryName === 'countPurchaseOrders') {
          return Promise.resolve({ success: true, rows: [{ count: 1 }] });
        }
        return Promise.resolve({ success: true, rows: [] });
      })
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('採購單建檔頁面應提供「從品項庫挑選」與「新增空白列」按鈕，且可批次挑選加入品項', async () => {
    render(
      <RoleContext.Provider value={{ authUser: { full_name: '採購管理員' } }}>
        <BrowserRouter>
          <Purchasing />
        </BrowserRouter>
      </RoleContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('open-purchase-item-modal-btn')).toBeInTheDocument();
      expect(screen.getByTestId('add-blank-row-btn')).toBeInTheDocument();
    });

    // 點擊「📦 從品項庫挑選」開啟彈窗
    fireEvent.click(screen.getByTestId('open-purchase-item-modal-btn'));

    await waitFor(() => {
      expect(screen.getByText('挑選採購品項 (Select Purchase Items)')).toBeInTheDocument();
    });

    // 勾選 Dell 伺服器
    fireEvent.click(screen.getByTestId('item-checkbox-102'));
    // 點擊批次加入
    fireEvent.click(screen.getByTestId('batch-add-confirm-btn'));

    // 彈窗關閉，明細表格中已帶入 PowerEdge R740 卡片
    await waitFor(() => {
      expect(screen.getByText(/PowerEdge R740/)).toBeInTheDocument();
    });
  });
});
