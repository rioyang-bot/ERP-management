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
});
