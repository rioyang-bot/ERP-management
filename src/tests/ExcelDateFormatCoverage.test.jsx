import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import DeviceBatchImportModal from '../components/DeviceBatchImportModal';
import { createRunTransactionMock } from './helpers/mockTransaction';

// 「日期格式的儲存格改取顯示文字」這項變更，會讓真正的日期欄位從
// 收到序號改為收到顯示字串。本測試逐一確認各種常見的 Excel 日期顯示格式
// 仍能正確解析為 YYYY-MM-DD，避免修好訂單來源卻弄壞日期欄位。
describe('Excel 日期欄位：各種顯示格式的解析涵蓋', () => {
  const namedQueryMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    namedQueryMock.mockImplementation(() => Promise.resolve({ success: true, rows: [] }));
    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
      authLogin: vi.fn(),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn(),
    };
  });

  /**
   * 產生一份設備清單，安裝日期以指定的 Excel 數值格式呈現。
   * 45658 = 2025-01-01，53 = 一個不會被誤判的普通數字。
   */
  const buildFile = (numFmt, serial = 45658) => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['SN', 'Type', 'Brand', 'Model', 'Project Date ( Installedl )'],
      ['FMT-SN-001', 'SERVER', 'TESTBRAND', 'TESTMODEL', null],
    ]);
    ws['E2'] = { t: 'n', v: serial, z: numFmt };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'S');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new File([u8], `fmt_${numFmt.replace(/[^a-z0-9]/gi, '_')}.xlsx`,
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  const uploadAndRead = async (file) => {
    const { container, unmount } = render(
      <DeviceBatchImportModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />
    );
    await userEvent.upload(container.querySelector('input[type="file"]'), file);
    await waitFor(() => {
      expect(screen.getByText(new RegExp(file.name.replace('.', '\\.')))).toBeInTheDocument();
    });
    const found = screen.queryByText('2025-01-01') !== null;
    unmount();
    return found;
  };

  // 各地區 Excel 常見的日期顯示格式
  const formats = ['yyyy-mm-dd', 'yyyy/mm/dd', 'dd/mm/yyyy', 'm/d/yy', 'd-mmm-yy'];

  formats.forEach((fmt) => {
    it(`格式 ${fmt} 的日期欄位應解析為 2025-01-01`, async () => {
      expect(await uploadAndRead(buildFile(fmt))).toBe(true);
    });
  });

  it('數字格式的欄位不應被當成日期轉換', async () => {
    // 同一個序號值，但格式是一般數字，應維持數字不變
    const ws = XLSX.utils.aoa_to_sheet([['SN', 'Qty'], ['NUM-SN-001', null]]);
    ws['B2'] = { t: 'n', v: 45658, z: '#,##0' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'S');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'plain_number.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const { container } = render(
      <DeviceBatchImportModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />
    );
    await userEvent.upload(container.querySelector('input[type="file"]'), file);
    await waitFor(() => {
      expect(screen.getByText(/plain_number\.xlsx/)).toBeInTheDocument();
    });
    // 不應出現被誤轉的日期
    expect(screen.queryByText('2025-01-01')).not.toBeInTheDocument();
  });
});
