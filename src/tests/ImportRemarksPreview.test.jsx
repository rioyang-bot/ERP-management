import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import HwBatchImportModal from '../components/HwBatchImportModal';
import DeviceBatchImportModal from '../components/DeviceBatchImportModal';
import { createRunTransactionMock } from './helpers/mockTransaction';

/**
 * 批次匯入預覽要看得到備註
 *
 * 備註一直都讀得到、也寫得進資料庫，但預覽表格沒有這一欄 ——
 * 匯入前無從確認備註有沒有被正確對應到，只能匯完再去列表上看。
 * 欄位名稱的別名很多（備註 / Remarks / Note / 備註(Remarks)…），
 * 看不到預覽就等於看不出自己的欄位名稱有沒有被認出來。
 */
describe('批次匯入預覽：備註欄', () => {
  const namedQuery = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    namedQuery.mockResolvedValue({ success: true, rows: [] });
    window.electronAPI = {
      namedQuery,
      runTransaction: createRunTransactionMock(namedQuery),
      authLogin: vi.fn(),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn(),
    };
  });

  /** 產生一份帶備註的 Excel；header 可換成各種別名 */
  const makeFile = (remarksHeader, remarksValue, name = 'remarks.xlsx') => {
    const rows = [{
      SN: 'SN-REMARK-001',
      Brand: 'DELL',
      Type: 'SERVER',
      Model: 'R760',
      [remarksHeader]: remarksValue,
    }];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new File([u8], name,
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  const upload = async (Modal, file) => {
    const { container } = render(<Modal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    await userEvent.upload(container.querySelector('input[type="file"]'), file);
    await waitFor(() => expect(screen.getByText(file.name)).toBeInTheDocument());
  };

  it.each([
    ['設備', DeviceBatchImportModal],
    ['硬體', HwBatchImportModal],
  ])('%s匯入的預覽有備註欄位', async (_label, Modal) => {
    await upload(Modal, makeFile('備註', '客戶指定機櫃位置'));

    expect(screen.getByRole('columnheader', { name: /備註/ })).toBeInTheDocument();
    expect(screen.getByText('客戶指定機櫃位置')).toBeInTheDocument();
  });

  it.each([
    ['備註', '中文欄名'],
    ['Remarks', '英文欄名'],
    ['備註(Remarks)', '中英合併欄名'],
    ['Note', '其他別名'],
  ])('欄名寫成 %s（%s）預覽也看得到內容', async (header) => {
    await upload(DeviceBatchImportModal, makeFile(header, `來自 ${header} 的內容`));

    expect(screen.getByText(`來自 ${header} 的內容`)).toBeInTheDocument();
  });

  it('沒填備註時顯示 -，不會是空白或 undefined', async () => {
    const rows = [{ SN: 'SN-NO-REMARK', Brand: 'DELL', Type: 'SERVER', Model: 'R760' }];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const file = new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'no_remarks.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await upload(DeviceBatchImportModal, file);

    const row = screen.getByText('SN-NO-REMARK').closest('tr');
    expect(row).not.toHaveTextContent('undefined');
    expect(screen.getByRole('columnheader', { name: /備註/ })).toBeInTheDocument();
  });

  it('備註很長時整列不會被撐開，完整內容放在 title 供滑鼠停留查看', async () => {
    const long = '這是一段很長的備註'.repeat(12);
    await upload(DeviceBatchImportModal, makeFile('備註', long));

    const cell = screen.getByTitle(long);
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveTextContent(long);
  });
});
