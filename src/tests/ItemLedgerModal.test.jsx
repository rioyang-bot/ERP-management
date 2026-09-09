import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ItemLedgerModal from '../components/ItemLedgerModal';
import FlowHistory from '../pages/FlowHistory';

describe('ItemLedgerModal & FlowHistory 匯入履歷整合測試', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
  });

  it('ItemLedgerModal 能正確載入並呈現 BATCH_IMPORT (批次匯入) 紀錄', async () => {
    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      if (query === 'fetchItemFlowHistory') {
        return Promise.resolve({
          success: true,
          rows: [
            {
              transaction_type: 'BATCH_IMPORT',
              transaction_date: '2026-09-08',
              order_no: 'BlackCore.xlsx',
              partner_name: 'KGI',
              quantity: 1,
              sn: 'X0341997',
              brand: 'BlackCore',
              model: 'BCHFT-1PC',
              specification: '24C',
              created_at: '2026-09-08T10:27:44.821Z'
            }
          ]
        });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    const item = {
      item_master_id: 208,
      sn: 'X0341997',
      brand: 'BlackCore',
      model: 'BCHFT-1PC',
      type: '1U 伺服器',
      current_stock: 1
    };

    render(<ItemLedgerModal isOpen={true} onClose={() => {}} item={item} />);

    await waitFor(() => {
      expect(screen.getByText('批次匯入')).toBeInTheDocument();
      expect(screen.getByText('BlackCore.xlsx')).toBeInTheDocument();
      expect(screen.getByText('KGI')).toBeInTheDocument();
      expect(screen.getAllByText('X0341997').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('ItemLedgerModal 當 item.sn 具前後空格或大小寫差異時，仍能正確比對並顯示履歷', async () => {
    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      if (query === 'fetchItemFlowHistory') {
        return Promise.resolve({
          success: true,
          rows: [
            {
              transaction_type: 'BATCH_IMPORT',
              transaction_date: '2026-09-08',
              order_no: 'Intel_NIC.xlsx',
              partner_name: 'METECH',
              quantity: 1,
              sn: 'SN123456',
              brand: 'Intel',
              model: 'E810',
              specification: 'Dual Port',
              created_at: '2026-09-08T10:00:00.000Z'
            }
          ]
        });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    const item = {
      item_master_id: 100,
      sn: '  sn123456  ', // 包含空白和小寫
      brand: 'Intel',
      model: 'E810',
      type: 'NIC',
      current_stock: 1
    };

    render(<ItemLedgerModal isOpen={true} onClose={() => {}} item={item} />);

    await waitFor(() => {
      expect(screen.getByText('批次匯入')).toBeInTheDocument();
      expect(screen.getByText('Intel_NIC.xlsx')).toBeInTheDocument();
      expect(screen.getByText('SN123456')).toBeInTheDocument();
    });
  });

  it('FlowHistory 包含「批次匯入」篩選選項並能呈現批次匯入紀錄', async () => {
    window.electronAPI.namedQuery.mockImplementation((query) => {
      if (query === 'fetchFlowHistory') {
        return Promise.resolve({
          success: true,
          rows: [
            {
              transaction_type: 'BATCH_IMPORT',
              transaction_date: '2026-09-08',
              order_no: 'BlackCore.xlsx',
              partner_name: 'KGI',
              quantity: 1,
              sn: 'X0341997',
              brand: 'BlackCore',
              model: 'BCHFT-1PC',
              specification: '24C',
              created_at: '2026-09-08T10:27:44.821Z'
            }
          ]
        });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    render(<FlowHistory />);

    await waitFor(() => {
      expect(screen.getByText('進出貨日誌 Stock In/Out Log')).toBeInTheDocument();
      // 驗證按鈕中包含「批次匯入」
      expect(screen.getByRole('button', { name: '批次匯入' })).toBeInTheDocument();
      // 驗證列表中有批次匯入紀錄
      expect(screen.getByText('BlackCore.xlsx')).toBeInTheDocument();
    });
  });
});
