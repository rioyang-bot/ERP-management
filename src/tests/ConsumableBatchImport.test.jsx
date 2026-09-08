import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConsumableBatchImportModal from '../components/ConsumableBatchImportModal';
import { parseSpreadsheetFile } from '../utils/encoding';
import * as XLSX from 'xlsx';

describe('ConsumableBatchImportModal Component', () => {
  const namedQueryMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    namedQueryMock.mockClear();

    window.electronAPI = {
      namedQuery: namedQueryMock,
      authLogin: vi.fn(),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn()
    };

    namedQueryMock.mockImplementation((queryName, params) => {
      if (queryName === 'fetchConsumablesList') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (queryName === 'findConsumableMaster') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (queryName === 'insertConsumableMaster') {
        return Promise.resolve({ success: true, rows: [{ id: 101 }] });
      }
      if (queryName === 'insertDeviceBrand' || queryName === 'insertDeviceType' || queryName === 'insertDeviceModel') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true, rows: [] });
    });

    window.confirm = vi.fn(() => true);
    window.alert = vi.fn();
  });

  it('renders modal with upload zone and templates when open', () => {
    render(
      <ConsumableBatchImportModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText(/耗材清冊批次匯入/)).toBeInTheDocument();
    expect(screen.getByText(/下載匯入範本/)).toBeInTheDocument();
  });

  it('correctly processes user CSV dataset and previews valid items with Total count', async () => {
    const testData = [
      { Item: 'NIC', Total: '', Stock: '', LAB: '' },
      { Item: 'Cisco/Exablaze X10', Total: '1', Stock: '1', LAB: '' },
      { Item: 'Cisco/Exablaze X25 (DDR)', Total: '5', Stock: '4', LAB: '1' },
      { Item: 'SF 2522-Plus', Total: '2', Stock: '1', LAB: '1' },
      { Item: 'DAC Cable', Total: '', Stock: '', LAB: '' },
      { Item: 'DAC-40G-SR(3M) (MEtech)', Total: '59', Stock: '59', LAB: '' },
      { Item: 'GBIC', Total: '', Stock: '', LAB: '' },
      { Item: '10G-SR(CISCO)', Total: '5', Stock: '4', LAB: '1' }
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Consumables');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'consumables_test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const { container } = render(
      <ConsumableBatchImportModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getAllByText('Cisco/Exablaze X10').length).toBeGreaterThan(0);
      expect(screen.getAllByText('DAC-40G-SR(3M) (MEtech)').length).toBeGreaterThan(0);
      expect(screen.getAllByText('10G-SR(CISCO)').length).toBeGreaterThan(0);
    });

    // Check stats
    expect(screen.getByText(/確認批次匯入/)).toBeInTheDocument();
  });

  it('未輸入廠牌欄位之資料應標記為略過 (缺少廠牌)，填入預設廠牌後應轉為有效', async () => {
    const testData = [
      { '型號/規格': 'CAT6-STP-3M', '備註': '網路跳線', 'Total 數量': '10' },
      { '廠牌': 'Cisco', '型號/規格': 'SFP-10G-SR', '備註': '光纖模組', 'Total 數量': '5' }
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Consumables');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'consumables_brand_test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const { container } = render(
      <ConsumableBatchImportModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const fileInput = container.querySelector('input[type="file"]');
    await userEvent.upload(fileInput, file);

    // 1. 驗證 CAT6-STP-3M 因未輸入廠牌被標記為略過
    await waitFor(() => {
      expect(screen.getByText('CAT6-STP-3M')).toBeInTheDocument();
      expect(screen.getByText('SFP-10G-SR')).toBeInTheDocument();
    });

    expect(screen.getByText(/缺少廠牌/)).toBeInTheDocument();
    expect(screen.getByText('未輸入廠牌')).toBeInTheDocument();

    // 2. 在「預設/強制廠牌」輸入框輸入 "CommScope"
    const overrideBrandInput = screen.getByPlaceholderText(/例如: Cisco/);
    fireEvent.change(overrideBrandInput, { target: { value: 'CommScope' } });

    // 3. 驗證 CAT6-STP-3M 自動獲得 CommScope 廠牌並轉為有效
    await waitFor(() => {
      expect(screen.getByText('CommScope')).toBeInTheDocument();
      expect(screen.queryByText('未輸入廠牌')).not.toBeInTheDocument();
    });
  });
});
