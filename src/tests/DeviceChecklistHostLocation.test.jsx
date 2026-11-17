import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeviceChecklistModal from '../components/DeviceChecklistModal';
import { queries } from '../../database/queries';

/**
 * 出機檢查表的主機名稱 (HostName) 與放置位置 (Location)
 *
 * 與「編輯詳細資訊」是同一個欄位（assets.hostname / assets.location）：
 * 在出機檢查表改了，編輯詳細資訊就看得到，反之亦然。
 * 與勾選一樣先記成未儲存，按「儲存變更」才寫回。
 */
const DEVICE = {
  id: 7, sn: 'DFE322328070001', brand: 'SECRETHFT', model: '3122-SM',
  type: 'SERVER', specification: '26C', hostname: 'NeoTap', client: '凱基',
  location: 'UAT DC', remarks: '', components: [],
};
const APPLIED = [
  { id: 801, group_name: 'SecretHFT 出機檢查', kind: 'MAIN', item_name: 'BIOS 設定', source_item_id: 21, is_checked: false },
];

describe('出機檢查表：主機名稱與放置位置', () => {
  const namedQuery = vi.fn();
  let calls;
  let asset;
  let onAssetUpdated;
  let onChanged;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    asset = { hostname: DEVICE.hostname, location: DEVICE.location };
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchAssetChecklist') return Promise.resolve({ success: true, rows: APPLIED });
      if (query === 'updateAssetHostLocation') {
        // 比照 SQL：前後空白去掉、空字串存成 NULL
        asset = { hostname: params[0].trim() || null, location: params[1].trim() || null };
        return Promise.resolve({ success: true, rows: [{ id: params[2], ...asset, mounted_hw_updated: 2 }] });
      }
      if (query === 'setAssetChecklistItemChecked') return Promise.resolve({ success: true, rows: [{ id: params[1] }] });
      return Promise.resolve({ success: true, rows: [] });
    });
    window.electronAPI = { namedQuery, runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn() };
  });

  const called = (name) => calls.filter((c) => c.query === name);
  const renderModal = (device = DEVICE) => {
    onAssetUpdated = vi.fn();
    onChanged = vi.fn();
    return render(
      <DeviceChecklistModal isOpen device={device} onClose={vi.fn()} onChanged={onChanged} onAssetUpdated={onAssetUpdated} />
    );
  };
  const hostInput = () => screen.getByLabelText('主機名稱 (HostName)');
  const locInput = () => screen.getByLabelText('放置位置 (Location)');
  const loaded = () => screen.findByText('BIOS 設定');

  it('帶入這台設備目前的主機名稱與放置位置', async () => {
    renderModal();
    await loaded();
    expect(hostInput()).toHaveValue('NeoTap');
    expect(locInput()).toHaveValue('UAT DC');
  });

  it('設備沒有填時欄位是空白', async () => {
    renderModal({ ...DEVICE, hostname: null, location: undefined });
    await loaded();
    expect(hostInput()).toHaveValue('');
    expect(locInput()).toHaveValue('');
  });

  it('修改後先記成未儲存，還沒寫回資料庫', async () => {
    renderModal();
    await loaded();
    await userEvent.clear(hostInput());
    await userEvent.type(hostInput(), 'NeoTap-02');

    expect(screen.getByText('有 1 項變更尚未儲存')).toBeInTheDocument();
    expect(called('updateAssetHostLocation')).toHaveLength(0);
  });

  it('按「儲存變更」寫回設備的主機名稱與放置位置，並通知列表重新讀取', async () => {
    renderModal();
    await loaded();
    await userEvent.clear(hostInput());
    await userEvent.type(hostInput(), '  NeoTap-02 ');
    await userEvent.clear(locInput());
    await userEvent.type(locInput(), 'PROD DC 3F');
    expect(screen.getByText('有 2 項變更尚未儲存')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /儲存變更/ }));

    await waitFor(() => expect(called('updateAssetHostLocation')).toHaveLength(1));
    expect(called('updateAssetHostLocation')[0].params).toEqual(['NeoTap-02', 'PROD DC 3F', DEVICE.id]);
    await waitFor(() => expect(onAssetUpdated).toHaveBeenCalled());
    expect(hostInput()).toHaveValue('NeoTap-02');
    expect(screen.queryByText(/變更尚未儲存/)).not.toBeInTheDocument();
    // 只改設備資訊時不會動到檢查項目
    expect(called('setAssetChecklistItemChecked')).toHaveLength(0);
  });

  it('留下事件紀錄（改了什麼、從什麼改成什麼）', async () => {
    renderModal();
    await loaded();
    await userEvent.clear(locInput());
    await userEvent.type(locInput(), 'PROD DC');
    await userEvent.click(screen.getByRole('button', { name: /儲存變更/ }));

    await waitFor(() => expect(onAssetUpdated).toHaveBeenCalled());
    const logged = JSON.stringify(calls.filter((c) => !['fetchAssetChecklist', 'updateAssetHostLocation'].includes(c.query)));
    expect(logged).toContain('放置位置：UAT DC → PROD DC');
    expect(logged).not.toContain('主機名稱：');
  });

  it('清空放置位置也能存（送出空字串）', async () => {
    renderModal();
    await loaded();
    await userEvent.clear(locInput());
    await userEvent.click(screen.getByRole('button', { name: /儲存變更/ }));

    await waitFor(() => expect(called('updateAssetHostLocation')).toHaveLength(1));
    expect(called('updateAssetHostLocation')[0].params).toEqual(['NeoTap', '', DEVICE.id]);
    await waitFor(() => expect(locInput()).toHaveValue(''));
  });

  it('與勾選一起儲存時兩邊都寫回', async () => {
    renderModal();
    await loaded();
    await userEvent.click(screen.getByLabelText('BIOS 設定 檢查完成'));
    await userEvent.clear(hostInput());
    await userEvent.type(hostInput(), 'NT-01');
    expect(screen.getByText('有 2 項變更尚未儲存')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /儲存變更/ }));

    await waitFor(() => expect(called('setAssetChecklistItemChecked')).toHaveLength(1));
    expect(called('updateAssetHostLocation')[0].params).toEqual(['NT-01', 'UAT DC', DEVICE.id]);
  });

  it('「放棄變更」回到原本的值，不寫回', async () => {
    renderModal();
    await loaded();
    await userEvent.clear(hostInput());
    await userEvent.type(hostInput(), 'WRONG');
    await userEvent.click(screen.getByRole('button', { name: '放棄變更' }));

    await waitFor(() => expect(hostInput()).toHaveValue('NeoTap'));
    expect(called('updateAssetHostLocation')).toHaveLength(0);
  });

  it('改回原本的值就不算變更', async () => {
    renderModal();
    await loaded();
    await userEvent.type(hostInput(), 'X');
    expect(screen.getByText('有 1 項變更尚未儲存')).toBeInTheDocument();
    await userEvent.type(hostInput(), '{backspace}');
    expect(screen.queryByText(/變更尚未儲存/)).not.toBeInTheDocument();
  });

  it('寫回失敗時提示並保留原本的值', async () => {
    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchAssetChecklist') return Promise.resolve({ success: true, rows: APPLIED });
      if (query === 'updateAssetHostLocation') return Promise.resolve({ success: false, error: '資料庫錯誤' });
      return Promise.resolve({ success: true, rows: [] });
    });
    renderModal();
    await loaded();
    await userEvent.clear(hostInput());
    await userEvent.type(hostInput(), 'NEW');
    await userEvent.click(screen.getByRole('button', { name: /儲存變更/ }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('資料庫錯誤')));
    await waitFor(() => expect(hostInput()).toHaveValue('NeoTap'));
    expect(onAssetUpdated).not.toHaveBeenCalled();
  });

  describe('SQL：與編輯詳細資訊寫同一個欄位，搭載硬體的位置跟著設備', () => {
    const sql = queries.updateAssetHostLocation;
    it('更新 assets 的 hostname 與 location', () => {
      expect(sql).toMatch(/UPDATE assets SET hostname = NULLIF\(TRIM\(\$1\), ''\), location = NULLIF\(TRIM\(\$2\), ''\)/);
      expect(sql).toMatch(/WHERE id = \$3/);
    });
    it('搭載硬體（server_sn 是這台設備）的位置跟著改；位置清空時不動硬體', () => {
      expect(sql).toMatch(/custom_attributes->>'server_sn'/);
      expect(sql).toMatch(/dev\.location IS NOT NULL/);
    });
  });
});
