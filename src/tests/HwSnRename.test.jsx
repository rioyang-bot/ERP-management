import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HwList from '../pages/HwList';
import { queries } from '../../database/queries';

/**
 * 硬體改序號時的連動
 *
 * 序號在這套系統裡是以「字串」被好幾個地方記著的：掛載它的設備清單
 * （mounted_hw_sns）、進貨明細、出貨明細、維修單明細。先前硬體改序號時
 * 一處都沒更新，那些地方就留著一個已經不存在的序號 ——
 * 設備的編輯視窗還會把正確的那筆當成要解綁的對象。
 */
const HW = {
  id: 55,
  sn: 'XFL1YHT0OGYU',
  brand: 'MELLANOX',
  type: 'NIC',
  model: 'CX556A',
  specification: '100G',
  status: 'ACTIVE',
  ownership: 'FOR_SALE',
  item_master_id: 3,
  custom_attributes: { server_sn: 'X0345809' },
  server_sn: 'X0345809',
};

describe('硬體列表：改序號時的關聯連動', () => {
  const namedQuery = vi.fn();
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchNicList' || query === 'fetchNicListByType') {
        return Promise.resolve({ success: true, rows: [{ ...HW }] });
      }
      if (query === 'checkAssetSnExistsExcludeSelf') return Promise.resolve({ success: true, rows: [] });
      return Promise.resolve({ success: true, rows: [], rowCount: 1 });
    });
    window.electronAPI = {
      namedQuery,
      runTransaction: vi.fn().mockResolvedValue({ success: true, results: {} }),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const called = (name) => calls.filter((c) => c.query === name);

  /** 開啟該硬體的編輯視窗，回傳序號輸入框 */
  const openEditor = async () => {
    render(<MemoryRouter><HwList /></MemoryRouter>);
    // 未輸入搜尋或選卡片時清單不會展開，先搜尋出目標那一筆
    await userEvent.type(await screen.findByPlaceholderText('搜尋...'), 'XFL1YHT0OGYU');
    await waitFor(() => expect(screen.getAllByText(/XFL1YHT0OGYU/).length).toBeGreaterThan(0));

    const menuBtn = screen.getAllByRole('button').find((b) => b.className?.includes('action-menu-btn'));
    await userEvent.click(menuBtn);
    await userEvent.click(await screen.findByText(/編輯/));
    // 搜尋框裡也是同一組字，挑編輯視窗裡的那一個
    return waitFor(() => {
      const input = screen.getAllByDisplayValue('XFL1YHT0OGYU')
        .find((el) => el.getAttribute('placeholder') !== '搜尋...');
      expect(input).toBeTruthy();
      return input;
    });
  };

  const saveWithSn = async (newSn) => {
    const input = await openEditor();
    await userEvent.clear(input);
    await userEvent.type(input, newSn);
    await userEvent.click(screen.getByRole('button', { name: /儲存/ }));
  };

  it.each([
    ['掛載它的設備清單', 'renameMountedHwSnOnDevices'],
    ['維修單明細', 'updateRepairItemsSn'],
    ['出貨明細', 'updateOutboundItemsSn'],
    ['進貨明細', 'updateInboundItemsSn'],
  ])('序號改掉時，%s 也跟著改', async (_label, queryName) => {
    await saveWithSn('XFL1YHT0OGYU-FIXED');

    await waitFor(() => expect(called(queryName)).toHaveLength(1));
    expect(called(queryName)[0].params).toEqual(['XFL1YHT0OGYU-FIXED', 'XFL1YHT0OGYU']);
  });

  it('序號沒改時不會做多餘的連動', async () => {
    const input = await openEditor();
    await userEvent.click(input);
    await userEvent.click(screen.getByRole('button', { name: /儲存/ }));

    await waitFor(() => expect(called('updateNicDetails').length).toBeGreaterThan(0));
    expect(called('renameMountedHwSnOnDevices')).toHaveLength(0);
    expect(called('updateInboundItemsSn')).toHaveLength(0);
  });
});

describe('設備清單裡的硬體序號替換', () => {
  const sql = queries.renameMountedHwSnOnDevices;

  it('逐筆比對後替換，不用字串取代', () => {
    // 序號互為子字串時（例如 U5M16V 與 U5M16V560125），字串取代會誤傷
    expect(sql).toContain('string_to_array');
    expect(sql).toContain('UPPER(TRIM(p)) = UPPER(TRIM($2))');
    expect(sql).not.toContain('REPLACE(');
  });

  it('只動真的列到那個序號的設備', () => {
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('RETURNING');
  });
});
