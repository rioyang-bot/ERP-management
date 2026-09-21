import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Inbound from '../pages/Inbound';
import { queries } from '../../database/queries';
import { createRunTransactionMock } from './helpers/mockTransaction';

/**
 * 進貨入庫的訂單來源
 *
 * 硬體建檔頁本來就有「訂單來源 (OrderSource)」，但從進貨入庫單進來的硬體
 * 填不了 —— 同一批貨走不同入口建檔，就會少掉這個資訊，事後也沒有地方補。
 */
describe('進貨入庫：硬體的訂單來源', () => {
  const namedQuery = vi.fn();
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchItemsForInbound' || query === 'fetchAllItemsForSelect') {
        return Promise.resolve({ success: true, rows: [
          { id: 9, name: 'MELLANOX CX556A', cat_name: '硬體', unit: '個', brand: 'MELLANOX', model: 'CX556A' },
        ] });
      }
      return Promise.resolve({ success: true, rows: [{ id: 1 }] });
    });
    window.electronAPI = {
      namedQuery,
      runTransaction: createRunTransactionMock(namedQuery),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  it('表格有訂單來源欄位', async () => {
    render(<MemoryRouter><Inbound /></MemoryRouter>);
    expect(await screen.findByRole('columnheader', { name: '訂單來源' })).toBeInTheDocument();
  });

  it('尚未選品項時該格顯示破折號，不是空白輸入框', async () => {
    render(<MemoryRouter><Inbound /></MemoryRouter>);
    await screen.findByRole('columnheader', { name: '訂單來源' });

    // 還沒選品項，類別是空的 —— 不是硬體就不給填
    expect(screen.queryByPlaceholderText(/PO-2026-001/)).not.toBeInTheDocument();
  });
});

describe('進貨建立資產時寫入的屬性', () => {
  const sql = queries.insertInboundAssets;

  it('接受訂單來源作為第四個參數', () => {
    expect(sql).toContain("'order_source'");
    expect(sql).toContain('$4');
  });

  it('沿用既有的專案名稱參數', () => {
    expect(sql).toContain("'project_name'");
    expect(sql).toContain('$3');
  });

  it('空值不寫進 custom_attributes，不留下 null 鍵', () => {
    expect(sql).toContain('jsonb_strip_nulls');
    expect(sql).toContain("NULLIF(TRIM(COALESCE($4, '')), '')");
  });

  it('與硬體列表的讀取方式一致', () => {
    // 列表讀的是 custom_attributes->>'order_source'
    expect(sql).toContain("'order_source'");
  });
});
