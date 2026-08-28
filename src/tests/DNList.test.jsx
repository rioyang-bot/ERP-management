import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
      creator_name: 'Admin'
    },
    {
      id: 2,
      request_no: 'DN-20260828-02',
      request_type: 'SALE',
      customer: '凱基證券',
      shipping_date: '2026-08-27',
      status: 'SHIPPED',
      item_count: 5,
      creator_name: 'User1'
    },
    {
      id: 3,
      request_no: 'DN-20260828-03',
      request_type: 'LEND',
      customer: '群益證券',
      shipping_date: '2026-08-26',
      status: 'RETURNED',
      item_count: 1,
      creator_name: 'User2'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      namedQuery: vi.fn((query) => {
        if (query === 'fetchDNList') {
          return Promise.resolve({ success: true, rows: mockDNRecords });
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
});
