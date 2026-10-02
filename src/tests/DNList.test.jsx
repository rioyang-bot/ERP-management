import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import DNList from '../pages/DNList';
import { queries } from '../../database/queries';

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
      request_type: 'SALE',
      customer: '群益證券',
      shipping_date: '2026-08-26',
      status: 'SHIPPED',
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

  /**
   * 狀態改以頁籤區分，與借用單列表一致：
   * 「已建立 (待確認)」只有 PENDING，「已出貨 (歷史紀錄)」是其餘全部。
   */
  it('預設停在「已建立」，只看得到待確認的單', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('DN-20260828-01')).toBeInTheDocument();
    });
    expect(screen.queryByText('DN-20260828-02')).not.toBeInTheDocument();
    expect(screen.queryByText('DN-20260828-03')).not.toBeInTheDocument();
  });

  it('切到「已出貨」看得到已出貨的單', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('DN-20260828-01')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('dn-tab-history'));

    await waitFor(() => {
      expect(screen.getByText('DN-20260828-02')).toBeInTheDocument();
      expect(screen.queryByText('DN-20260828-01')).not.toBeInTheDocument();
    });
  });

  /**
   * 借用單有自己的列表與自己的流程（預計歸還日、逾期、撤銷借出、歸還入庫）。
   * 混在出貨單列表裡，同一張單在兩個地方都能被「確認」，
   * 事件紀錄還會一邊記成 OUTBOUND、一邊記成 LENT，事後對不起來。
   */
  it('查詢只取銷貨單，借用單不會進到這張清單', () => {
    expect(queries.fetchDNList).toContain("<> 'LEND'");
  });

  it('待確認以外的單都收在「已出貨」頁籤裡，不會不見', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('DN-20260828-01')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('dn-tab-history'));

    await waitFor(() => expect(screen.getByText('DN-20260828-03')).toBeInTheDocument());
  });

  it('頁籤上標出待確認的筆數', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('DN-20260828-01')).toBeInTheDocument());

    const pendingTab = screen.getByTestId('dn-tab-pending');
    expect(pendingTab.textContent).toContain('已建立 (待確認)');
    expect(pendingTab.textContent).toContain('1');
  });

  /** 分頁之後，待確認的單一樣要能上傳客戶簽收單 */
  it('「已建立」頁籤上仍然可以上傳簽收單', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('DN-20260828-01')).toBeInTheDocument());

    const pendingRow = screen.getByText('DN-20260828-01').closest('tr');
    const uploadBtn = within(pendingRow).getByTitle(/上傳客戶簽收單據/);
    expect(uploadBtn).toBeInTheDocument();

    fireEvent.click(uploadBtn);
    await waitFor(() => {
      expect(screen.getByText(/點此上傳客戶已簽收的出貨單/)).toBeInTheDocument();
    });
  });

  it('不再有與頁籤重複的狀態下拉', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('DN-20260828-01')).toBeInTheDocument());

    expect(screen.queryByRole('option', { name: '全部狀態' })).not.toBeInTheDocument();
  });

  it('表格與明細檢視內應提供客戶已簽收單據之上傳、查驗與刪除功能', async () => {
    renderComponent();

    await waitFor(() => expect(screen.getByText('DN-20260828-01')).toBeInTheDocument());
    // 已簽收的那張是已出貨的單，在歷史頁籤裡
    fireEvent.click(screen.getByTestId('dn-tab-history'));
    await waitFor(() => {
      expect(screen.getByText('DN-20260828-02')).toBeInTheDocument();
    });

    // 簽收單據維持可上傳：兩個頁籤都看得到這一欄
    expect(screen.getByText('已簽收')).toBeInTheDocument();
    expect(screen.getAllByText('未上傳').length).toBe(1);

    // 點擊「檢視」開啟凱基證券 (有簽收單) 的明細彈窗
    const kgiRow = screen.getByText('DN-20260828-02').closest('tr');
    const viewButton = within(kgiRow).getByTitle('查看詳情');
    fireEvent.click(viewButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /出貨單明細：/ })).toBeInTheDocument();
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

    // PENDING 單據應有刪除按鈕
    const pendingRow = screen.getByText('DN-20260828-01').closest('tr');
    expect(within(pendingRow).getByRole('button', { name: /刪除/ })).toBeInTheDocument();

    // 已出貨的單不可刪除（它們在歷史頁籤裡）
    fireEvent.click(screen.getByTestId('dn-tab-history'));
    await waitFor(() => expect(screen.getByText('DN-20260828-02')).toBeInTheDocument());

    const shippedRow = screen.getByText('DN-20260828-02').closest('tr');
    const otherShipped = screen.getByText('DN-20260828-03').closest('tr');
    expect(within(shippedRow).queryByRole('button', { name: /刪除/ })).not.toBeInTheDocument();
    expect(within(otherShipped).queryByRole('button', { name: /刪除/ })).not.toBeInTheDocument();
  });

  it('列表上不再標示借用單，因為這裡不會有借用單', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('DN-20260828-01')).toBeInTheDocument());
    expect(screen.queryByText('借用單')).not.toBeInTheDocument();
  });
});
