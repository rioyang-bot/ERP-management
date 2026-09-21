import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeviceChecklistModal from '../components/DeviceChecklistModal';
import ChecklistTemplates from '../pages/ChecklistTemplates';

/**
 * 出機檢查表
 *
 * 三條規則最容易在改動中被弄丟，所以在這裡釘住：
 *   1. 主要檢查功能依廠牌自動套用到所有該廠牌的設備，不需逐台操作
 *   2. 細項不自動套用，由每台設備自行挑選或新增
 *   3. 範本被刪掉之後，設備已經套用的內容不會跟著消失
 */
const DEVICE = {
  id: 7, sn: 'DFE322328070001', brand: 'SECRETHFT', model: '3122-SM',
  type: 'SERVER', specification: '26C', hostname: 'NeoTap', client: '凱基',
  location: 'UAT DC', remarks: '', components: [],
};

const GROUPS = [
  { id: 1, name: '共通檢查', brand: null, main_count: 1, detail_count: 0 },
  { id: 2, name: 'SecretHFT 出機檢查', brand: 'SECRETHFT', main_count: 2, detail_count: 2 },
];

const TEMPLATE_ITEMS = [
  { id: 11, group_id: 1, kind: 'MAIN', name: '外觀檢查', group_name: '共通檢查' },
  { id: 21, group_id: 2, kind: 'MAIN', name: 'BIOS 設定', group_name: 'SecretHFT 出機檢查' },
  { id: 22, group_id: 2, kind: 'MAIN', name: '網路設定', group_name: 'SecretHFT 出機檢查' },
  { id: 23, group_id: 2, kind: 'DETAIL', name: '開機順序', group_name: 'SecretHFT 出機檢查' },
  { id: 24, group_id: 2, kind: 'DETAIL', name: 'SR-IOV 開啟', group_name: 'SecretHFT 出機檢查' },
];

/** 主要檢查功能已經由後端自動套用到這台設備的樣子 */
const AUTO_APPLIED = [
  { id: 801, group_name: 'SecretHFT 出機檢查', kind: 'MAIN', item_name: 'BIOS 設定', source_item_id: 21, is_checked: false },
  { id: 802, group_name: 'SecretHFT 出機檢查', kind: 'MAIN', item_name: '網路設定', source_item_id: 22, is_checked: false },
];

describe('出機檢查表：單一設備', () => {
  const namedQuery = vi.fn();
  let calls;
  let assetItems;

  const setup = ({ groups = GROUPS, items = TEMPLATE_ITEMS, applied = AUTO_APPLIED } = {}) => {
    assetItems = [...applied];
    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchChecklistGroups') return Promise.resolve({ success: true, rows: groups });
      if (query === 'fetchChecklistItems') return Promise.resolve({ success: true, rows: items });
      if (query === 'fetchAssetChecklist') return Promise.resolve({ success: true, rows: assetItems });
      if (query === 'syncBrandChecklistToAssets') return Promise.resolve({ success: true, rows: [] });
      if (query === 'insertAssetChecklistItem') {
        const row = {
          id: 1000 + assetItems.length, asset_id: params[0], group_name: params[1],
          kind: params[2], item_name: params[3], source_item_id: params[4],
          sort_order: params[5], is_checked: false,
        };
        assetItems.push(row);
        return Promise.resolve({ success: true, rows: [{ id: row.id }] });
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
  const renderModal = (device = DEVICE) => render(
    <DeviceChecklistModal isOpen device={device} onClose={vi.fn()} onChanged={vi.fn()} />
  );

  describe('主要檢查功能依廠牌自動套用', () => {
    it('開啟時先為這台設備補上該廠牌的主要檢查功能', async () => {
      renderModal();
      await waitFor(() => expect(called('syncBrandChecklistToAssets')[0].params).toEqual([DEVICE.id]));
    });

    it('自動套用的項目直接出現在清單上，不需要按套用', async () => {
      renderModal();
      expect(await screen.findByText('BIOS 設定')).toBeInTheDocument();
      expect(screen.getByText('網路設定')).toBeInTheDocument();
      // 已經沒有「套用到這台設備」這個步驟了
      expect(screen.queryByRole('button', { name: /套用到這台設備/ })).not.toBeInTheDocument();
    });

    it('說明寫清楚是依廠牌自動套用', async () => {
      renderModal();
      expect(await screen.findByText(/主要檢查功能已依廠牌自動套用/)).toBeInTheDocument();
    });

    it('自動套用的項目不可從單台移除，避免移掉又被補回來', async () => {
      renderModal();
      await screen.findByText('BIOS 設定');
      expect(screen.queryByLabelText('移除 BIOS 設定')).not.toBeInTheDocument();
      expect(screen.getAllByTitle(/依廠牌自動套用的項目/).length).toBe(2);
    });

    it('範本已刪除的孤兒項目才可以移除', async () => {
      setup({ applied: [
        { id: 901, group_name: '已刪除的主項目', kind: 'MAIN', item_name: '舊項目', source_item_id: null, is_checked: false },
      ] });
      renderModal();

      await userEvent.click(await screen.findByLabelText('移除 舊項目'));
      await waitFor(() => expect(called('deleteAssetChecklistItem')[0].params).toEqual([901]));
    });
  });

  describe('細項由這台設備自己決定', () => {
    it('細項不會自動出現，要自己勾選加入', async () => {
      renderModal();
      await screen.findByLabelText('主項目');
      // 範本裡有兩個細項，但都還沒加到這台設備上
      const box = await screen.findByRole('checkbox', { name: /開機順序/ });
      expect(box).not.toBeChecked();
    });

    it('只加入勾選的細項', async () => {
      renderModal();
      await screen.findByLabelText('主項目');

      await userEvent.click(await screen.findByRole('checkbox', { name: /開機順序/ }));
      await userEvent.click(screen.getByRole('button', { name: /加入勾選的細項/ }));

      await waitFor(() => expect(called('insertAssetChecklistItem')).toHaveLength(1));
      const [, groupName, kind, name] = called('insertAssetChecklistItem')[0].params;
      expect([groupName, kind, name]).toEqual(['SecretHFT 出機檢查', 'DETAIL', '開機順序']);
    });

    it('沒勾選就按加入時提示要先勾選，不會寫入空的', async () => {
      renderModal();
      await screen.findByLabelText('主項目');

      // 下拉一出現不代表已自動選好主項目，要等按鈕真的渲染出來再按
      await userEvent.click(await screen.findByRole('button', { name: /加入勾選的細項/ }));
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('請先勾選'));
      expect(called('insertAssetChecklistItem')).toHaveLength(0);
    });

    it('可以直接為這台設備新增範本裡沒有的細項', async () => {
      renderModal();
      await screen.findByLabelText('新增這台設備的細項');

      await userEvent.type(screen.getByLabelText('新增這台設備的細項'), '客戶指定 IP 設定');
      await userEvent.click(screen.getByRole('button', { name: /新增細項/ }));

      await waitFor(() => expect(called('insertAssetChecklistItem')).toHaveLength(1));
      const [, , kind, name, sourceId] = called('insertAssetChecklistItem')[0].params;
      expect(kind).toBe('DETAIL');
      expect(name).toBe('客戶指定 IP 設定');
      // 自己新增的沒有範本來源
      expect(sourceId).toBeNull();
    });

    it('自己新增的細項可以移除', async () => {
      setup({ applied: [
        ...AUTO_APPLIED,
        { id: 950, group_name: 'SecretHFT 出機檢查', kind: 'DETAIL', item_name: '客戶指定 IP', source_item_id: null, is_checked: false },
      ] });
      renderModal();

      await userEvent.click(await screen.findByLabelText('移除 客戶指定 IP'));
      await waitFor(() => expect(called('deleteAssetChecklistItem')[0].params).toEqual([950]));
    });

    it('設成自動套用的細項不可從單台移除，避免移掉又被補回來', async () => {
      setup({
        items: TEMPLATE_ITEMS.map((i) => (i.id === 23 ? { ...i, auto_apply: true } : i)),
        applied: [
          ...AUTO_APPLIED,
          { id: 970, group_name: 'SecretHFT 出機檢查', kind: 'DETAIL', item_name: '開機順序', source_item_id: 23, is_checked: false },
          { id: 971, group_name: 'SecretHFT 出機檢查', kind: 'DETAIL', item_name: 'SR-IOV 開啟', source_item_id: 24, is_checked: false },
        ],
      });
      renderModal();
      await screen.findByText('開機順序');

      // 自動套用的那一個沒有移除鈕
      expect(screen.queryByLabelText('移除 開機順序')).not.toBeInTheDocument();
      // 逐台加入的那一個仍可移除
      expect(screen.getByLabelText('移除 SR-IOV 開啟')).toBeInTheDocument();
    });

    it('預設看的是這台設備自己廠牌的那一組', async () => {
      renderModal();
      const select = await screen.findByLabelText('主項目');
      await waitFor(() => expect(select.value).toBe('2'));
      expect(await screen.findByText(/這台設備的廠牌/)).toBeInTheDocument();
    });
  });

  /**
   * 細項記錄的是「這台設備實際是什麼」而不是「做完了沒有」，
   * 例如細項「OS」填「RH9.6」，因此不勾選、改為填內容。
   */
  describe('細項填內容而不是勾選', () => {
    const WITH_DETAIL = [
      ...AUTO_APPLIED,
      { id: 960, group_name: 'SecretHFT 出機檢查', kind: 'DETAIL', item_name: 'OS', content: null, source_item_id: null, is_checked: false },
    ];

    it('細項沒有勾選框', async () => {
      setup({ applied: WITH_DETAIL });
      renderModal();
      await screen.findByText('OS');
      expect(screen.queryByRole('checkbox', { name: 'OS 檢查完成' })).not.toBeInTheDocument();
      // 主要檢查功能仍然有勾選框
      expect(screen.getByRole('checkbox', { name: 'BIOS 設定 檢查完成' })).toBeInTheDocument();
    });

    it('細項旁邊有可填寫的內容欄位', async () => {
      setup({ applied: WITH_DETAIL });
      renderModal();
      expect(await screen.findByLabelText('OS 內容')).toBeInTheDocument();
    });

    it('填好內容離開欄位才寫回資料庫', async () => {
      setup({ applied: WITH_DETAIL });
      renderModal();

      const input = await screen.findByLabelText('OS 內容');
      await userEvent.type(input, 'RH9.6');
      // 還在輸入中不該一直送請求
      expect(called('setAssetChecklistItemContent')).toHaveLength(0);

      await userEvent.tab();
      await waitFor(() => expect(called('setAssetChecklistItemContent')[0].params).toEqual(['RH9.6', 960]));
    });

    it('內容沒改就不會送出多餘的更新', async () => {
      setup({ applied: [{ ...WITH_DETAIL[2], content: 'RH9.6' }] });
      renderModal();

      const input = await screen.findByLabelText('OS 內容');
      await userEvent.click(input);
      await userEvent.tab();
      expect(called('setAssetChecklistItemContent')).toHaveLength(0);
    });

    it('已填的內容會帶出來', async () => {
      setup({ applied: [{ ...WITH_DETAIL[2], content: 'RH9.6' }] });
      renderModal();
      expect((await screen.findByLabelText('OS 內容')).value).toBe('RH9.6');
    });

    it('完成度只算主要檢查功能，細項不影響', async () => {
      setup({ applied: [
        { ...AUTO_APPLIED[0], is_checked: true },
        { ...AUTO_APPLIED[1], is_checked: true },
        WITH_DETAIL[2],
      ] });
      renderModal();
      expect(await screen.findByText(/已完成 2 \/ 2/)).toBeInTheDocument();
    });
  });

  describe('勾選檢查完成', () => {
    it('勾選會存回資料庫', async () => {
      renderModal();
      await userEvent.click(await screen.findByRole('checkbox', { name: 'BIOS 設定 檢查完成' }));
      await waitFor(() => expect(called('setAssetChecklistItemChecked')[0].params).toEqual([true, 801]));
    });

    it('再勾一次會取消完成', async () => {
      setup({ applied: [{ ...AUTO_APPLIED[0], is_checked: true }] });
      renderModal();
      await userEvent.click(await screen.findByRole('checkbox', { name: 'BIOS 設定 檢查完成' }));
      await waitFor(() => expect(called('setAssetChecklistItemChecked')[0].params).toEqual([false, 801]));
    });

    it('顯示完成進度', async () => {
      setup({ applied: [
        { ...AUTO_APPLIED[0], is_checked: true },
        { ...AUTO_APPLIED[1], is_checked: false },
      ] });
      renderModal();
      expect(await screen.findByText(/已完成 1 \/ 2/)).toBeInTheDocument();
    });
  });

  /** 需求：範本被刪掉，設備已套用的內容不能跟著消失 */
  describe('範本刪掉之後', () => {
    it('設備已套用的項目仍然看得到、也還能勾選', async () => {
      setup({
        groups: [],
        items: [],
        applied: [
          { id: 601, group_name: '已刪除的主項目', kind: 'MAIN', item_name: 'BIOS 設定', source_item_id: null, is_checked: true },
          { id: 602, group_name: '已刪除的主項目', kind: 'DETAIL', item_name: '開機順序', source_item_id: null, is_checked: false },
        ],
      });
      renderModal();

      expect(await screen.findByText('BIOS 設定')).toBeInTheDocument();
      expect(screen.getByText('開機順序')).toBeInTheDocument();

      // 主要檢查功能仍可勾選
      await userEvent.click(screen.getByRole('checkbox', { name: 'BIOS 設定 檢查完成' }));
      await waitFor(() => expect(called('setAssetChecklistItemChecked')[0].params).toEqual([false, 601]));

      // 細項仍可填內容
      await userEvent.type(screen.getByLabelText('開機順序 內容'), 'NVMe 優先');
      await userEvent.tab();
      await waitFor(() => expect(called('setAssetChecklistItemContent')[0].params).toEqual(['NVMe 優先', 602]));
    });

    it('整組都沒有範本了才提供整組移除', async () => {
      setup({
        applied: [
          { id: 701, group_name: '已刪除的主項目', kind: 'MAIN', item_name: 'A', source_item_id: null, is_checked: false },
        ],
      });
      renderModal();
      expect(await screen.findByRole('button', { name: /移除整組/ })).toBeInTheDocument();
    });

    it('還連著範本的那一組不提供整組移除', async () => {
      renderModal();
      await screen.findByText('BIOS 設定');
      expect(screen.queryByRole('button', { name: /移除整組/ })).not.toBeInTheDocument();
    });
  });

  it('沒有任何項目時提示去報表中心建立', async () => {
    setup({ groups: [], items: [], applied: [] });
    renderModal();
    expect(await screen.findByText(/請先到「報表中心 → 出機檢查表」為/)).toBeInTheDocument();
  });

  it('沒有任何項目時不可列印', async () => {
    setup({ groups: [], items: [], applied: [] });
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
      if (query === 'fetchDeviceBrands') return Promise.resolve({ success: true, rows: [{ id: 1, name: 'SECRETHFT' }, { id: 2, name: 'DELL' }] });
      if (query === 'syncBrandChecklistToAssets') {
        // 假裝補了 15 台設備
        return Promise.resolve({ success: true, rows: Array.from({ length: 15 }, (_, i) => ({ id: i, asset_id: i })) });
      }
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
      return Promise.resolve({ success: true, rows: [{ id: 1 }] });
    });
    window.electronAPI = { namedQuery, runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn() };
  });

  const called = (name) => calls.filter((c) => c.query === name);
  const renderPage = () => render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);

  it('列出既有的主項目與各自的項目數', async () => {
    renderPage();
    expect(await screen.findByText('SecretHFT 出機檢查')).toBeInTheDocument();
    expect(screen.getByText(/主要 2 · 細項 2/)).toBeInTheDocument();
  });

  it('可以新增主項目並指定適用廠牌', async () => {
    renderPage();
    await screen.findByText('SecretHFT 出機檢查');

    await userEvent.type(screen.getByLabelText('主項目名稱'), 'DELL 出機檢查');
    await userEvent.selectOptions(screen.getByLabelText('適用廠牌'), 'DELL');
    await userEvent.click(screen.getByRole('button', { name: /新增$/ }));

    await waitFor(() => expect(called('insertChecklistGroup')).toHaveLength(1));
    expect(called('insertChecklistGroup')[0].params.slice(0, 2)).toEqual(['DELL 出機檢查', 'DELL']);
  });

  it('不指定廠牌時建立通用主項目', async () => {
    renderPage();
    await screen.findByText('SecretHFT 出機檢查');

    await userEvent.type(screen.getByLabelText('主項目名稱'), '通用檢查');
    await userEvent.click(screen.getByRole('button', { name: /新增$/ }));

    await waitFor(() => expect(called('insertChecklistGroup')).toHaveLength(1));
    expect(called('insertChecklistGroup')[0].params[1]).toBeNull();
  });

  describe('新增主要檢查功能後自動套用到該廠牌的所有設備', () => {
    it('新增後立刻同步', async () => {
      renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));

      await userEvent.type(screen.getByPlaceholderText(/BIOS 設定、韌體版本確認/), '風扇轉速');
      await userEvent.click(screen.getByRole('button', { name: '新增主要檢查功能' }));

      await waitFor(() => expect(called('insertChecklistItem')).toHaveLength(1));
      expect(called('insertChecklistItem')[0].params.slice(1, 3)).toEqual(['MAIN', '風扇轉速']);
      await waitFor(() => expect(called('syncBrandChecklistToAssets').length).toBeGreaterThan(0));
    });

    it('告訴使用者套用到幾台設備', async () => {
      renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));

      await userEvent.type(screen.getByPlaceholderText(/BIOS 設定、韌體版本確認/), '風扇轉速');
      await userEvent.click(screen.getByRole('button', { name: '新增主要檢查功能' }));

      expect(await screen.findByText(/已套用到 15 台/)).toBeInTheDocument();
    });

    it('新增細項不會觸發自動套用', async () => {
      renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));

      await userEvent.type(screen.getByPlaceholderText(/欄位名稱，例如：OS/), 'IPMI 帳號');
      await userEvent.click(screen.getByRole('button', { name: '新增細項' }));

      await waitFor(() => expect(called('insertChecklistItem')).toHaveLength(1));
      expect(called('insertChecklistItem')[0].params.slice(1, 3)).toEqual(['DETAIL', 'IPMI 帳號']);
      expect(called('syncBrandChecklistToAssets')).toHaveLength(0);
    });
  });

  /**
   * 細項逐台加太費工：像 OS、BMC IP 這種每台都要填的欄位，
   * 勾起來就跟主要檢查功能一樣自動套用到該廠牌的每一台設備。
   */
  describe('細項也可以設成自動套用', () => {
    it('每個細項前面都有自動套用的勾選框', async () => {
      renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));
      expect(await screen.findByLabelText('開機順序 自動套用到所有設備')).toBeInTheDocument();
      expect(screen.getByLabelText('SR-IOV 開啟 自動套用到所有設備')).toBeInTheDocument();
    });

    it('主要檢查功能沒有這個勾選框，它本來就一定自動套用', async () => {
      renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));
      await screen.findByText('BIOS 設定');
      expect(screen.queryByLabelText('BIOS 設定 自動套用到所有設備')).not.toBeInTheDocument();
    });

    it('勾選後寫回設定並立刻同步到設備', async () => {
      renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));

      await userEvent.click(await screen.findByLabelText('開機順序 自動套用到所有設備'));

      await waitFor(() => expect(called('setChecklistItemAutoApply')[0].params).toEqual([true, 23]));
      await waitFor(() => expect(called('syncBrandChecklistToAssets').length).toBeGreaterThan(0));
      expect(await screen.findByText(/「開機順序」已套用到 15 台設備/)).toBeInTheDocument();
    });

    it('取消勾選時說明已發出去的仍保留在各設備上', async () => {
      items = items.map((i) => (i.id === 23 ? { ...i, auto_apply: true } : i));
      renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));

      await userEvent.click(await screen.findByLabelText('開機順序 自動套用到所有設備'));

      await waitFor(() => expect(called('setChecklistItemAutoApply')[0].params).toEqual([false, 23]));
      expect(await screen.findByText(/已經發出去的仍保留在各設備上/)).toBeInTheDocument();
    });

    it('已設為自動套用的細項會標示出來', async () => {
      items = items.map((i) => (i.id === 23 ? { ...i, auto_apply: true } : i));
      renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));
      expect(await screen.findByText('自動套用')).toBeInTheDocument();
    });
  });

  /**
   * 拖曳排序
   *
   * 排序規則本身有另一支單元測試，這裡驗證的是「畫面真的有接上」——
   * 規則對但沒接上，使用者拖了半天順序還是原樣。
   */
  describe('拖曳調整順序', () => {
    /** 以假的 dataTransfer 模擬把某一列拖到另一列上 */
    const dragOnto = (container, sourceText, targetText) => {
      const rows = [...container.querySelectorAll('[draggable="true"]')];
      const source = rows.find((r) => r.textContent.includes(sourceText));
      const target = rows.find((r) => r.textContent.includes(targetText));
      expect(source).toBeTruthy();
      expect(target).toBeTruthy();
      const dataTransfer = { setData: vi.fn(), getData: () => '', effectAllowed: '' };
      fireEvent.dragStart(source, { dataTransfer });
      fireEvent.dragOver(target, { dataTransfer });
      fireEvent.drop(target, { dataTransfer });
    };

    it('主要檢查功能可以拖曳，而且順序寫得回去', async () => {
      const { container } = renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));
      await screen.findByText('BIOS 設定');

      dragOnto(container, 'BIOS 設定', '網路設定');

      // 21 = BIOS 設定、22 = 網路設定；拖到網路設定的位置後兩者互換
      await waitFor(() => expect(called('reorderChecklistItems')[0].params).toEqual(['22,21']));
    });

    it('細項也可以拖曳排序', async () => {
      const { container } = renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));
      await screen.findByText('開機順序');

      dragOnto(container, 'SR-IOV 開啟', '開機順序');

      await waitFor(() => expect(called('reorderChecklistItems')[0].params).toEqual(['24,23']));
    });

    it('排完順序會一併同步到設備上已套用的項目', async () => {
      const { container } = renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));
      await screen.findByText('BIOS 設定');

      dragOnto(container, 'BIOS 設定', '網路設定');

      await waitFor(() => expect(called('syncAssetChecklistOrderBySource').length).toBeGreaterThan(0));
    });

    /**
     * 使用者回報「順序會亂跳」。
     *
     * 調整順序只改 sort_order、不動 items 陣列的排列，而畫面顯示的是排序後的
     * 結果。若拿陣列原順序當基準，第一次拖完兩者就對不起來，第二次拖會依舊的
     * 順序去算，落點自然莫名其妙。
     */
    it('連續拖曳兩次，第二次的基準是畫面上看到的順序', async () => {
      items = [
        ...TEMPLATE_ITEMS,
        { id: 25, group_id: 2, kind: 'MAIN', name: '韌體版本', group_name: 'SecretHFT 出機檢查' },
      ];
      const { container } = renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));
      await screen.findByText('韌體版本');

      // 初始 21 → 22 → 25；把 21 拖到 25 的位置
      dragOnto(container, 'BIOS 設定', '韌體版本');
      await waitFor(() => expect(called('reorderChecklistItems')[0].params).toEqual(['22,25,21']));

      // 此時畫面是 22 → 25 → 21；把 22 拖到 21 的位置
      dragOnto(container, '網路設定', 'BIOS 設定');
      await waitFor(() => expect(called('reorderChecklistItems')).toHaveLength(2));
      expect(called('reorderChecklistItems')[1].params).toEqual(['25,21,22']);
    });

    it('拖曳後畫面立刻換成新的順序，不必等伺服器', async () => {
      const { container } = renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));
      await screen.findByText('BIOS 設定');

      dragOnto(container, 'BIOS 設定', '網路設定');

      await waitFor(() => {
        const names = [...container.querySelectorAll('[draggable="true"]')]
          .map((r) => r.textContent)
          .filter((t) => t.includes('BIOS 設定') || t.includes('網路設定'));
        expect(names[0]).toContain('網路設定');
        expect(names[1]).toContain('BIOS 設定');
      });
    });

    it('主要檢查功能與細項不會互相拖曳', async () => {
      const { container } = renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));
      await screen.findByText('BIOS 設定');

      // 把主要檢查功能拖到細項上
      dragOnto(container, 'BIOS 設定', '開機順序');

      await waitFor(() => {});
      expect(called('reorderChecklistItems')).toHaveLength(0);
    });
  });

  describe('改名時設備端跟著改', () => {
    it('項目改名會同步更新已套用的名稱', async () => {
      renderPage();
      await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));

      await userEvent.click(await screen.findByLabelText('修改 BIOS 設定'));
      const input = screen.getByDisplayValue('BIOS 設定');
      await userEvent.clear(input);
      await userEvent.type(input, 'BIOS 設定與版本');
      await userEvent.click(screen.getByLabelText('儲存項目'));

      await waitFor(() => expect(called('renameAssetChecklistItemsBySource')[0].params).toEqual(['BIOS 設定與版本', 21]));
    });

    it('主項目改名會同步更新設備端的分組名稱', async () => {
      renderPage();
      await screen.findByText('SecretHFT 出機檢查');

      await userEvent.click(screen.getByLabelText('修改主項目 SecretHFT 出機檢查'));
      const input = screen.getByDisplayValue('SecretHFT 出機檢查');
      await userEvent.clear(input);
      await userEvent.type(input, 'SecretHFT 交機檢查');
      await userEvent.click(screen.getByLabelText('儲存主項目'));

      await waitFor(() => expect(called('renameAssetChecklistGroupBySource')[0].params).toEqual(['SecretHFT 交機檢查', 2]));
    });
  });

  it('可以刪除單一項目', async () => {
    renderPage();
    await userEvent.click(await screen.findByText('SecretHFT 出機檢查'));

    await userEvent.click(await screen.findByLabelText('刪除 BIOS 設定'));
    await waitFor(() => expect(called('deleteChecklistItem')[0].params).toEqual([21]));
  });

  it('可以刪除整個主項目', async () => {
    renderPage();
    await screen.findByText('SecretHFT 出機檢查');

    await userEvent.click(screen.getByLabelText('刪除主項目 SecretHFT 出機檢查'));
    await waitFor(() => expect(called('deleteChecklistGroup')[0].params).toEqual([2]));
  });

  it('說明寫清楚該廠牌所有設備都會自動套用', async () => {
    renderPage();
    expect(await screen.findByText(/該廠牌的每一台設備都會自動套用/)).toBeInTheDocument();
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
