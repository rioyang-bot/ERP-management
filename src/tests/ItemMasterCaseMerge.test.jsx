import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queries } from '../../database/queries';
import Settings from '../pages/Settings';
import { RoleContext } from '../context/RoleContext';

describe('品項主檔規格型號大小寫不區分比對 (Case-Insensitive) 與整併測試', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
  });

  it('queries.js 中 findItemMaster 應具備 LOWER 與 TRIM 進行大小寫無關匹配語法', () => {
    const sql = queries.findItemMaster;
    expect(sql).toContain('LOWER(TRIM(COALESCE(model');
    expect(sql).toContain('LOWER(TRIM(COALESCE(brand');
    expect(sql).toContain('LOWER(TRIM(COALESCE(type');
    expect(sql).toContain('LOWER(TRIM(COALESCE(specification');
  });

  it('queries.js 中 scanDuplicateItemMasters 應能依規格、型號、廠牌與類型不分大小寫群組出重複項', () => {
    const sql = queries.scanDuplicateItemMasters;
    expect(sql).toContain('LOWER(TRIM(i.brand))');
    expect(sql).toContain('LOWER(TRIM(i.model))');
    expect(sql).toContain('HAVING COUNT(*) > 1');
  });

  it('Settings 頁面應能呈現品項主檔大小寫整併工具，並執行掃描與整併操作', async () => {
    const mockNamedQuery = vi.fn().mockImplementation((query, params) => {
      if (query === 'getSystemSetting') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'fetchUsers') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'scanDuplicateItemMasters') {
        return Promise.resolve({
          success: true,
          rows: [
            {
              category_name: '設備',
              norm_brand: 'cisco',
              norm_type: 'switch',
              norm_model: 'c9300-48p',
              norm_specification: '',
              duplicate_count: 2,
              master_ids: [101, 102],
              brands: ['CISCO', 'cisco'],
              types: ['Switch', 'switch'],
              models: ['C9300-48P', 'c9300-48p'],
              specifications: ['', ''],
              total_assets_count: 5
            }
          ]
        });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    window.electronAPI = {
      namedQuery: mockNamedQuery
    };

    // 模擬 fetch /api/item-master/merge-duplicates
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        success: true,
        mergedGroups: 1,
        removedMasters: 1
      })
    });

    render(
      <RoleContext.Provider value={{ authUser: { role: 'ADMIN', full_name: '系統管理者' } }}>
        <Settings />
      </RoleContext.Provider>
    );

    // 1. 驗證整併工具標題呈現在畫面上
    expect(screen.getByText('品項主檔規格型號大小寫整併工具')).toBeInTheDocument();

    // 2. 點擊「掃描大小寫重複主檔」按鈕
    const scanBtn = screen.getByTestId('scan-duplicates-btn');
    fireEvent.click(scanBtn);

    // 3. 應顯示掃描出來的重複清單
    await waitFor(() => {
      expect(screen.getByText('CISCO c9300-48p')).toBeInTheDocument();
      expect(screen.getByText(/\[CISCO\] C9300-48P/)).toBeInTheDocument();
      expect(screen.getByText(/\[cisco\] c9300-48p/)).toBeInTheDocument();
      expect(screen.getByText('5 台')).toBeInTheDocument();
    });

    // 4. 點擊「立即一鍵整併」按鈕
    const mergeBtn = screen.getByTestId('merge-duplicates-btn');
    fireEvent.click(mergeBtn);

    // 5. 驗證呼叫整併 API 並顯示成功提示
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/item-master/merge-duplicates',
        expect.objectContaining({ method: 'POST' })
      );
      expect(screen.getByText(/成功完成大小寫主檔整併/)).toBeInTheDocument();
    });
  });
});
