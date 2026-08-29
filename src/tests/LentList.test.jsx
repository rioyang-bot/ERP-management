import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LentList from '../pages/LentList';
import LendOrderRegistrationModal from '../components/LendOrderRegistrationModal';
import Outbound from '../pages/Outbound';
import { MemoryRouter } from 'react-router-dom';

describe('設備/硬體借用清單 (LentList) 流程、簽收單上傳與新增借用單測試', () => {
  const alertMock = vi.fn();
  const confirmMock = vi.fn();
  const saveFileSpy = vi.fn();

  const mockRecords = [
    {
      id: 1,
      request_no: 'DN-20260829-01',
      customer: '富邦綜合證券',
      location: '台北市仁愛路四段 169 號',
      shipping_date: '2026-08-29',
      expected_return_date: '2026-09-05',
      status: 'PENDING',
      request_type: 'LEND',
      creator_name: 'Admin',
      signed_doc_url: null,
      signed_doc_name: null
    },
    {
      id: 2,
      request_no: 'DN-20260828-02',
      customer: '國泰金控',
      location: '台北市松仁路 7 號',
      shipping_date: '2026-08-28',
      expected_return_date: '2026-09-04',
      status: 'SHIPPED',
      request_type: 'LEND',
      creator_name: 'Admin',
      signed_doc_url: 'signed_fubon-1724912000.pdf',
      signed_doc_name: '富邦簽收單據.pdf'
    },
    {
      id: 3,
      request_no: 'DN-20260820-03',
      customer: '台積電',
      location: '新竹科學園區',
      shipping_date: '2026-08-20',
      expected_return_date: '2026-08-27',
      actual_return_date: '2026-08-26',
      status: 'RETURNED',
      request_type: 'LEND',
      creator_name: 'Admin',
      signed_doc_url: null,
      signed_doc_name: null
    }
  ];

  const mockCustomers = [
    { id: 1, name: '富邦綜合證券', contact: '張經理', phone: '02-12345678', address: '台北市仁愛路四段 169 號' },
    { id: 2, name: '國泰金控', contact: '李協理', phone: '02-87654321', address: '台北市松仁路 7 號' }
  ];

  const mockItems = [
    {
      brand: 'Supermicro',
      model: 'SYS-1029P-WTR',
      sn: 'SN123456',
      quantity: 1,
      category_name: '設備',
      specification: 'Dual Xeon Silver'
    }
  ];

  const mockConsumables = [
    {
      item_id: 10,
      brand: 'Cisco',
      model: 'SFP-10G-SR',
      type: '光纖模組',
      specification: '10G Multimode',
      stock_qty: 25
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = alertMock;
    window.confirm = confirmMock.mockReturnValue(true);
    saveFileSpy.mockClear();

    window.electronAPI.saveFile = saveFileSpy.mockResolvedValue({ success: true, fileName: 'uploaded-123456.jpg' });

    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      if (query === 'migrateOutboundSignedDoc') {
        return Promise.resolve({ success: true });
      }
      if (query === 'fetchLentRequests') {
        return Promise.resolve({ success: true, rows: mockRecords });
      }
      if (query === 'fetchCustomers') {
        return Promise.resolve({ success: true, rows: mockCustomers });
      }
      if (query === 'fetchConsumablesList') {
        return Promise.resolve({ success: true, rows: mockConsumables });
      }
      if (query === 'searchActiveAssetSNs') {
        return Promise.resolve({ success: true, rows: [{ sn: 'SN123456', brand: 'Supermicro', model: 'SYS-1029P-WTR', category_name: '設備' }] });
      }
      if (query === 'fetchActiveProjects') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'countOutboundRequests') {
        return Promise.resolve({ success: true, rows: [{ count: 1 }] });
      }
      if (query === 'insertOutboundRequest') {
        return Promise.resolve({ success: true, rows: [{ id: 99 }] });
      }
      if (query === 'insertOutboundItem' || query === 'insertLendOutboundItem') {
        return Promise.resolve({ success: true });
      }
      if (query === 'migrateOutboundItemPurpose') {
        return Promise.resolve({ success: true });
      }
      if (query === 'fetchDNItems') {
        return Promise.resolve({ success: true, rows: mockItems });
      }
      if (query === 'checkAssetActive') {
        return Promise.resolve({ success: true, rows: [{ status: 'ACTIVE' }] });
      }
      if (query === 'updateAssetStatusAndLocationBySn' || query === 'updateOutboundRequestStatus' || query === 'updateOutboundSignedDoc' || query === 'removeOutboundSignedDoc') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  });

  it('應正確呈現「已建立 (待借出)」、「借出中 (待歸還)」與「已結案」三組頁籤與對應單據', async () => {
    render(<LentList />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /已建立 \(待借出\)/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /借出中 \(待歸還\)/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /已結案 \(歷史紀錄\)/ })).toBeInTheDocument();
    });

    expect(screen.getByText('DN-20260829-01')).toBeInTheDocument();
    expect(screen.getByText('富邦綜合證券')).toBeInTheDocument();
    expect(screen.getByText('待出貨 (已建立)')).toBeInTheDocument();
  });

  it('借用單建檔彈窗 (LendOrderRegistrationModal) 應能正確載入並支援建立借用單', async () => {
    const user = userEvent.setup();
    const successSpy = vi.fn();
    const { container } = render(
      <LendOrderRegistrationModal isOpen={true} onClose={() => {}} onSuccess={successSpy} />
    );

    // 驗證彈窗標題
    await waitFor(() => {
      expect(screen.getByText(/借用單建檔/)).toBeInTheDocument();
      expect(screen.getByText('借用單基本資訊')).toBeInTheDocument();
      expect(screen.getByText('預計歸還日')).toBeInTheDocument();
    });

    // 選擇客戶 (第一個 select)
    const selects = container.querySelectorAll('select');
    const customerSelect = selects[0];
    await user.selectOptions(customerSelect, '1');

    // 驗證耗材初始為 (未選擇) 狀態且顯示引導提示
    expect(screen.getByText(/請先選擇廠牌 \/ 類型 \/ 型號/)).toBeInTheDocument();

    // 輸入耗材搜尋關鍵字進行篩選
    const searchInput = screen.getByPlaceholderText('搜尋耗材...');
    await user.type(searchInput, 'SFP');

    // 驗證標頭用途欄位
    expect(screen.getByText('借用用途 (預設用途)')).toBeInTheDocument();

    // 點選耗材加入 (點選耗材按鈕卡片)
    await waitFor(() => {
      expect(container.querySelector('.csm-btn')).toBeInTheDocument();
    });
    const csmBtn = container.querySelector('.csm-btn');
    await user.click(csmBtn);

    await waitFor(() => {
      expect(screen.getByText(/已排定借出品項 \(1\)/)).toBeInTheDocument();
    });

    // 驗證並修改品項列中的「用途」輸入框
    const purposeInput = container.querySelector('.item-purpose-input');
    expect(purposeInput).toBeInTheDocument();
    expect(purposeInput.value).toBe('運作測試');
    await user.clear(purposeInput);
    await user.type(purposeInput, 'POC 概念驗證');

    // 點選「建立借用單」
    const submitBtn = screen.getByRole('button', { name: /建立借用單/ });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('借用單 [DN-'));
      expect(successSpy).toHaveBeenCalledWith(
        expect.objectContaining({ request_type: 'LEND' }),
        expect.arrayContaining([
          expect.objectContaining({ purpose: 'POC 概念驗證' })
        ])
      );
    });
  });

  it('出貨建檔 (Outbound.jsx) 應固定為一般出貨且不再提供單據類型選擇器', async () => {
    render(
      <MemoryRouter>
        <Outbound />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('出貨單建檔 (Delivery Note Registration)')).toBeInTheDocument();
    });

    // 驗證不再有「單據類型」選單與「借用單」選項
    expect(screen.queryByText('單據類型')).not.toBeInTheDocument();
    expect(screen.queryByText('借用單 (LEND)')).not.toBeInTheDocument();
  });

  it('借用列表表格應具備標準欄位與操作按鈕（檢視、借貨單、確認借出、刪除、未上傳簽收單）', async () => {
    const user = userEvent.setup();
    render(<LentList />);

    await waitFor(() => {
      expect(screen.getByText('借用單號')).toBeInTheDocument();
      expect(screen.getByText('借出日期')).toBeInTheDocument();
      expect(screen.getByText('客戶/對象')).toBeInTheDocument();
      expect(screen.getByText('預計歸還日')).toBeInTheDocument();
      expect(screen.getByText('簽收單據')).toBeInTheDocument();
      expect(screen.getByText('操作')).toBeInTheDocument();
    });

    // 驗證待借出單據的操作按鈕
    expect(screen.getByRole('button', { name: /檢視/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /借貨單/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /確認借出/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /刪除/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /未上傳/ })).toBeInTheDocument();

    // 點選刪除按鈕觸發刪除流程
    const deleteBtn = screen.getByRole('button', { name: /刪除/ });
    await user.click(deleteBtn);

    expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('deleteOutboundRequest', [1]);
    expect(alertMock).toHaveBeenCalledWith('刪除成功');

    // 切換至「借出中 (待歸還)」頁籤，驗證不顯示刪除按鈕
    const shippedTab = screen.getByRole('button', { name: /借出中 \(待歸還\)/ });
    await user.click(shippedTab);
    await waitFor(() => {
      expect(screen.getByText('DN-20260828-02')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /刪除/ })).not.toBeInTheDocument();

    // 切換至「已結案 (歷史紀錄)」頁籤，驗證不顯示刪除按鈕
    const returnedTab = screen.getByRole('button', { name: /已結案 \(歷史紀錄\)/ });
    await user.click(returnedTab);
    await waitFor(() => {
      expect(screen.getByText('DN-20260820-03')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /刪除/ })).not.toBeInTheDocument();
  });
});
