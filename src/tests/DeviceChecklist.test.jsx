import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeviceChecklistModal from '../components/DeviceChecklistModal';
import ChecklistTemplates from '../pages/ChecklistTemplates';

/**
 * 出機檢查表
 *
 * 需求裡的兩條規則最容易在改動中被弄丟，所以在這裡釘住：
 *   1. 主要檢查功能整組帶入，細項只帶使用者勾選的那幾個
 *   2. 範本被刪掉之後，設備已經套用的內容不會跟著消失
 */
const DEVICE = {
  id: 7, sn: 'DFE322328070001', brand: 'BLACKCORE', model: '3122-SM',
  type: 'SERVER', specification: '26C', hostname: 'NeoTap', client: '凱基',
  location: 'UAT DC', remarks: '', components: [],
};

const GROUPS = [
  { id: 1, name: '共通檢查', brand: null, main_count: 1, detail_count: 0 },
  { id: 2, name: 'BLACKCORE 出機檢查', brand: 'BLACKCORE', main_count: 2, detail_count: 2 },
];

const TEMPLATE_ITEMS = [
  { id: 11, group_id: 1, kind: 'MAIN', name: '外觀檢查', group_name: '共通檢查' },
  { id: 21, group_id: 2, kind: 'MAIN', name: 'BIOS 設定', group_name: 'BLACKCORE 出機檢查' },
  { id: 22, group_id: 2, kind: 'MAIN', name: '網路設定', group_name: 'BLACKCORE 出機檢查' },
  { id: 23, group_id: 2, kind: 'DETAIL', name: '開機順序', group_name: 'BLACKCORE 出機檢查' },
  { id: 24, group_id: 2, kind: 'DETAIL', name: 'SR-IOV 開啟', group_name: 'BLACKCORE 出機檢查' },
];

describe('出機檢查表：單一設備的套用與勾選', () => {
  const namedQuery = vi.fn();
  let calls;
  let assetItems;

  const setup = ({ groups = GROUPS, items = TEMPLATE_ITEMS, applied = [] } = {}) => {
    assetItems = [...applied];
    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchChecklistGroups') return Promise.resolve({ success: true, rows: groups });
      if (query === 'fetchChecklistItems') return Promise.resolve({ success: true, rows: items });
      if (query === 'fetchAssetChecklist') return Promise.resolve({ success: true, rows: assetItems });
      if (query === 'insertAssetChecklistItem') {
        assetItems.push({
          id: 1000 + assetItems.length, asset_id: params[0], group_name: params[1],
          kind: params[2], item_name: params[3], source_item_id: params[4],
          sort_order: params[5], is_checked: false,
        });
        return Promise.resolve({ success: true, rows: [{ id: 1000 + assetItems.length }] });
      }
      if (query === 'setAssetChecklistItemChecked') {
        const row = assetItems.find((r) => r.id === params[1]);
        if (row) row.is_checked = params[0];
        return Promise.resolve({ success: true, rows: [{ id: params[1] }] });
      }
      if (query === 'deleteAssetChecklistItem') {
        assetItems = assetItems.filter((r) => r.id !== params[0]);
        return Promise.resolve({ success: true, rows: [{ id: params[0] }] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    setup();
    window.electronAPI = { namedQuery, runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn() };
  });

  const called = (name) => calls.filter((c) => c.query === name);
  const renderModal = () => render(
    <DeviceChecklistModal isOpen device={DEVICE} onClose={vi.fn()} onChanged={vi.fn()} />
  );

  it('預設選到這台設備自己廠牌的主項目', async () => {
    renderModal();
    const select = await screen.findByLabelText('主項目');
    await waitFor(() => expect(select.value).toBe('2'));
    expect(await screen.findByText(/這台設備的廠牌/)).toBeInTheDocument();
  });

  it('套用時主要檢查功能整組帶入', async () => {
    renderModal();
    await screen.findByLabelText('主項目');
    await screen.findByText('BIOS 設定');
    await userEvent.click(screen.getByRole('button', { name: /套用到這台設備/ }));

    await waitFor(() => expect(called('insertAssetChecklistItem')).toHaveLength(2));
    const names = called('insertAssetChecklistItem').map((c) => c.params[3]);
    expect(names).toEqual(['BIOS 設定', '網路設定']);
  });

  it('細項只帶使用者勾選的那幾個', async () => {
    renderModal();
    await screen.findByLabelText('主項目');

    await userEvent.click(await screen.findByRole('checkbox', { name: /開機順序/ }));
    await userEvent.click(screen.getByRole('button', { name: /套用到這台設備/ }));

    await waitFor(() => expect(called('insertAssetChecklistItem')).toHaveLength(3));
    const details = called('insertAssetChecklistItem').filter((c) => c.params[2] === 'DETAIL');
    expect(details.map((c) => c.params[3])).toEqual(['開機順序']);
    // 沒勾的那個細項不該被帶進去
    expect(called('insertAssetChecklistItem').map((c) => c.params[3])).not.toContain('SR-IOV 開啟');
  });

  it('套用時把主項目名稱與項目名稱一起存下來', async () => {
    renderModal();
    await screen.findByLabelText('主項目');
    await screen.findByText('BIOS 設定');
    await userEvent.click(screen.getByRole('button', { name: /套用到這台設備/ }));

    await waitFor(() => expect(called('insertAssetChecklistItem').length).toBeGreaterThan(0));
    // 存的是名稱而不是只有 id，範本刪掉後才留得住內容
    expect(called('insertAssetChecklistItem')[0].params[1]).toBe('BLACKCORE 出機檢查');
    expect(called('insertAssetChecklistItem')[0].params[3]).toBe('BIOS 設定');
  });

  it('勾選檢查完成會存回資料庫', async () => {
    setup({ applied: [{ id: 501, group_name: 'G', kind: 'MAIN', item_name: 'BIOS 設定', is_checked: false }] });
    renderModal();

    const box = await screen.findByRole('checkbox', { name: 'BIOS 設定 檢查完成' });
    await userEvent.click(box);

    await waitFor(() => expect(called('setAssetChecklistItemChecked')[0].params).toEqual([true, 501]));
  });

  it('再勾一次會取消完成', async () => {
    setup({ applied: [{ id: 501, group_name: 'G', kind: 'MAIN', item_name: 'BIOS 設定', is_checked: true }] });
    renderModal();

    await userEvent.click(await screen.findByRole('checkbox', { name: 'BIOS 設定 檢查完成' }));
    await waitFor(() => expect(called('setAssetChecklistItemChecked')[0].params).toEqual([false, 501]));
  });

  it('顯示完成進度', async () => {
    setup({ applied: [
      { id: 1, group_name: 'G', kind: 'MAIN', item_name: 'A', is_checked: true },
      { id: 2, group_name: 'G', kind: 'MAIN', item_name: 'B', is_checked: false },
    ] });
    renderModal();
    expect(await screen.findByText(/已完成 1 \/ 2/)).toBeInTheDocument();
  });

  /** 需求第 3 點：範本被刪掉，設備已套用的內容不能跟著消失 */
  describe('範本刪掉之後', () => {
    it('設備已套用的項目仍然看得到、也還能勾選', async () => {
      setup({
        groups: [],          // 範本全部被刪掉了
        items: [],
        applied: [
          { id: 601, group_name: '已刪除的主項目', kind: 'MAIN', item_name: 'BIOS 設定', source_item_id: null, is_checked: true },
          { id: 602, group_name: '已刪除的主項目', kind: 'DETAIL', item_name: '開機順序', source_item_id: null, is_checked: false },
        ],
      });
      renderModal();

      expect(await screen.findByText('BIOS 設定')).toBeInTheDocument();
      expect(screen.getByText('開機順序')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('checkbox', { name: '開機順序 檢查完成' }));
      await waitFor(() => expect(called('setAssetChecklistItemChecked')[0].params).toEqual([true, 602]));
    });

    it('沒有範本時提示要先去報表中心建立', async () => {
      setup({ groups: [], items: [], applied: [] });
      renderModal();
      expect(await screen.findByText(/請先到「報表中心 → 出機檢查表」建立/)).toBeInTheDocument();
    });
  });

  it('已經套用過的項目不會重複套用', async () => {
    setup({ applied: [
      { id: 701, group_name: 'BLACKCORE 出機檢查', kind: 'MAIN', item_name: 'BIOS 設定', is_checked: false },
    ] });
    renderModal();
    await screen.findByLabelText('主項目');

    await waitFor(() => expect(screen.getAllByText('已套用').length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: /套用到這台設備/ }));

    await waitFor(() => expect(called('insertAssetChecklistItem')).toHaveLength(1));
    expect(called('insertAssetChecklistItem')[0].params[3]).toBe('網路設定');
  });

  it('尚未套用任何項目時不可列印', async () => {
    renderModal();
    const printBtn = await screen.findByText(/列印/);
    expect(printBtn.closest('button')).toBeDisabled();
  });
});

describe('出機檢查表：範本維護頁', () => {
  const namedQuery = vi.fn();
  let calls;
  let groups;
  let items;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    groups = [...GROUPS];
    items = [...TEMPLATE_ITEMS];

    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchChecklistGroups') return Promise.resolve({ success: true, rows: groups });
      if (query === 'fetchChecklistItems') return Promise.resolve({ success: true, rows: items });
      if (query === 'fetchDeviceBrands') return Promise.resolve({ success: true, rows: [{ id: 1, name: 'BLACKCORE' }, { id: 2, name: 'DELL' }] });
      if (query === 'insertChecklistGroup') {
        const row = { id: 99, name: params[0], brand: params[1], main_count: 0, detail_count: 0 };
        groups = [...groups, row];
        return Promise.resolve({ success: true, rows: [row] });
      }
      if (query === 'insertChecklistItem') {
        const row = { id: 900 + items.length, group_id: params[0], kind: params[1], name: params[2] };
        items = [...items, row];
        return Promise.resolve({ success: true, rows: [row] });
      }
      if (query === 'deleteChecklistItem') {
        items = items.filter((i) => i.id !== params[0]);
        return Promise.resolve({ success: true, rows: [{ id: params[0] }] });
      }
      if (query === 'deleteChecklistGroup') {
        groups = groups.filter((g) => g.id !== params[0]);
        return Promise.resolve({ success: true, rows: [{ id: params[0] }] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
    window.electronAPI = { namedQuery, runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn() };
  });

  const called = (name) => calls.filter((c) => c.query === name);
  const renderPage = () => render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);

  it('列出既有的主項目與各自的項目數', async () => {
    renderPage();
    expect(await screen.findByText('BLACKCORE 出機檢查')).toBeInTheDocument();
    expect(screen.getByText(/主要 2 · 細項 2/)).toBeInTheDocument();
  });

  it('可以新增主項目並指定適用廠牌', async () => {
    renderPage();
    await screen.findByText('BLACKCORE 出機檢查');

    await userEvent.type(screen.getByLabelText('主項目名稱'), 'DELL 出機檢查');
    await userEvent.selectOptions(screen.getByLabelText('適用廠牌'), 'DELL');
    await userEvent.click(screen.getByRole('button', { name: /新增$/ }));

    await waitFor(() => expect(called('insertChecklistGroup')).toHaveLength(1));
    expect(called('insertChecklistGroup')[0].params.slice(0, 2)).toEqual(['DELL 出機檢查', 'DELL']);
  });

  it('不指定廠牌時建立通用主項目', async () => {
    renderPage();
    await screen.findByText('BLACKCORE 出機檢查');

    await userEvent.type(screen.getByLabelText('主項目名稱'), '通用檢查');
    await userEvent.click(screen.getByRole('button', { name: /新增$/ }));

    await waitFor(() => expect(called('insertChecklistGroup')).toHaveLength(1));
    expect(called('insertChecklistGroup')[0].params[1]).toBeNull();
  });

  it('可以在主項目底下新增主要檢查功能', async () => {
    renderPage();
    await userEvent.click(await screen.findByText('BLACKCORE 出機檢查'));

    await userEvent.type(screen.getByPlaceholderText(/BIOS 設定、韌體版本確認/), '風扇轉速');
    await userEvent.click(screen.getByRole('button', { name: '新增主要檢查功能' }));

    await waitFor(() => expect(called('insertChecklistItem')).toHaveLength(1));
    expect(called('insertChecklistItem')[0].params.slice(1, 3)).toEqual(['MAIN', '風扇轉速']);
  });

  it('可以在主項目底下新增細項', async () => {
    renderPage();
    await userEvent.click(await screen.findByText('BLACKCORE 出機檢查'));

    await userEvent.type(screen.getByPlaceholderText(/開機順序、SR-IOV 開啟/), 'IPMI 帳號');
    await userEvent.click(screen.getByRole('button', { name: '新增細項' }));

    await waitFor(() => expect(called('insertChecklistItem')).toHaveLength(1));
    expect(called('insertChecklistItem')[0].params.slice(1, 3)).toEqual(['DETAIL', 'IPMI 帳號']);
  });

  it('可以刪除單一項目', async () => {
    renderPage();
    await userEvent.click(await screen.findByText('BLACKCORE 出機檢查'));

    await userEvent.click(await screen.findByLabelText('刪除 BIOS 設定'));
    await waitFor(() => expect(called('deleteChecklistItem')[0].params).toEqual([21]));
  });

  it('可以刪除整個主項目', async () => {
    renderPage();
    const row = (await screen.findByText('BLACKCORE 出機檢查')).closest('div[style]');
    expect(row).toBeTruthy();

    await userEvent.click(screen.getByLabelText('刪除主項目 BLACKCORE 出機檢查'));
    await waitFor(() => expect(called('deleteChecklistGroup')[0].params).toEqual([2]));
  });

  it('說明清楚寫出刪除範本不會影響已套用的設備', async () => {
    renderPage();
    const notes = await screen.findAllByText(/都不會影響已經套用到設備上的檢查表/);
    expect(notes.length).toBeGreaterThan(0);
  });

  it('切換主項目時只顯示該主項目的項目', async () => {
    renderPage();
    await userEvent.click(await screen.findByText('共通檢查'));

    await waitFor(() => expect(screen.getByText('外觀檢查')).toBeInTheDocument());
    expect(screen.queryByText('BIOS 設定')).not.toBeInTheDocument();
  });
});
