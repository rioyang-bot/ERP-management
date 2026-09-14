import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardPickerModal from '../components/CardPickerModal';
import DeviceRegistrationModal from '../components/DeviceRegistrationModal';
import { createRunTransactionMock } from './helpers/mockTransaction';

/**
 * 從既有卡片選取
 *
 * 建檔時最常見的是「再登記一台同款的」，逐欄挑選很繁瑣。
 * 選一張既有卡片就把類型／廠牌／型號／規格一次帶入。
 */
describe('從既有卡片選取', () => {
  const CARDS = [
    { brand: 'BLACKCORE', type: 'SERVER', model: '3122-SM', specification: '26C', asset_count: 73 },
    { brand: 'ARISTA', type: 'SWITCH', model: 'DCS-7130', specification: '', asset_count: 1 },
    { brand: 'DELL', type: 'SERVER', model: 'R750', specification: '32C', asset_count: 5 },
  ];

  const namedQueryMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    namedQueryMock.mockImplementation((query) => {
      if (query === 'fetchExistingCards') return Promise.resolve({ success: true, rows: CARDS });
      if (query === 'fetchDeviceBrands') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: 'BLACKCORE' }, { id: 2, name: 'DELL' }] });
      }
      if (query === 'fetchDeviceTypes') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: 'SERVER' }, { id: 2, name: 'SWITCH' }] });
      }
      if (query === 'fetchModelsByBrand') return Promise.resolve({ success: true, rows: [{ id: 1, name: '3122-SM' }] });
      return Promise.resolve({ success: true, rows: [] });
    });
    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn(),
    };
  });

  describe('挑選視窗本身', () => {
    const open = (onSelect = vi.fn()) => {
      render(<CardPickerModal isOpen onClose={vi.fn()} category="設備" onSelect={onSelect} />);
      return onSelect;
    };

    it('列出既有卡片的四個欄位與數量', async () => {
      open();
      expect(await screen.findByText('BLACKCORE')).toBeInTheDocument();
      expect(screen.getByText('3122-SM')).toBeInTheDocument();
      expect(screen.getByText('26C')).toBeInTheDocument();
      expect(screen.getByText('73')).toBeInTheDocument();
    });

    it('沒有規格的卡片顯示破折號而不是空白', async () => {
      open();
      await screen.findByText('ARISTA');
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('可用多個關鍵字篩選，全部命中才顯示', async () => {
      open();
      await screen.findByText('BLACKCORE');
      await userEvent.type(screen.getByPlaceholderText(/搜尋廠牌/), 'dell server');

      expect(screen.getByText('DELL')).toBeInTheDocument();
      expect(screen.queryByText('BLACKCORE')).not.toBeInTheDocument();
      expect(screen.queryByText('ARISTA')).not.toBeInTheDocument();
    });

    it('點選一張卡片會把整筆資料交給呼叫端', async () => {
      const onSelect = open();
      await userEvent.click(await screen.findByText('DELL'));

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect.mock.calls[0][0]).toMatchObject({
        brand: 'DELL', type: 'SERVER', model: 'R750', specification: '32C',
      });
    });
  });

  describe('建檔視窗的整合', () => {
    it('按下按鈕開啟挑選視窗，選完會帶入四個欄位', async () => {
      render(<DeviceRegistrationModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

      await userEvent.click(await screen.findByText(/從既有卡片選取/));
      // 用型號點選：DELL 同時也是廠牌下拉的選項，會對到兩個元素
      await userEvent.click(await screen.findByText('R750'));

      await waitFor(() => {
        // 類型與廠牌是下拉，型號也是下拉，規格是文字區
        expect(screen.getByDisplayValue('32C')).toBeInTheDocument();
      });
      const selects = screen.getAllByRole('combobox');
      const values = selects.map((s) => s.value);
      expect(values).toContain('SERVER');
      expect(values).toContain('DELL');
      expect(values).toContain('R750');
    });
  });
});
