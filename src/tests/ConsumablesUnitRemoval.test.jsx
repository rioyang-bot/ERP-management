import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Consumables from '../pages/Consumables';
import ConsumableList from '../pages/ConsumableList';

describe('耗材模組移除單位 (Unit Removal) 測試', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);

    window.electronAPI = {
      namedQuery: vi.fn((query, params) => {
        if (query === 'fetchRecentConsumables') {
          return Promise.resolve({
            success: true,
            rows: [
              {
                id: 1,
                brand: 'Cisco',
                type: '線材',
                model: 'SFP-10G-SR',
                specification: '10G 光纖跳線 3M',
                safety_stock: 10,
                stock_qty: 25,
                unit: '個'
              }
            ]
          });
        }
        if (query === 'fetchConsumableBrands') {
          return Promise.resolve({
            success: true,
            rows: [{ id: 1, name: 'Cisco' }]
          });
        }
        if (query === 'fetchConsumableTypesByBrand') {
          return Promise.resolve({
            success: true,
            rows: [{ name: '線材' }]
          });
        }
        if (query === 'fetchConsumableModelsByBrandType') {
          return Promise.resolve({
            success: true,
            rows: [{ name: 'SFP-10G-SR' }]
          });
        }
        if (query === 'checkDuplicateConsumable') {
          return Promise.resolve({ success: true, rows: [] });
        }
        if (query === 'insertConsumableMaster') {
          return Promise.resolve({ success: true });
        }
        if (query === 'fetchConsumablesList') {
          return Promise.resolve({
            success: true,
            rows: [
              {
                id: 1,
                item_id: 1,
                brand: 'Cisco',
                type: '線材',
                model: 'SFP-10G-SR',
                specification: '10G 光纖跳線 3M',
                stock_qty: 25,
                lab_qty: 5,
                safety_stock: 10,
                unit: '個'
              }
            ]
          });
        }
        return Promise.resolve({ success: true, rows: [] });
      }),
      logAuditAction: vi.fn()
    };
  });

  it('耗材建檔表單應不包含「單位」選單與管理按鈕，且能正常填寫建檔', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Consumables />
      </MemoryRouter>
    );

    // 1. 等待建檔表單載入
    await waitFor(() => {
      expect(screen.getByText(/耗材建檔/)).toBeInTheDocument();
    });

    // 2. 驗證無「單位」標籤
    expect(screen.queryByText(/單位 \(Unit\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^單位$/)).not.toBeInTheDocument();

    // 3. 驗證備註 (選填)、初始庫存數量、安全庫存等欄位存在
    expect(screen.getByText(/備註 \(Remarks\)/)).toBeInTheDocument();
    expect(screen.getByText(/初始庫存數量/)).toBeInTheDocument();
    expect(screen.getByText('安全庫存 (Safety Stock)')).toBeInTheDocument();

    // 4. 輸入規格/備註並點選儲存耗材資料
    const specInput = screen.getByPlaceholderText('請輸入備註說明 (選填)...');
    await user.type(specInput, '10G 光纖跳線 3M');

    const saveBtn = screen.getByRole('button', { name: /儲存耗材資料/ });
    await user.click(saveBtn);

    // 5. 驗證 insertConsumableMaster 被調用，且傳遞了規格/備註與預設單位 '個'
    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'insertConsumableMaster',
        expect.arrayContaining(['10G 光纖跳線 3M', '個'])
      );
    });
  });

  it('耗材建檔未填寫型號/規格時應彈出警示，且未填寫備註時仍可正常儲存', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Consumables />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/耗材建檔/)).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /儲存耗材資料/ });
    
    // 1. 手動將型號切為空選項，點擊儲存應提示必填
    const modelSelect = await screen.findByDisplayValue('SFP-10G-SR');
    await user.selectOptions(modelSelect, '');
    await user.click(saveBtn);
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('廠牌、類型、型號/規格為必填'));
    expect(window.electronAPI.namedQuery).not.toHaveBeenCalledWith('insertConsumableMaster', expect.anything());

    // 2. 切換回有效型號，但不輸入備註（留空），應能成功儲存
    await user.selectOptions(modelSelect, 'SFP-10G-SR');
    await user.click(saveBtn);

    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'insertConsumableMaster',
        expect.arrayContaining(['', '個'])
      );
    });
  });

  it('耗材清單表格與列表應呈現「備註」欄位標題，且不呈現「單位」欄位標題與資料格', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ConsumableList />
      </MemoryRouter>
    );

    // 1. 展開全部清單
    await waitFor(() => {
      expect(screen.getByText(/耗材列表/)).toBeInTheDocument();
    });

    const showAllBtn = screen.getByRole('button', { name: /顯示全部耗材清單/ });
    await user.click(showAllBtn);

    // 2. 驗證表格標題包含「備註」，且無「單位」與「規格內容」
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: '備註' })).toBeInTheDocument();
      expect(screen.getByText('Stock')).toBeInTheDocument();
      expect(screen.getByText('LAB')).toBeInTheDocument();
      expect(screen.getByText('Total')).toBeInTheDocument();
    });

    expect(screen.queryByRole('columnheader', { name: '規格內容' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '單位' })).not.toBeInTheDocument();
  });

  it('耗材清單表格應將「廠牌」、「類型」、「型號/規格」、「備註」獨立分欄，清晰呈現類型徽章與型號識別碼', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ConsumableList />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/耗材列表/)).toBeInTheDocument();
    });

    const showAllBtn = screen.getByRole('button', { name: /顯示全部耗材清單/ });
    await user.click(showAllBtn);

    await waitFor(() => {
      // 驗證獨立的表頭
      expect(screen.getByRole('columnheader', { name: '廠牌' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: '類型' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: '型號/規格' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: '備註' })).toBeInTheDocument();
      // 驗證不再是黏在一起的合併表頭
      expect(screen.queryByText('廠牌 / 型號 / 類型')).not.toBeInTheDocument();
    });

    // 驗證表格內資料獨立分格呈現
    expect(screen.getAllByText('Cisco').length).toBeGreaterThan(0);
    expect(screen.getAllByText('線材').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SFP-10G-SR').length).toBeGreaterThan(0);
  });
});
