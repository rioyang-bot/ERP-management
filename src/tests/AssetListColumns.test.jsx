import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeviceList from '../pages/DeviceList';
import HwList from '../pages/HwList';
import { joinParts } from '../utils/assetColumns';

/**
 * 設備／硬體列表的欄位編排
 *
 * 類型、廠牌、型號、規格原本散在兩欄（首欄是「廠牌 / 型號 / 類型」，
 * 規格自成一欄），End-user 也自成一欄。欄位一多就得橫向捲動才看得完，
 * 而這四個欄位描述的其實是同一件事。
 *
 * 現在併成：
 *   首欄   類型 / 廠牌
 *          型號 / 規格
 *   客戶欄 客戶 →（聯絡人）→ End-user
 */
const DEVICE = {
  id: 1, sn: 'X0344311', brand: 'BLACKCORE', type: 'SERVER', model: 'BCHFT-1PC',
  specification: '56C', client: '元大', partner_contact: '郭沛晴', end_user: 'QRT',
  location: 'BQDC3F', status: 'ACTIVE', ownership: 'FOR_SALE',
  custom_attributes: {}, components: [],
};

const HW = {
  id: 2, sn: 'HW-001', brand: 'MELLANOX', type: 'NIC', model: 'CX556A',
  specification: '100G', client: '元大', partner_contact: '郭沛晴', end_user: 'QRT',
  status: 'ACTIVE', ownership: 'FOR_SALE', custom_attributes: {},
};

describe('設備／硬體列表的欄位編排', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn((query) => {
        if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') {
          return Promise.resolve({ success: true, rows: [DEVICE] });
        }
        if (query === 'fetchNicList' || query === 'fetchNicListByType') {
          return Promise.resolve({ success: true, rows: [HW] });
        }
        return Promise.resolve({ success: true, rows: [] });
      }),
      runTransaction: vi.fn(),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const showDevices = async () => {
    // 設備列表要先選定廠牌（卡片下鑽）才會展開清單
    render(<MemoryRouter initialEntries={['/devices?brand=BLACKCORE']}><DeviceList /></MemoryRouter>);
    await screen.findByText('X0344311');
  };
  const showHw = async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    render(<MemoryRouter><HwList /></MemoryRouter>);
    // 硬體列表要先搜尋才會展開清單
    await userEvent.type(await screen.findByPlaceholderText('搜尋...'), 'HW-001');
    await waitFor(() => expect(screen.getAllByText('HW-001').length).toBeGreaterThan(0));
  };

  it('設備列表首欄的標題是 類型 / 廠牌 / 型號 / 規格', async () => {
    await showDevices();
    expect(screen.getByRole('columnheader', { name: '類型 / 廠牌 / 型號 / 規格' })).toBeInTheDocument();
  });

  it('設備列表首欄上行是類型與廠牌，下行是型號與規格', async () => {
    await showDevices();
    expect(screen.getByText('SERVER / BLACKCORE')).toBeInTheDocument();
    expect(screen.getByText('BCHFT-1PC / 56C')).toBeInTheDocument();
  });

  it('設備列表不再有獨立的規格欄與 End-user 欄', async () => {
    await showDevices();
    expect(screen.queryByRole('columnheader', { name: '規格 (Spec)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'End-user' })).not.toBeInTheDocument();
  });

  it('設備列表把 End-user 放在客戶欄底下', async () => {
    await showDevices();
    expect(screen.getByRole('columnheader', { name: '客戶 / End-user' })).toBeInTheDocument();

    const row = screen.getByText('X0344311').closest('tr');
    expect(row).toHaveTextContent('元大');
    expect(row).toHaveTextContent('郭沛晴');
    expect(row).toHaveTextContent('End-user：QRT');
  });

  it('硬體列表套用同一套編排', async () => {
    await showHw();
    expect(screen.getByRole('columnheader', { name: '類型 / 廠牌 / 型號 / 規格' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '客戶 / End-user' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '規格 (Spec)' })).not.toBeInTheDocument();
    expect(screen.getByText('NIC / MELLANOX')).toBeInTheDocument();
    expect(screen.getByText('CX556A / 100G')).toBeInTheDocument();
  });
});

describe('欄位值的組合', () => {
  it('以 / 串接', () => {
    expect(joinParts('SERVER', 'BLACKCORE')).toBe('SERVER / BLACKCORE');
  });

  it('缺其中一項時不會留下半截的分隔符號', () => {
    // 規格常常沒填，舊寫法會變成 "BCHFT-1PC / " 或 " - CX556A"
    expect(joinParts('BCHFT-1PC', '')).toBe('BCHFT-1PC');
    expect(joinParts('', '56C')).toBe('56C');
    expect(joinParts(null, 'X')).toBe('X');
    expect(joinParts(undefined, 'X')).toBe('X');
  });

  it('全部都沒有時顯示 --', () => {
    expect(joinParts('', null, undefined)).toBe('--');
    expect(joinParts()).toBe('--');
  });

  it('去除前後空白，只有空白的也算沒填', () => {
    expect(joinParts('  SERVER  ', ' DELL ')).toBe('SERVER / DELL');
    expect(joinParts('   ', 'DELL')).toBe('DELL');
  });

  it('數字 0 要保留，不能當成空值', () => {
    expect(joinParts(0, 'X')).toBe('0 / X');
  });
});
