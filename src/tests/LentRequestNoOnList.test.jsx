import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HwList from '../pages/HwList';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { RoleContext } from '../context/RoleContext';
import { createRunTransactionMock } from './helpers/mockTransaction';

// 借出中的品項要能直接在列表上看到是哪一張借用單，
// 不必回頭到借用單列表逐張比對。單號由查詢即時算出（只取尚未歸還的單），
// 因此歸還後會自動消失，不需要另外清除。
describe('列表在狀態底下顯示借用單號', () => {
  const namedQueryMock = vi.fn();

  const setupNics = (nics) => {
    namedQueryMock.mockImplementation((query) => {
      if (query === 'fetchNicList' || query === 'fetchNicListByType') {
        return Promise.resolve({
          success: true,
          rows: nics.map((n, i) => ({
            id: i + 1,
            sn: n.sn,
            status: n.status,
            ownership: 'FOR_SALE',
            item_master_id: 1,
            brand: 'TESTBRAND',
            type: 'NIC',
            model: 'TESTMODEL',
            specification: 'spec',
            unit: '個',
            custom_attributes: {},
            lent_request_no: n.lent_request_no || null,
          })),
        });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
      authLogin: vi.fn(),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const showTable = async (term) => {
    const box = await screen.findByPlaceholderText(/搜尋/);
    fireEvent.change(box, { target: { value: term } });
  };

  const renderList = () => render(
    <ThemeProvider>
      <MemoryRouter>
        <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, role: 'ADMIN' }, setAuthUser: vi.fn() }}>
          <HwList />
        </RoleContext.Provider>
      </MemoryRouter>
    </ThemeProvider>
  );

  it('借出中的硬體要顯示借用單號', async () => {
    setupNics([{ sn: 'HW-LENT-1', status: 'LENT', lent_request_no: 'DN-20260913-01' }]);
    renderList();
    await showTable('TESTBRAND');

    await waitFor(() => expect(screen.getByText('HW-LENT-1')).toBeInTheDocument());
    expect(screen.getByText(/借用單/)).toBeInTheDocument();
    expect(screen.getByText(/DN-20260913-01/)).toBeInTheDocument();
  });

  it('沒有借出的硬體不會出現借用單號那一行', async () => {
    setupNics([{ sn: 'HW-OK-1', status: 'ACTIVE', lent_request_no: null }]);
    renderList();
    await showTable('TESTBRAND');

    await waitFor(() => expect(screen.getByText('HW-OK-1')).toBeInTheDocument());
    expect(screen.queryByText(/借用單/)).not.toBeInTheDocument();
  });

  it('同一品項掛在多張借用單上時一併列出', async () => {
    setupNics([{ sn: 'HW-LENT-2', status: 'LENT', lent_request_no: 'DN-20260913-01, DN-20260914-02' }]);
    renderList();
    await showTable('TESTBRAND');

    await waitFor(() => expect(screen.getByText('HW-LENT-2')).toBeInTheDocument());
    expect(screen.getByText(/DN-20260913-01, DN-20260914-02/)).toBeInTheDocument();
  });
});
