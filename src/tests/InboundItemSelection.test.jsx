import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InboundItemSelectModal from '../components/InboundItemSelectModal';
import Inbound from '../pages/Inbound';

const mockItems = [
  {
    id: 1,
    cat_name: '設備',
    brand: 'Cisco',
    model: 'N3K-C3548P-XL',
    type: '交換器',
    specification: '48 Port 10G SFP+',
    unit: '台',
    current_stock: 12
  },
  {
    id: 2,
    cat_name: '設備',
    brand: 'Dell',
    model: 'PowerEdge R740',
    type: '伺服器',
    specification: '2U Rack Server',
    unit: '台',
    current_stock: 5
  },
  {
    id: 3,
    cat_name: '硬體',
    brand: 'Mellanox',
    model: 'MCX512A-ACAT',
    type: '網卡',
    specification: 'ConnectX-5 25GbE Dual-Port',
    unit: '張',
    current_stock: 8
  },
  {
    id: 4,
    cat_name: '耗材',
    brand: 'METECH',
    model: 'LC-LC-OM4-3M',
    type: '光纖線',
    specification: '多模雙芯光纖跳線 3米',
    unit: '條',
    current_stock: 50
  }
];

describe('InboundItemSelectModal 組件測試', () => {
  it('當 isOpen 為 false 時不渲染任何內容', () => {
    const { container } = render(
      <InboundItemSelectModal
        isOpen={false}
        onClose={vi.fn()}
        items={mockItems}
        onSelect={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('正確渲染類別切換標籤與品項清單', () => {
    render(
      <InboundItemSelectModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('選取庫存品項 (Select Item Master)')).toBeInTheDocument();
    expect(screen.getByText('全部品項')).toBeInTheDocument();
    expect(screen.getByText('設備 (Device)')).toBeInTheDocument();
    expect(screen.getByText('硬體 (Hardware)')).toBeInTheDocument();
    expect(screen.getByText('耗材 (Consumable)')).toBeInTheDocument();

    // 檢查表格列
    expect(screen.getByText('N3K-C3548P-XL')).toBeInTheDocument();
    expect(screen.getByText('MCX512A-ACAT')).toBeInTheDocument();
    expect(screen.getByText('LC-LC-OM4-3M')).toBeInTheDocument();
  });

  it('支援依類別標籤快速切換篩選', () => {
    render(
      <InboundItemSelectModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        onSelect={vi.fn()}
      />
    );

    // 切換為「耗材」
    fireEvent.click(screen.getByTestId('category-filter-耗材'));

    expect(screen.getByText('LC-LC-OM4-3M')).toBeInTheDocument();
    expect(screen.queryByText('N3K-C3548P-XL')).toBeNull();
    expect(screen.queryByText('MCX512A-ACAT')).toBeNull();
  });

  it('支援多關鍵字模糊搜尋 (廠牌、型號、規格)', () => {
    render(
      <InboundItemSelectModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        onSelect={vi.fn()}
      />
    );

    const searchInput = screen.getByTestId('item-search-input');
    // 搜尋 Cisco 3548
    fireEvent.change(searchInput, { target: { value: 'Cisco 3548' } });

    expect(screen.getByText('N3K-C3548P-XL')).toBeInTheDocument();
    expect(screen.queryByText('PowerEdge R740')).toBeNull();
    expect(screen.queryByText('MCX512A-ACAT')).toBeNull();
  });

  it('正確顯示品項的現有庫存量與單位', () => {
    render(
      <InboundItemSelectModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('12 台')).toBeInTheDocument();
    expect(screen.getByText('8 張')).toBeInTheDocument();
    expect(screen.getByText('50 條')).toBeInTheDocument();
  });

  it('點選品項時正確觸發 onSelect 回調', () => {
    const onSelect = vi.fn();
    render(
      <InboundItemSelectModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        onSelect={onSelect}
      />
    );

    // 點選 METECH 耗材
    fireEvent.click(screen.getByTestId('item-row-4'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      id: 4,
      model: 'LC-LC-OM4-3M',
      brand: 'METECH'
    }));
  });

  it('點選快速新增按鈕時觸發 onOpenQuickAdd', () => {
    const onOpenQuickAdd = vi.fn();
    render(
      <InboundItemSelectModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        onSelect={vi.fn()}
        onOpenQuickAdd={onOpenQuickAdd}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /快速新增品項/i }));
    expect(onOpenQuickAdd).toHaveBeenCalled();
  });

  it('支援勾選多筆品項、設定數量並批次加入進貨單', () => {
    const onBatchAdd = vi.fn();
    render(
      <InboundItemSelectModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        onBatchAdd={onBatchAdd}
      />
    );

    // 勾選 Cisco 並設定數量為 2
    fireEvent.click(screen.getByTestId('item-checkbox-1'));
    const qtyInput1 = screen.getByTestId('item-qty-input-1');
    fireEvent.change(qtyInput1, { target: { value: '2' } });

    // 勾選 METECH 耗材並設定數量為 15
    fireEvent.click(screen.getByTestId('item-checkbox-4'));
    const qtyInput4 = screen.getByTestId('item-qty-input-4');
    fireEvent.change(qtyInput4, { target: { value: '15' } });

    // 點擊「批次加入進貨單」
    fireEvent.click(screen.getByTestId('batch-add-confirm-btn'));

    expect(onBatchAdd).toHaveBeenCalledWith([
      expect.objectContaining({ id: 1, quantity: 2 }),
      expect.objectContaining({ id: 4, quantity: 15 })
    ]);
  });

  it('僅看低於安全庫存切換按鈕能正確過濾', () => {
    const itemsWithSafety = [
      ...mockItems,
      {
        id: 5,
        cat_name: '硬體',
        brand: 'Intel',
        model: 'X520-DA2',
        type: '網卡',
        specification: '10GbE Dual Port',
        unit: '張',
        current_stock: 1,
        safety_stock: 5 // 低於安全庫存
      }
    ];

    render(
      <InboundItemSelectModal
        isOpen={true}
        onClose={vi.fn()}
        items={itemsWithSafety}
        onSelect={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('low-stock-toggle'));

    expect(screen.getByText('X520-DA2')).toBeInTheDocument();
    expect(screen.queryByText('N3K-C3548P-XL')).toBeNull();
  });
});

describe('Inbound 頁面非採購單入庫品項選取整合測試', () => {
  beforeEach(() => {
    window.electronAPI = {
      namedQuery: vi.fn().mockImplementation((queryName) => {
        if (queryName === 'fetchInboundItemMaster') {
          return Promise.resolve({ success: true, rows: mockItems });
        }
        if (queryName === 'fetchSuppliers') {
          return Promise.resolve({ success: true, rows: [{ id: 1, name: '測試供應商' }] });
        }
        if (queryName === 'fetchPendingPurchases') {
          return Promise.resolve({ success: true, rows: [] });
        }
        if (queryName === 'countInboundOrders') {
          return Promise.resolve({ success: true, rows: [{ count: 1 }] });
        }
        return Promise.resolve({ success: true, rows: [] });
      })
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('非採購單入庫預設顯示「點擊選取庫存品項」按鈕，點擊開啟彈窗並可選取帶入', async () => {
    render(<Inbound />);

    await waitFor(() => {
      expect(screen.getByText(/點擊選取庫存品項/i)).toBeInTheDocument();
    });

    // 點選開啟彈窗按鈕
    fireEvent.click(screen.getByText(/點擊選取庫存品項/i));

    // 彈窗開啟
    await waitFor(() => {
      expect(screen.getByText('選取庫存品項 (Select Item Master)')).toBeInTheDocument();
    });

    // 選擇 Cisco 交換器
    fireEvent.click(screen.getByTestId('item-row-1'));

    // 彈窗關閉，明細格顯示已選品項卡片
    await waitFor(() => {
      expect(screen.getByText('Cisco N3K-C3548P-XL')).toBeInTheDocument();
      expect(screen.getByText(/目前庫存: 12 台/)).toBeInTheDocument();
    });

    // 測試清除品項
    const clearBtn = screen.getByTitle('清除品項');
    fireEvent.click(clearBtn);

    // 回復為點擊選取按鈕
    await waitFor(() => {
      expect(screen.getByText(/點擊選取庫存品項/i)).toBeInTheDocument();
    });
  });

  it('支援從表格底部「從品項庫挑選 (可批次勾選加入)」批次加入多項品項', async () => {
    render(<Inbound />);

    await waitFor(() => {
      expect(screen.getByTestId('open-inbound-item-modal-btn')).toBeInTheDocument();
    });

    // 點擊底部批次挑選按鈕
    fireEvent.click(screen.getByTestId('open-inbound-item-modal-btn'));

    await waitFor(() => {
      expect(screen.getByText('選取庫存品項 (Select Item Master)')).toBeInTheDocument();
    });

    // 勾選 Cisco 與 METECH
    fireEvent.click(screen.getByTestId('item-checkbox-1'));
    fireEvent.click(screen.getByTestId('item-checkbox-4'));

    // 點擊批次加入
    fireEvent.click(screen.getByTestId('batch-add-confirm-btn'));

    // 檢查明細表已包含這兩筆
    await waitFor(() => {
      expect(screen.getByText('Cisco N3K-C3548P-XL')).toBeInTheDocument();
      expect(screen.getByText('METECH LC-LC-OM4-3M')).toBeInTheDocument();
    });
  });
});
