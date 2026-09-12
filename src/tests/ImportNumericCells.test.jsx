import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import HwBatchImportModal from '../components/HwBatchImportModal';
import DeviceBatchImportModal from '../components/DeviceBatchImportModal';
import { asText } from '../utils/encoding';
import { createRunTransactionMock } from './helpers/mockTransaction';

// 回歸測試：Excel 中的純數字儲存格會被 XLSX 讀成 number 而非 string。
// 對它呼叫 (val || '').trim() 會丟出「.trim is not a function」，
// 而在正式版建置中，這個渲染錯誤會讓整個畫面卸載成空白頁
// （回報案例：ASUS MotherBoard.xlsx，型號與序號欄位為純數字）。
describe('批次匯入：Excel 純數字儲存格', () => {
  const namedQueryMock = vi.fn();
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    namedQueryMock.mockImplementation((query) => {
      if (query === 'fetchAssetSns' || query === 'fetchHwSns') {
        return Promise.resolve({ success: true, rows: [] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
      authLogin: vi.fn(),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn(),
    };
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  /** 產生一份含純數字儲存格的 Excel */
  const makeNumericFile = (name) => {
    const rows = [{
      'SN': 123456789,          // 純數字序號
      'Model': 20240115,        // 純數字型號
      'Hostname': 12345,        // 純數字主機名稱
      'Customer': 8888,         // 純數字客戶
      'Location': 0,            // 數字 0：(val || '') 會誤判為空值
      'End-user': 42,
    }];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new File([u8], name,
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  /** 畫面是否因渲染錯誤而整個消失 */
  const crashed = () =>
    consoleErrorSpy.mock.calls.some((args) =>
      args.some((a) => String(a?.message || a).includes('is not a function')));

  it('硬體匯入：數字儲存格不應造成渲染錯誤', async () => {
    const { container } = render(
      <HwBatchImportModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />
    );
    const fileInput = container.querySelector('input[type="file"]');
    await userEvent.upload(fileInput, makeNumericFile('asus_motherboard.xlsx'));

    // 檔案名稱出現即代表已完成解析並重新渲染，沒有中途崩潰
    await waitFor(() => {
      expect(screen.getByText(/asus_motherboard\.xlsx/)).toBeInTheDocument();
    });
    expect(crashed()).toBe(false);
  });

  it('設備匯入：數字儲存格不應造成渲染錯誤', async () => {
    const { container } = render(
      <DeviceBatchImportModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />
    );
    const fileInput = container.querySelector('input[type="file"]');
    await userEvent.upload(fileInput, makeNumericFile('numeric_devices.xlsx'));

    await waitFor(() => {
      expect(screen.getByText(/numeric_devices\.xlsx/)).toBeInTheDocument();
    });
    expect(crashed()).toBe(false);
  });
});

describe('asText 工具函式', () => {
  it('數字應轉為字串而非丟出錯誤', () => {
    expect(asText(123456789)).toBe('123456789');
    expect(() => asText(123).trim()).not.toThrow();
  });

  it('數字 0 應保留為 "0"，不可被當成空值', () => {
    // 舊寫法 (0 || '').trim() 會得到空字串，讓合法的 0 值消失
    expect(asText(0)).toBe('0');
  });

  it('null 與 undefined 應轉為空字串', () => {
    expect(asText(null)).toBe('');
    expect(asText(undefined)).toBe('');
  });

  it('字串應去除前後空白', () => {
    expect(asText('  ABC  ')).toBe('ABC');
  });

  it('布林值與日期不應丟出錯誤', () => {
    expect(() => asText(true)).not.toThrow();
    expect(() => asText(new Date('2026-01-01'))).not.toThrow();
  });
});
