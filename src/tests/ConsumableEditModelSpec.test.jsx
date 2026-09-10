import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import ConsumableList from '../pages/ConsumableList';
import { RoleContext } from '../context/RoleContext';

const mockConsumables = [
  {
    id: 88,
    category_id: 3,
    cat_name: '耗材',
    brand: 'METECH',
    type: '光纖線',
    model: 'LC-LC-OM4-3M',
    specification: '多模雙芯光纖跳線 3米',
    unit: '條',
    stock_qty: 50,
    lab_qty: 10,
    safety_stock: 20
  }
];

describe('ConsumableList 耗材型號與規格編輯功能測試', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();

    window.electronAPI = {
      namedQuery: vi.fn().mockImplementation((queryName, params) => {
        if (queryName === 'fetchConsumablesList' || queryName === 'fetchConsumablesListByType') {
          return Promise.resolve({ success: true, rows: mockConsumables });
        }
        if (queryName === 'updateConsumableMaster') {
          return Promise.resolve({ success: true, rows: [] });
        }
        if (queryName === 'fetchAllAssetsForSelect') {
          return Promise.resolve({ success: true, rows: [] });
        }
        return Promise.resolve({ success: true, rows: [] });
      })
    };
  });

  it('列表點選不應開啟彈窗，必須從操作>編輯詳細資訊開啟，且廠牌與類型鎖定不可動、型號與規格可修改並儲存', async () => {
    const user = userEvent.setup();

    render(
      <RoleContext.Provider value={{ authUser: { full_name: '管理者' }, role: 'ADMIN' }}>
        <BrowserRouter>
          <ConsumableList />
        </BrowserRouter>
      </RoleContext.Provider>
    );

    // 1. 等待載入完成，並點擊展開清單
    await waitFor(() => {
      expect(screen.getByText(/顯示全部耗材清單/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/顯示全部耗材清單/));

    // 2. 檢查表格中呈現原本的型號與規格
    await waitFor(() => {
      expect(screen.getByText('LC-LC-OM4-3M')).toBeInTheDocument();
      expect(screen.getByText('多模雙芯光纖跳線 3米')).toBeInTheDocument();
    });

    // 3. 驗證：點擊列表上的型號與規格文字，不應該開啟編輯彈窗
    fireEvent.click(screen.getByText('LC-LC-OM4-3M'));
    expect(screen.queryByText('編輯耗材型號與規格')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('多模雙芯光纖跳線 3米'));
    expect(screen.queryByText('編輯耗材型號與規格')).not.toBeInTheDocument();

    // 4. 從右側操作選單 (···) > 點擊「編輯詳細資訊」
    const actionBtn = screen.getByTestId('consumable-action-menu-btn');
    fireEvent.click(actionBtn);

    await waitFor(() => {
      expect(screen.getByTestId('consumable-edit-detail-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('consumable-edit-detail-btn'));

    // 5. 驗證彈窗成功開啟
    await waitFor(() => {
      expect(screen.getByText('編輯耗材型號與規格')).toBeInTheDocument();
    });

    // 6. 驗證廠牌與類型為唯讀/鎖定狀態 (不可動)
    const brandInput = screen.getByDisplayValue('METECH');
    const typeInput = screen.getByDisplayValue('光纖線');
    expect(brandInput).toBeDisabled();
    expect(typeInput).toBeDisabled();

    // 7. 檢查型號與規格輸入框皆為可編輯（非 disabled）
    const modelInput = screen.getByTestId('edit-consumable-model-input');
    const specInput = screen.getByTestId('edit-consumable-spec-input');

    expect(modelInput).not.toBeDisabled();
    expect(specInput).not.toBeDisabled();
    expect(modelInput.value).toBe('LC-LC-OM4-3M');
    expect(specInput.value).toBe('多模雙芯光纖跳線 3米');

    // 8. 手動修改型號與規格
    await user.clear(modelInput);
    await user.type(modelInput, 'LC-LC-OM4-5M');

    await user.clear(specInput);
    await user.type(specInput, '多模雙芯光纖跳線 5米');

    // 9. 點擊儲存變更按鈕
    const saveBtn = screen.getByTestId('save-edit-consumable-btn');
    fireEvent.click(saveBtn);

    // 10. 驗證正確呼叫 updateConsumableMaster 傳入鎖定的廠牌/類型與修改後的型號/規格
    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'updateConsumableMaster',
        [
          'METECH',
          '光纖線',
          'LC-LC-OM4-5M',
          '多模雙芯光纖跳線 5米',
          '條',
          20,
          88
        ]
      );
    });
  });

  it('從操作>編輯詳細資訊開啟後，若手動將型號清空，應給予防呆阻擋提示不可儲存', async () => {
    const user = userEvent.setup();

    render(
      <RoleContext.Provider value={{ authUser: { full_name: '管理者' }, role: 'ADMIN' }}>
        <BrowserRouter>
          <ConsumableList />
        </BrowserRouter>
      </RoleContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/顯示全部耗材清單/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/顯示全部耗材清單/));

    await waitFor(() => {
      expect(screen.getByText('LC-LC-OM4-3M')).toBeInTheDocument();
    });

    // 透過操作選單開啟彈窗
    const actionBtn = screen.getByTestId('consumable-action-menu-btn');
    fireEvent.click(actionBtn);

    await waitFor(() => {
      expect(screen.getByTestId('consumable-edit-detail-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('consumable-edit-detail-btn'));

    await waitFor(() => {
      expect(screen.getByText('編輯耗材型號與規格')).toBeInTheDocument();
    });

    const modelInput = screen.getByTestId('edit-consumable-model-input');
    await user.clear(modelInput); // 清空型號

    const saveBtn = screen.getByTestId('save-edit-consumable-btn');
    fireEvent.click(saveBtn);

    // 應跳出警告並阻止呼叫 updateConsumableMaster
    expect(window.alert).toHaveBeenCalledWith('請填寫耗材型號 (必填)');
    expect(window.electronAPI.namedQuery).not.toHaveBeenCalledWith(
      'updateConsumableMaster',
      expect.anything()
    );
  });
});
