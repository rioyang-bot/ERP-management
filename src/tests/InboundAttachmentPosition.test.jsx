import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Inbound from '../pages/Inbound';
import { MemoryRouter } from 'react-router-dom';
import { createRunTransactionMock } from './helpers/mockTransaction';

/**
 * 進貨入庫單的版面順序
 *
 * 附件通常是最後才補上的，放在單頭下方會把品項明細擠到很下面，
 * 因此移到明細之後、確認入庫按鈕之前。
 */
describe('進貨入庫單：相關附件的位置', () => {
  const namedQueryMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    namedQueryMock.mockImplementation((query) => {
      if (query === 'fetchSuppliers') return Promise.resolve({ success: true, rows: [{ id: 7, name: '元大' }] });
      if (query === 'countInboundOrders') return Promise.resolve({ success: true, rows: [{ count: 0 }] });
      return Promise.resolve({ success: true, rows: [] });
    });
    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
    };
  });

  it('相關附件排在品項明細之後、確認入庫按鈕之前', async () => {
    const { container } = render(<MemoryRouter><Inbound /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/相關附件/)).toBeInTheDocument());

    const attach = screen.getByText(/相關附件/);
    const table = container.querySelector('table');
    const submit = screen.getByText(/確認入庫作業/);

    expect(table).toBeTruthy();

    // compareDocumentPosition：FOLLOWING 代表後者在前者之後
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(table.compareDocumentPosition(attach) & FOLLOWING).toBeTruthy();
    expect(attach.compareDocumentPosition(submit) & FOLLOWING).toBeTruthy();
  });

  it('單頭欄位仍在最上方，順序沒有被弄亂', async () => {
    const { container } = render(<MemoryRouter><Inbound /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/供應商名稱/)).toBeInTheDocument());

    const supplier = screen.getByText(/供應商名稱/);
    const table = container.querySelector('table');
    expect(supplier.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
