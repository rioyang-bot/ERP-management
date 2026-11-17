import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeviceChecklistModal from '../components/DeviceChecklistModal';

/**
 * 出機檢查表的 MAC Address Information 區塊
 *
 * 主項目勾了「需要 MAC 表」的設備（先勾 LDA · FIREWALL）才出現；輸入 P1 其他埠自動算出，
 * MGT 由管理者自行填寫。與主機名稱一樣按「儲存變更」才寫回，事件紀錄寫「舊 → 新」。
 */
const FIREWALL = { id: 51, sn: 'NEO264300002', brand: 'LDA', model: 'FIREWALL', type: 'SWITCH', components: [] };
const L1 = { ...FIREWALL, id: 52, sn: 'DFE422428100005', model: 'L1' };
const GROUPS = [
  { id: 3, name: 'LDA FIREWALL', brand: 'LDA', model: 'FIREWALL', mac_table: true },
  { id: 4, name: 'LDA L1', brand: 'LDA', model: 'L1', mac_table: false },
];
const APPLIED = [{ id: 901, group_name: 'LDA FIREWALL', kind: 'MAIN', item_name: 'Port 測試', source_item_id: 31, is_checked: false }];

describe('出機檢查表：MAC 表', () => {
  let calls;
  let stored;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    stored = null;
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    localStorage.setItem('erp_session', JSON.stringify({ id: 1, full_name: '王小明', role: 'ADMIN' }));
    window.electronAPI = {
      runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn(),
      namedQuery: vi.fn(async (query, params) => {
        calls.push({ query, params });
        if (query === 'fetchChecklistGroups') return { success: true, rows: GROUPS };
        if (query === 'fetchAssetChecklist') return { success: true, rows: APPLIED };
        if (query === 'fetchAssetMacInfo') return { success: true, rows: stored ? [stored] : [] };
        if (query === 'upsertAssetMacInfo') {
          const prev = stored || {};
          stored = { asset_id: params[0], base_mac: params[1] || null, mgt_lan_mac: params[2] || null, mgt_ipmi_mac: params[3] || null };
          return {
            success: true,
            rows: [{ ...stored, prev_base_mac: prev.base_mac || null, prev_mgt_lan_mac: prev.mgt_lan_mac || null, prev_mgt_ipmi_mac: prev.mgt_ipmi_mac || null }],
          };
        }
        return { success: true, rows: [] };
      }),
    };
  });

  const called = (name) => calls.filter((c) => c.query === name);
  const audits = () => called('insertAuditLog').map((c) => ({ summary: c.params[8], details: c.params[9] }));
  const renderModal = async (device = FIREWALL) => {
    render(<DeviceChecklistModal isOpen device={device} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByText('Port 測試');
  };
  const p1 = () => screen.getByLabelText('P1 MAC (Server Port)');

  it('不需要 MAC 表的設備沒有這一區，也不去讀 MAC', async () => {
    await renderModal(L1);
    expect(screen.queryByTestId('checklist-mac-section')).toBeNull();
    expect(called('fetchAssetMacInfo')).toHaveLength(0);
  });

  it('LDA FIREWALL：輸入 P1，其他埠與 OUI 立刻算出', async () => {
    await renderModal();
    expect(called('fetchAssetMacInfo')[0].params).toEqual([51]);
    await userEvent.type(p1(), 'A0-19-B2-C0-C5-95');
    expect(screen.getByTestId('mac-oui')).toHaveTextContent('OUI: LDA Technologies : a0:19:b2:c0');
    const table = screen.getByTestId('mac-table');
    expect(within(table).getByText('P29,P30').closest('tr')).toHaveTextContent('a0:19:b2:c0:c5:b1a0:19:b2:c0:c5:b2');
    expect(within(table).getByText('P37,P38').closest('tr')).toHaveTextContent('a0:19:b2:c0:c5:ba');
    expect(screen.getByText('有 1 項變更尚未儲存')).toBeInTheDocument();
  });

  it('儲存：整理成小寫冒號寫回，事件紀錄寫變更前 → 變更後', async () => {
    await renderModal();
    await userEvent.type(p1(), 'A019B2C0C595');
    await userEvent.type(screen.getByLabelText('MGT LAN MAC'), '9C-6B-00-C5-13-BE');
    await userEvent.click(screen.getByRole('button', { name: /儲存變更/ }));

    await waitFor(() => expect(called('upsertAssetMacInfo')).toHaveLength(1));
    expect(called('upsertAssetMacInfo')[0].params).toEqual([51, 'a0:19:b2:c0:c5:95', '9c:6b:00:c5:13:be', '', '王小明']);
    await waitFor(() => expect(audits().length).toBeGreaterThan(0));
    const log = audits().find((a) => a.summary.includes('MAC Address Information'));
    expect(log.summary).toBe('設備 [NEO264300002] 於出機檢查表更新 MAC Address Information：MAC 表 P1：（空白） → a0:19:b2:c0:c5:95；MAC 表 MGT LAN：（空白） → 9c:6b:00:c5:13:be');
    // 只改 MAC，沒有勾選變更就不多記一筆空的
    expect(audits().filter((a) => a.summary.includes('出機檢查表更新') && a.summary.includes(' 項'))).toHaveLength(0);
    await waitFor(() => expect(p1()).toHaveValue('a0:19:b2:c0:c5:95'));
    expect(screen.queryByText(/變更尚未儲存/)).toBeNull();
  });

  it('改既有的值：舊值取資料庫原本那一筆', async () => {
    stored = { asset_id: 51, base_mac: 'a0:19:b2:c0:c5:95', mgt_lan_mac: null, mgt_ipmi_mac: null };
    await renderModal();
    await waitFor(() => expect(p1()).toHaveValue('a0:19:b2:c0:c5:95'));
    await userEvent.clear(p1());
    await userEvent.type(p1(), 'a0:19:b2:c0:c6:01');
    await userEvent.click(screen.getByRole('button', { name: /儲存變更/ }));
    await waitFor(() => expect(audits().some((a) => a.summary.includes('MAC 表 P1：a0:19:b2:c0:c5:95 → a0:19:b2:c0:c6:01'))).toBe(true));
  });

  it('只改大小寫或分隔符號不算變更', async () => {
    stored = { asset_id: 51, base_mac: 'a0:19:b2:c0:c5:95' };
    await renderModal();
    await waitFor(() => expect(p1()).toHaveValue('a0:19:b2:c0:c5:95'));
    await userEvent.clear(p1());
    await userEvent.type(p1(), 'A0-19-B2-C0-C5-95');
    expect(screen.queryByText(/變更尚未儲存/)).toBeNull();
  });

  it('格式不正確：提示並且不寫入', async () => {
    await renderModal();
    await userEvent.type(p1(), 'a0:19:b2:c0:c5:bw');
    expect(screen.getByRole('alert')).toHaveTextContent('MAC 格式不正確');
    await userEvent.click(screen.getByRole('button', { name: /儲存變更/ }));
    expect(window.alert.mock.calls[0][0]).toContain('P1 MAC (Server Port)');
    expect(called('upsertAssetMacInfo')).toHaveLength(0);
  });

  it('列印 MAC 表：只有這一頁的預覽', async () => {
    await renderModal();
    await userEvent.type(p1(), 'a0:19:b2:c0:c5:95');
    await userEvent.click(screen.getByRole('button', { name: /列印 MAC 表/ }));
    const frame = await screen.findByTitle('MAC Address Information 預覽');
    expect(frame.getAttribute('srcdoc')).toContain('SN:&nbsp; NEO264300002');
    expect(frame.getAttribute('srcdoc')).toContain('a0:19:b2:c0:c5:ba');
    expect(frame.getAttribute('srcdoc')).not.toContain('出機檢查表</h1>');
  });

  it('整份出機檢查表列印：最後附上 MAC 表', async () => {
    await renderModal();
    await userEvent.type(p1(), 'a0:19:b2:c0:c5:95');
    await userEvent.click(screen.getByRole('button', { name: /^列印$/ }));
    const frame = await screen.findByTitle('出機檢查表預覽');
    expect(frame.getAttribute('srcdoc')).toContain('出機檢查表</h1>');
    expect(frame.getAttribute('srcdoc')).toContain('class="mac-page appended"');
  });
});
