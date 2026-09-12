import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HwList from '../pages/HwList';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { RoleContext } from '../context/RoleContext';
import { createRunTransactionMock } from './helpers/mockTransaction';

// 硬體的「對應伺服器 SN」只是一段文字，不受外鍵約束，因此可能指向
// 系統中根本不存在的設備（實測資料庫有 179 台硬體、84 個序號屬於此情況）。
// 清單以查詢即時算出的 server_exists 判斷並標示，不另外儲存狀態，
// 所以一旦掛回存在的設備就會自動恢復正常。
describe('硬體列表：掛載於不存在設備的標示', () => {
  const namedQueryMock = vi.fn();

  /** @param {Array<{sn:string, server_sn:string, server_exists:boolean, server_hostname?:string}>} nics */
  const setupNics = (nics) => {
    namedQueryMock.mockImplementation((query) => {
      if (query === 'fetchNicList' || query === 'fetchNicListByType') {
        return Promise.resolve({
          success: true,
          rows: nics.map((n, i) => ({
            id: i + 1,
            sn: n.sn,
            status: 'ACTIVE',
            ownership: 'FOR_SALE',
            item_master_id: 1,
            brand: 'TESTBRAND',
            type: 'NIC',
            model: 'TESTMODEL',
            specification: 'spec',
            unit: '個',
            custom_attributes: { server_sn: n.server_sn },
            server_sn: n.server_sn,
            server_exists: n.server_exists,
            server_hostname: n.server_hostname || null,
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
    };
  });

  /** 表格需有搜尋條件或選取卡片才會渲染，故輸入搜尋字串 */
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

  it('伺服器序號在系統中不存在時應標示「查無此設備」', async () => {
    setupNics([{ sn: 'HW-ORPHAN-1', server_sn: 'X0341227', server_exists: false }]);
    renderList();
    await showTable('TESTBRAND');

    await waitFor(() => {
      expect(screen.getByText('X0341227')).toBeInTheDocument();
    });
    expect(screen.getByText('查無此設備')).toBeInTheDocument();
  });

  it('伺服器序號對應得到設備時不應出現標示', async () => {
    setupNics([{ sn: 'HW-OK-1', server_sn: 'X0341997', server_exists: true, server_hostname: 'host-a' }]);
    renderList();
    await showTable('TESTBRAND');

    await waitFor(() => {
      expect(screen.getByText('X0341997')).toBeInTheDocument();
    });
    expect(screen.queryByText('查無此設備')).not.toBeInTheDocument();
  });

  it('未填伺服器序號者不應被誤標', async () => {
    setupNics([{ sn: 'HW-NONE-1', server_sn: '', server_exists: false }]);
    renderList();
    await showTable('TESTBRAND');

    await waitFor(() => {
      expect(screen.getByText('HW-NONE-1')).toBeInTheDocument();
    });
    expect(screen.queryByText('查無此設備')).not.toBeInTheDocument();
  });

  it('只有空白字元的伺服器序號亦不應被誤標', async () => {
    setupNics([{ sn: 'HW-BLANK-1', server_sn: '   ', server_exists: false }]);
    renderList();
    await showTable('TESTBRAND');

    await waitFor(() => {
      expect(screen.getByText('HW-BLANK-1')).toBeInTheDocument();
    });
    expect(screen.queryByText('查無此設備')).not.toBeInTheDocument();
  });

  it('同一份清單中應只標示對應不到的那幾筆', async () => {
    setupNics([
      { sn: 'HW-A', server_sn: 'EXISTS-1', server_exists: true },
      { sn: 'HW-B', server_sn: 'MISSING-1', server_exists: false },
      { sn: 'HW-C', server_sn: 'MISSING-2', server_exists: false },
      { sn: 'HW-D', server_sn: '', server_exists: false },
    ]);
    renderList();
    await showTable('TESTBRAND');

    await waitFor(() => {
      expect(screen.getByText('HW-A')).toBeInTheDocument();
    });
    expect(screen.getAllByText('查無此設備')).toHaveLength(2);
  });
});
