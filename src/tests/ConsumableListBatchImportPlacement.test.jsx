import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import ConsumableList from '../pages/ConsumableList';
import ConsumableRegistrationModal from '../components/ConsumableRegistrationModal';

describe('耗材列表與新增耗材彈窗批次匯入整合測試', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      namedQuery: vi.fn(async (query) => {
        if (query === 'fetchConsumablesList') {
          return { success: true, rows: [] };
        }
        if (query === 'fetchConsumableBrands') {
          return { success: true, rows: [{ id: 1, name: 'METECH' }] };
        }
        if (query === 'fetchConsumableTypesByBrand') {
          return { success: true, rows: [{ name: '線材' }] };
        }
        if (query === 'fetchConsumableModelsByBrandType') {
          return { success: true, rows: [{ name: 'CAT6-2M' }] };
        }
        return { success: true, rows: [] };
      })
    };
  });

  it('ConsumableList 頂部不應存在獨立的批次匯入按鈕，僅提供新增耗材按鈕', async () => {
    render(
      <BrowserRouter>
        <ConsumableList />
      </BrowserRouter>
    );

    // 1. 確認頂部有「➕ 新增耗材 (Add Consumable)」
    const addBtn = await screen.findByText(/新增耗材/);
    expect(addBtn).toBeInTheDocument();

    // 2. 確認頂部沒有獨立的「📥 批次匯入」按鈕
    expect(screen.queryByText(/📥 批次匯入/)).not.toBeInTheDocument();
  });

  it('在 ConsumableRegistrationModal (新增耗材) 彈窗內部，應提供批次匯入按鈕並可正常開啟匯入彈窗', async () => {
    render(
      <ConsumableRegistrationModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    // 1. 等待彈窗渲染，並確認標題為新增耗材主檔
    expect(await screen.findByText(/新增耗材主檔/)).toBeInTheDocument();

    // 2. 驗證彈窗內部含有「批次匯入」按鈕
    const batchImportBtn = screen.getByText(/批次匯入/);
    expect(batchImportBtn).toBeInTheDocument();

    // 3. 點擊批次匯入按鈕
    fireEvent.click(batchImportBtn);

    // 4. 驗證批次匯入彈窗成功展開 (出現耗材清冊批次匯入)
    await waitFor(() => {
      expect(screen.getByText(/耗材清冊批次匯入/)).toBeInTheDocument();
    });
  });
});
