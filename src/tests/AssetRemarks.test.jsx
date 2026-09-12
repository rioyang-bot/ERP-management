import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import DeviceBatchImportModal from '../components/DeviceBatchImportModal';
import HwBatchImportModal from '../components/HwBatchImportModal';
import { createRunTransactionMock } from './helpers/mockTransaction';

// 備註是設備與硬體共用的欄位，存於 assets.remarks，
// 可由畫面編輯，也可由批次匯入寫入（支援中英文多種表頭寫法）。
describe('資產備註欄位：批次匯入', () => {
  const namedQueryMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    namedQueryMock.mockImplementation((query) => {
      if (query === 'findItemMaster') return Promise.resolve({ success: true, rows: [{ id: 88 }] });
      if (query === 'insertItemMaster') return Promise.resolve({ success: true, rows: [{ id: 88 }] });
      if (query === 'insertAssetRecord') return Promise.resolve({ success: true, rows: [], rowCount: 1 });
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

  /** 產生一份含備註欄的檔案；headerName 用來測不同的表頭寫法 */
  const makeFile = (headerName, value, extra = {}) => {
    const rows = [{
      'SN': 'REMARK-SN-001',
      'Type': 'SERVER',
      'Brand': 'TESTBRAND',
      'Model': 'TESTMODEL',
      [headerName]: value,
      ...extra,
    }];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'S');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new File([u8], 'remarks.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  /** 取出寫入資產時使用的參數陣列 */
  const assetParams = () => {
    const call = namedQueryMock.mock.calls.find((c) => c[0] === 'insertAssetRecord');
    return call ? call[1] : null;
  };

  const upload = async (Modal, file) => {
    const { container } = render(<Modal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await userEvent.upload(container.querySelector('input[type="file"]'), file);
    await waitFor(() => {
      expect(screen.getByText(/remarks\.xlsx/)).toBeInTheDocument();
    });
    return container;
  };

  it('設備匯入：中文表頭「備註」應寫入 remarks', async () => {
    const container = await upload(DeviceBatchImportModal, makeFile('備註', '這台是備援機'));
    await userEvent.click(screen.getByText(/確認(批次)?匯入/i));
    await waitFor(() => expect(assetParams()).not.toBeNull());
    // remarks 為最後一個參數
    expect(assetParams().at(-1)).toBe('這台是備援機');
    expect(container).toBeTruthy();
  });

  it('設備匯入：英文表頭 Remarks 亦可辨識', async () => {
    await upload(DeviceBatchImportModal, makeFile('Remarks', 'spare unit'));
    await userEvent.click(screen.getByText(/確認(批次)?匯入/i));
    await waitFor(() => expect(assetParams()).not.toBeNull());
    expect(assetParams().at(-1)).toBe('spare unit');
  });

  it('設備匯入：未提供備註欄時應寫入 null，不應出錯', async () => {
    const ws = XLSX.utils.json_to_sheet([{ SN: 'NO-REMARK-1', Type: 'SERVER', Brand: 'TESTBRAND', Model: 'TESTMODEL' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'S');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    await upload(DeviceBatchImportModal, new File([u8], 'remarks.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    await userEvent.click(screen.getByText(/確認(批次)?匯入/i));
    await waitFor(() => expect(assetParams()).not.toBeNull());
    expect(assetParams().at(-1)).toBeNull();
  });

  it('硬體匯入：「備註」應寫入 remarks', async () => {
    await upload(HwBatchImportModal, makeFile('備註', '客戶指定型號'));
    await userEvent.click(screen.getByText(/確認(批次)?匯入/i));
    await waitFor(() => expect(assetParams()).not.toBeNull());
    expect(assetParams().at(-1)).toBe('客戶指定型號');
  });

  it('備註為純數字時應存成文字，不受 Excel 數值型態影響', async () => {
    await upload(DeviceBatchImportModal, makeFile('備註', 20260115));
    await userEvent.click(screen.getByText(/確認(批次)?匯入/i));
    await waitFor(() => expect(assetParams()).not.toBeNull());
    expect(assetParams().at(-1)).toBe('20260115');
  });
});
