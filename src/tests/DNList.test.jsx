import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import DNList from '../pages/DNList';

describe('DNList 出貨單列表狀態查詢與搜尋測試', () => {
  const mockDNRecords = [
    {
      id: 1,
      request_no: 'DN-20260828-01',
      request_type: 'SALE',
      customer: '元大證券',
      shipping_date: '2026-08-28',
      status: 'PENDING',
      item_count: 2,
      creator_name: 'Admin',
      signed_doc_url: null,
      signed_doc_name: null
    },
    {
      id: 2,
      request_no: 'DN-20260828-02',
      request_type: 'SALE',
      customer: '凱基證券',
      shipping_date: '2026-08-27',
      status: 'SHIPPED',
      item_count: 5,
      creator_name: 'User1',
      signed_doc_url: 'signed_kgi-1724912000.pdf',
      signed_doc_name: '凱基簽收單據.pdf'
    },
    {
      id: 3,
      request_no: 'DN-20260828-03',
      request_type: 'LEND',
      customer: '群益證券',
      shipping_date: '2026-08-26',
      status: 'RETURNED',
      item_count: 1,
      creator_name: 'User2',
      signed_doc_url: null,
      signed_doc_name: null
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      namedQuery: vi.fn((query) => {
        if (query === 'fetchDNList') {
          return Promise.resolve({ success: true, rows: mockDNRecords });
        }
        if (query === 'fetchDNItems') {
          return Promise.resolve({ success: true, rows: [
            { id: 101, type: 'HARDWARE', brand: 'Supermicro', model: 'SYS-1029P', specification: '1U Server', sn: 'SN12345', quantity: 1, location: '台北' }
          ] });
        }
        if (query === 'migrateOutboundSignedDoc' || query === 'updateOutboundSignedDoc' || query === 'removeOutboundSignedDoc') {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true, rows: [] });
      }),
      authLogin: vi.fn(),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn().mockResolvedValue({ success: true, fileName: 'saved_signed_doc.pdf' })
    };
  });

  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <DNList />
      </BrowserRouter>
    );
  };

  it('應正確呈現搜尋列中新增的「狀態查詢欄位」以及所有狀態選項', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('DN-20260828-01')).toBeInTheDocument();
    });

    // 驗證狀態查詢下拉選單存在並包含所有預期選項
    const selects = screen.getAllByRole('combobox');
    const statusSelect = selects[1];
    expect(statusSelect).toBeInTheDocument();
    
    expect(screen.getByRole('option', { name: '全部狀態' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '已建立 (待出貨)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '已出貨' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '已歸還' })).toBeInTheDocument();
  });

  it('切換狀態篩選為「已出貨」時，應只顯示狀態為 SHIPPED 的出貨單', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('DN-20260828-01')).toBeInTheDocument();
      expect(screen.getByText('DN-20260828-02')).toBeInTheDocument();
      expect(screen.getByText('DN-20260828-03')).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    const statusSelect = selects[1]; // 第二個 select 為狀態篩選

    fireEvent.change(statusSelect, { target: { value: 'SHIPPED' } });

    await waitFor(() => {
      expect(screen.queryByText('DN-20260828-01')).not.toBeInTheDocument();
      expect(screen.getByText('DN-20260828-02')).toBeInTheDocument();
      expect(screen.queryByText('DN-20260828-03')).not.toBeInTheDocument();
    });
  });

  it('切換狀態篩選為「已建立 (待出貨)」時，應只顯示狀態為 PENDING 的出貨單', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('DN-20260828-01')).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    const statusSelect = selects[1];

    fireEvent.change(statusSelect, { target: { value: 'PENDING' } });

    await waitFor(() => {
      expect(screen.getByText('DN-20260828-01')).toBeInTheDocument();
      expect(screen.queryByText('DN-20260828-02')).not.toBeInTheDocument();
      expect(screen.queryByText('DN-20260828-03')).not.toBeInTheDocument();
    });
  });

  it('切換狀態篩選為「已歸還」時，應只顯示狀態為 RETURNED 的出貨單', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('DN-20260828-01')).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    const statusSelect = selects[1];

    fireEvent.change(statusSelect, { target: { value: 'RETURNED' } });

    await waitFor(() => {
      expect(screen.queryByText('DN-20260828-01')).not.toBeInTheDocument();
      expect(screen.queryByText('DN-20260828-02')).not.toBeInTheDocument();
      expect(screen.getByText('DN-20260828-03')).toBeInTheDocument();
    });
  });

  it('表格與明細檢視內應提供客戶已簽收單據之上傳、查驗與刪除功能', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('DN-20260828-01')).toBeInTheDocument();
      expect(screen.getByText('DN-20260828-02')).toBeInTheDocument();
    });

    // 檢查表格中已簽收與未上傳標籤
    expect(screen.getByText('已簽收')).toBeInTheDocument();
    expect(screen.getAllByText('未上傳').length).toBe(2);

    // 點擊「檢視」開啟凱基證券 (有簽收單) 的明細彈窗
    const kgiRow = screen.getByText('DN-20260828-02').closest('tr');
    const viewButton = within(kgiRow).getByTitle('查看詳情');
    fireEvent.click(viewButton);

    await waitFor(() => {
      expect(screen.getByText('出貨單明細')).toBeInTheDocument();
      expect(screen.getByText(/客戶已簽收單據/)).toBeInTheDocument();
      expect(screen.getByText('凱基簽收單據.pdf')).toBeInTheDocument();
      expect(screen.getByText(/開啟 \/ 下載查驗/)).toBeInTheDocument();
      expect(screen.getByText('刪除檔案')).toBeInTheDocument();
    });
  });

  it('防呆機制：僅待出貨 (PENDING) 狀態顯示刪除按鈕，已出貨 (SHIPPED) 與已結案 (RETURNED) 應隱藏刪除按鈕', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('DN-20260828-01')).toBeInTheDocument();
    });

    const pendingRow = screen.getByText('DN-20260828-01').closest('tr');
    const shippedRow = screen.getByText('DN-20260828-02').closest('tr');
    const returnedRow = screen.getByText('DN-20260828-03').closest('tr');

    // PENDING 單據應有刪除按鈕
    expect(within(pendingRow).getByRole('button', { name: /刪除/ })).toBeInTheDocument();

    // SHIPPED 與 RETURNED 單據應不可刪除
    expect(within(shippedRow).queryByRole('button', { name: /刪除/ })).not.toBeInTheDocument();
    expect(within(returnedRow).queryByRole('button', { name: /刪除/ })).not.toBeInTheDocument();
  });
});
