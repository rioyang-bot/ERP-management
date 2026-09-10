import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Outbound from '../pages/Outbound';
import { RoleContext } from '../context/RoleContext';

describe('Outbound 出貨單多維度模糊搜尋與一鍵直接加入測試', () => {
  const mockActiveAssets = [
    {
      id: 1,
      sn: 'SRV-DL380-001',
      category_name: '設備',
      brand: 'HPE',
      model: 'ProLiant DL380 Gen10',
      type: '伺服器主機',
      specification: '2U Rack Server 2x Xeon Silver 4210',
      location: '台北總部 A-01',
      status: 'ACTIVE'
    },
    {
      id: 2,
      sn: 'RAM-SAM-32G-099',
      category_name: '硬體',
      brand: 'Samsung',
      model: 'M393A4K40CB2',
      type: 'RAM',
      specification: '32GB DDR4-3200 ECC Reg',
      location: '庫房 B 區 03-架',
      status: 'ACTIVE'
    },
    {
      id: 3,
      sn: 'SSD-MIC-1TB-555',
      category_name: '硬體',
      brand: 'Micron',
      model: '7450 PRO',
      type: 'SSD',
      specification: '960GB NVMe M.2 Enterprise',
      location: '庫房 B 區 02-架',
      status: 'ACTIVE'
    }
  ];

  let queriedSns = [];

  beforeEach(() => {
    vi.clearAllMocks();
    queriedSns = [];
    localStorage.clear();

    window.electronAPI = {
      namedQuery: vi.fn((query, params) => {
        if (query === 'fetchCustomers') return Promise.resolve({ success: true, rows: [] });
        if (query === 'fetchConsumablesList') return Promise.resolve({ success: true, rows: [] });
        if (query === 'fetchActiveProjects') return Promise.resolve({ success: true, rows: [] });
        if (query === 'searchActiveAssetSNs') {
          return Promise.resolve({ success: true, rows: mockActiveAssets });
        }
        if (query === 'countOutboundRequests') {
          return Promise.resolve({ success: true, rows: [{ count: '1' }] });
        }
        if (query === 'fetchAssetDetailBySN') {
          const sn = params[0];
          queriedSns.push(sn);
          const found = mockActiveAssets.find(a => a.sn === sn);
          if (found) {
            return Promise.resolve({
              success: true,
              rows: [{
                ...found,
                item_master_id: found.id + 100,
                components: []
              }]
            });
          }
          return Promise.resolve({ success: true, rows: [] });
        }
        return Promise.resolve({ success: true, rows: [] });
      })
    };
  });

  const renderComponent = () => {
    return render(
      <RoleContext.Provider value={{ authUser: { id: 1, full_name: '測試管理員', role: 'ADMIN' } }}>
        <BrowserRouter>
          <Outbound />
        </BrowserRouter>
      </RoleContext.Provider>
    );
  };

  it('硬體輸入規格/廠牌關鍵字時，能模糊搜尋出相符在庫硬體，點選直接加入出貨單', async () => {
    renderComponent();

    // 等待初始化
    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('searchActiveAssetSNs');
    });

    const hwInput = screen.getByPlaceholderText(/輸入硬體序號、廠牌、類型或規格搜尋/i);
    expect(hwInput).toBeInTheDocument();

    // 輸入規格與廠牌關鍵字：例如打 "Samsung 32G"
    fireEvent.focus(hwInput);
    fireEvent.change(hwInput, { target: { value: 'Samsung 32G' } });

    // 應該即時出現下拉選單與相符卡片
    await waitFor(() => {
      expect(screen.getByText(/相符在庫硬體/)).toBeInTheDocument();
      expect(screen.getByText('RAM-SAM-32G-099')).toBeInTheDocument();
      expect(screen.getByText(/32GB DDR4-3200 ECC Reg/)).toBeInTheDocument();
      expect(screen.getByText(/庫房 B 區 03-架/)).toBeInTheDocument();
    });

    // 點選該項目（一鍵加入）
    const suggestionItem = screen.getByText('RAM-SAM-32G-099').closest('.autocomplete-item');
    fireEvent.mouseDown(suggestionItem);

    // 驗證已直接加入出貨清單
    await waitFor(() => {
      expect(queriedSns).toContain('RAM-SAM-32G-099');
      expect(screen.getByText('已排定出貨品項 (1)')).toBeInTheDocument();
    });

    // 輸入框應自動清空
    expect(hwInput.value).toBe('');
  });

  it('設備輸入型號/規格關鍵字時，能模糊搜尋出相符在庫設備，點選直接加入出貨單', async () => {
    renderComponent();

    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('searchActiveAssetSNs');
    });

    const devInput = screen.getByPlaceholderText(/輸入設備序號、廠牌、型號或規格搜尋/i);
    expect(devInput).toBeInTheDocument();

    // 輸入型號與規格：例如打 "DL380 Gen10"
    fireEvent.focus(devInput);
    fireEvent.change(devInput, { target: { value: 'DL380 Gen10' } });

    await waitFor(() => {
      expect(screen.getByText(/相符在庫設備/)).toBeInTheDocument();
      expect(screen.getByText('SRV-DL380-001')).toBeInTheDocument();
      expect(screen.getByText(/2U Rack Server 2x Xeon/)).toBeInTheDocument();
    });

    // 點選加入設備
    const suggestionItem = screen.getByText('SRV-DL380-001').closest('.autocomplete-item');
    fireEvent.mouseDown(suggestionItem);

    await waitFor(() => {
      expect(queriedSns).toContain('SRV-DL380-001');
      expect(screen.getByText('已排定出貨品項 (1)')).toBeInTheDocument();
    });

    expect(devInput.value).toBe('');
  });

  it('若輸入關鍵字後按下 Enter 或點擊加入按鈕，且剛好只有 1 筆結果，自動直接加入該資產', async () => {
    renderComponent();

    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('searchActiveAssetSNs');
    });

    const hwInput = screen.getByPlaceholderText(/輸入硬體序號、廠牌、類型或規格搜尋/i);
    fireEvent.change(hwInput, { target: { value: 'Micron' } });

    // 點擊「加入硬體」按鈕
    const addHwBtn = screen.getByRole('button', { name: /加入硬體/i });
    fireEvent.click(addHwBtn);

    await waitFor(() => {
      expect(queriedSns).toContain('SSD-MIC-1TB-555');
      expect(screen.getByText('已排定出貨品項 (1)')).toBeInTheDocument();
    });
  });
});
