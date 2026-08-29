import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Overview from '../pages/Overview';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('營運總覽 (Overview) 頁面功能測試', () => {
  const mockStats = {
    pending_purchases_count: 2,
    draft_inbounds_count: 1,
    pending_outbounds_count: 1,
    active_lents_count: 2,
    overdue_lents_count: 1,
    low_stock_consumables_count: 2,
    active_projects_count: 3
  };

  const mockPurchases = [
    {
      id: 101,
      order_no: 'PO-20260829-01',
      partner_name: '台灣戴爾',
      item_type: '伺服器',
      brand: 'Dell',
      model: 'PowerEdge R750',
      specification: '2U Rack Server',
      quantity: 5,
      received_quantity: 0,
      status: 'ORDERED',
      created_at: '2026-08-29T08:00:00Z'
    },
    {
      id: 102,
      order_no: 'PO-20260829-02',
      partner_name: '聯想電腦',
      item_type: '筆記型電腦',
      brand: 'Lenovo',
      model: 'ThinkPad X1',
      specification: 'i7 32G 1TB',
      quantity: 10,
      received_quantity: 4,
      status: 'PARTIAL',
      created_at: '2026-08-28T08:00:00Z'
    }
  ];

  const mockInbounds = [
    {
      id: 201,
      order_no: 'IN-20260829-01',
      partner_name: '台灣戴爾',
      invoice_no: 'INV-88889999',
      order_date: '2026-08-29',
      status: 'DRAFT',
      item_count: 2,
      total_quantity: 5
    }
  ];

  const mockOutbounds = [
    {
      id: 301,
      request_no: 'DN-20260829-01',
      request_type: 'SALE',
      customer: '元大證券',
      location: '台北總部機房',
      shipping_date: '2026-08-29',
      status: 'PENDING',
      item_count: 2,
      total_quantity: 2
    }
  ];

  const mockLents = [
    {
      id: 401,
      request_no: 'LENT-20260820-01',
      request_type: 'LEND',
      customer: '國泰金控',
      shipping_date: '2026-08-20',
      expected_return_date: '2026-08-25',
      status: 'SHIPPED',
      item_count: 1,
      item_summary: 'Dell R750',
      is_overdue: true
    },
    {
      id: 402,
      request_no: 'LENT-20260828-01',
      request_type: 'LEND',
      customer: '富邦銀行',
      shipping_date: '2026-08-28',
      expected_return_date: '2026-09-10',
      status: 'SHIPPED',
      item_count: 2,
      item_summary: 'Cisco Switch',
      is_overdue: false
    }
  ];

  const mockConsumables = [
    {
      id: 501,
      brand: 'Double A',
      type: '紙張',
      model: 'A4 80gsm',
      specification: 'A4 影印紙 500張/包',
      unit: '包',
      stock_qty: 0,
      lab_qty: 0,
      total_qty: 0,
      safety_stock: 10,
      shortage_qty: 10
    },
    {
      id: 502,
      brand: '3M',
      type: '清潔用品',
      model: '魔布',
      specification: '超細纖維擦拭布',
      unit: '條',
      stock_qty: 2,
      lab_qty: 1,
      total_qty: 3,
      safety_stock: 5,
      shortage_qty: 2
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();

    window.electronAPI = {
      namedQuery: vi.fn((query) => {
        if (query === 'fetchOverviewStats') {
          return Promise.resolve({ success: true, rows: [mockStats] });
        }
        if (query === 'fetchOverviewPendingPurchases') {
          return Promise.resolve({ success: true, rows: mockPurchases });
        }
        if (query === 'fetchOverviewDraftInbounds') {
          return Promise.resolve({ success: true, rows: mockInbounds });
        }
        if (query === 'fetchOverviewPendingOutbounds') {
          return Promise.resolve({ success: true, rows: mockOutbounds });
        }
        if (query === 'fetchOverviewActiveLents') {
          return Promise.resolve({ success: true, rows: mockLents });
        }
        if (query === 'fetchOverviewLowStockConsumables') {
          return Promise.resolve({ success: true, rows: mockConsumables });
        }
        return Promise.resolve({ success: true, rows: [] });
      }),
      authLogin: vi.fn(),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn()
    };
  });

  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <Overview />
      </BrowserRouter>
    );
  };

  it('應正確呈現營運總覽標題與頂部 KPI 數據統計卡片', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('營運總覽 (Operations Overview)')).toBeInTheDocument();
    });

    // 檢查 KPI 統計卡片數值與標籤
    expect(screen.getByText('待交貨採購單')).toBeInTheDocument();
    expect(screen.getByText('草稿進貨單')).toBeInTheDocument();
    expect(screen.getByText('待確認出貨單')).toBeInTheDocument();
    expect(screen.getByText('借出中借用單')).toBeInTheDocument();
    expect(screen.getByText('低於安全水位耗材')).toBeInTheDocument();
    expect(screen.getByText('進行中專案')).toBeInTheDocument();

    // 檢查數值與逾期提示
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getByText('1 筆逾期')).toBeInTheDocument();
  });

  it('應正確列出未完成單據並支援頁籤切換與搜尋', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('PO-20260829-01')).toBeInTheDocument();
      expect(screen.getByText('IN-20260829-01')).toBeInTheDocument();
      expect(screen.getByText('DN-20260829-01')).toBeInTheDocument();
      expect(screen.getByText('LENT-20260820-01')).toBeInTheDocument();
    });

    // 切換至「採購單」頁籤
    const poTabBtn = screen.getByRole('button', { name: /採購單/i });
    fireEvent.click(poTabBtn);

    // 採購單仍應存在，進貨單應被過濾
    expect(screen.getByText('PO-20260829-01')).toBeInTheDocument();
    expect(screen.queryByText('IN-20260829-01')).not.toBeInTheDocument();

    // 測試搜尋功能
    const searchInput = screen.getByPlaceholderText('搜尋單號、夥伴...');
    await userEvent.type(searchInput, 'ThinkPad');
    expect(screen.getByText('PO-20260829-02')).toBeInTheDocument();
    expect(screen.queryByText('PO-20260829-01')).not.toBeInTheDocument();
  });

  it('應正確列出低於安全庫存之耗材並計算缺口數量與標籤', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Double A A4 80gsm')).toBeInTheDocument();
      expect(screen.getByText('3M 魔布')).toBeInTheDocument();
    });

    // 檢查缺口數量
    expect(screen.getByText('-10 包')).toBeInTheDocument();
    expect(screen.getByText('-2 條')).toBeInTheDocument();

    // 檢查狀態標籤
    expect(screen.getByText('🚨 庫存歸零')).toBeInTheDocument();
    expect(screen.getByText('⚠️ 低於安全水位')).toBeInTheDocument();
  });

  it('點選未完成單據或一鍵採購按鈕應觸發導向對應路由', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('PO-20260829-01')).toBeInTheDocument();
    });

    // 點擊採購單項目
    const poDocItem = screen.getByText('PO-20260829-01').closest('.overview-doc-item');
    fireEvent.click(poDocItem);
    expect(mockNavigate).toHaveBeenCalledWith('/procurement-list');

    // 點擊「一鍵採購」按鈕
    const quickPurchaseBtns = screen.getAllByRole('button', { name: /一鍵採購/i });
    fireEvent.click(quickPurchaseBtns[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/purchasing', expect.objectContaining({
      state: expect.objectContaining({
        prefillItem: expect.objectContaining({
          brand: 'Double A',
          model: 'A4 80gsm',
          quantity: 10
        })
      })
    }));
  });

  it('當無待辦單據與低水位耗材時應呈現友善的健康充足空狀態', async () => {
    window.electronAPI.namedQuery = vi.fn((query) => {
      if (query === 'fetchOverviewStats') {
        return Promise.resolve({
          success: true,
          rows: [{
            pending_purchases_count: 0,
            draft_inbounds_count: 0,
            pending_outbounds_count: 0,
            active_lents_count: 0,
            overdue_lents_count: 0,
            low_stock_consumables_count: 0,
            active_projects_count: 0
          }]
        });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('目前沒有待辦的未完成單據')).toBeInTheDocument();
      expect(screen.getByText('耗材庫存狀態健康充足')).toBeInTheDocument();
    });
  });
});
