import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeviceList from '../pages/DeviceList';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { RoleContext } from '../context/RoleContext';
import { createRunTransactionMock } from './helpers/mockTransaction';

/**
 * 設備編輯：搭載硬體清單的即時篩選（實際畫面）
 *
 * 單元測試已涵蓋篩選規則本身；這裡驗證的是「畫面真的有吃到」——
 * 規則對但沒接上畫面，使用者看到的仍然是完整清單。
 */
describe('設備編輯：搭載硬體清單即時篩選', () => {
  const DEVICE = {
    id: 1, sn: 'DEV-1', status: 'ACTIVE', ownership: 'FOR_SALE', item_master_id: 5,
    brand: 'BLACKCORE', type: 'SERVER', model: '3122-SM', specification: '26C',
    unit: '台', custom_attributes: {}, components: [],
  };

  const HW = [
    { id: 11, sn: 'U5M16V5601255', brand: 'INTEL', model: 'ULTRA9 285K', type: 'CPU', server_sn: null },
    { id: 12, sn: 'STG10005Y26', brand: 'V-COLOR', model: 'PC5-46400 UDIMM', type: 'RAM', server_sn: null },
    { id: 13, sn: 'STG10015Y26', brand: 'V-COLOR', model: 'PC5-46400 UDIMM', type: 'RAM', server_sn: null },
  ];

  const namedQueryMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    namedQueryMock.mockImplementation((query) => {
      if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') {
        return Promise.resolve({ success: true, rows: [{ ...DEVICE }] });
      }
      if (query === 'fetchAvailableHardwares') return Promise.resolve({ success: true, rows: HW });
      if (query === 'fetchDeviceBrands') return Promise.resolve({ success: true, rows: [{ id: 1, name: 'BLACKCORE' }] });
      if (query === 'fetchDeviceTypes') return Promise.resolve({ success: true, rows: [{ id: 1, name: 'SERVER' }] });
      return Promise.resolve({ success: true, rows: [], rowCount: 1 });
    });
    window.electronAPI = {
      namedQuery: namedQueryMock,
      runTransaction: createRunTransactionMock(namedQueryMock),
      getDashboardStats: vi.fn(),
      saveFile: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  /** 開啟該設備的編輯視窗，回傳搭載硬體 SN 的輸入框 */
  const openEditor = async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, role: 'ADMIN' }, setAuthUser: vi.fn() }}>
            <DeviceList />
          </RoleContext.Provider>
        </MemoryRouter>
      </ThemeProvider>
    );
    await userEvent.type(await screen.findByPlaceholderText(/快速搜尋/), 'DEV-1');
    await waitFor(() => expect(screen.getByText('DEV-1')).toBeInTheDocument());

    const menuBtn = screen.getAllByRole('button').find((b) => b.className?.includes('action-menu-btn'));
    await userEvent.click(menuBtn);
    await userEvent.click(await screen.findByText(/編輯詳細資訊/));

    const input = await screen.findByPlaceholderText(/輸入或貼上硬體序號/);
    await userEvent.click(input);
    return input;
  };

  it('尚未輸入時列出全部可掛載硬體', async () => {
    await openEditor();
    expect(await screen.findByText(/U5M16V5601255/)).toBeInTheDocument();
    expect(screen.getByText(/STG10005Y26/)).toBeInTheDocument();
    expect(screen.getByText(/STG10015Y26/)).toBeInTheDocument();
  });

  it('輸入序號的一部分只留下符合的那一筆', async () => {
    const input = await openEditor();
    await userEvent.type(input, 'U5M16V');

    await waitFor(() => {
      expect(screen.queryByText(/STG10005Y26/)).not.toBeInTheDocument();
      expect(screen.queryByText(/STG10015Y26/)).not.toBeInTheDocument();
    });
    // 清單中仍看得到目標那一筆
    expect(screen.getAllByText(/U5M16V5601255/).length).toBeGreaterThan(0);
  });

  it('標題會顯示目前以什麼篩選、剩幾筆', async () => {
    const input = await openEditor();
    await userEvent.type(input, 'U5M16V');
    expect(await screen.findByText(/以「U5M16V」篩選，1 \/ 3 筆/)).toBeInTheDocument();
  });

  it('也可以用廠牌或類型篩選', async () => {
    const input = await openEditor();
    await userEvent.type(input, 'v-color');
    await waitFor(() => expect(screen.queryByText(/U5M16V5601255/)).not.toBeInTheDocument());
    expect(screen.getByText(/STG10005Y26/)).toBeInTheDocument();
  });

  it('已經選好一筆並打上逗號後，清單回到全部供挑下一筆', async () => {
    const input = await openEditor();
    await userEvent.type(input, 'U5M16V5601255,');

    await waitFor(() => expect(screen.getByText(/STG10005Y26/)).toBeInTheDocument());
    expect(screen.getByText(/STG10015Y26/)).toBeInTheDocument();
  });

  it('沒有符合時提示清除輸入即可看到全部', async () => {
    const input = await openEditor();
    await userEvent.type(input, 'ZZZZNOTEXIST');
    expect(await screen.findByText(/清除輸入即可看到全部 3 筆/)).toBeInTheDocument();
  });

  /**
   * 點選後不應把篩選關鍵字留下來
   *
   * 使用者回報：打了 U5M 篩選出一筆，點選加入後欄位變成「U5M, U5M16V5601255」，
   * 前面多出一筆紅色的「U5M（未建檔硬體）」。
   */
  describe('設備編輯：點選硬體後欄位的內容', () => {
    it('打了關鍵字再點選，關鍵字被換成選到的序號而不是留下來', async () => {
      const input = await openEditor();
      await userEvent.type(input, 'U5M');

      const row = await screen.findByText(/U5M16V5601255/);
      await userEvent.click(row);

      await waitFor(() => {
        expect(input.value).toBe('U5M16V5601255');
      });
      // 不該再出現「未建檔硬體」的紅色標籤
      expect(screen.queryByText(/未建檔硬體/)).not.toBeInTheDocument();
    });

    it('前面已選好的會保留，只換掉正在輸入的那一段', async () => {
      const input = await openEditor();
      await userEvent.type(input, 'STG10005Y26, U5M');

      await userEvent.click(await screen.findByText(/U5M16V5601255/));

      await waitFor(() => {
        expect(input.value).toBe('STG10005Y26, U5M16V5601255');
      });
    });
  });
});
