import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { buildChecklistSheet } from '../utils/checklistSheet';
import { createChecklistDocument } from '../utils/checklistDocx';
import { ALL_SECTIONS } from '../utils/checklistSections';
import DeviceChecklistModal from '../components/DeviceChecklistModal';

/**
 * 出機檢查表：勾選要列印／匯出 Word 的區塊（設備資訊、搭載硬體、主機照片、檢查項目、細項紀錄、MAC 表）
 * 不必每次全部輸出；勾選結果存在個人偏好設定，下次打開沿用。
 */
const DEVICE = {
  id: 51, sn: 'NEO264300002', type: 'SWITCH', brand: 'LDA', model: 'FIREWALL', specification: '1U', client: 'KGI', location: 'IDC',
  components: [{ brand: 'INTEL', model: 'X710', sn: 'NIC-1' }],
};
const ITEMS = [
  { id: 1, group_name: 'LDA FIREWALL', kind: 'MAIN', item_name: 'Port 測試', is_checked: true },
  { id: 2, group_name: 'LDA FIREWALL', kind: 'DETAIL', item_name: 'OS', content: 'RH9.6' },
  { id: 3, group_name: 'LDA FIREWALL', kind: 'PHOTO', item_name: '正面', photo_count: 1 },
];
const only = (...ids) => Object.fromEntries(Object.keys(ALL_SECTIONS).map((k) => [k, ids.includes(k)]));

const docText = async (doc) => {
  const xml = await (await JSZip.loadAsync(await Packer.toBuffer(doc))).file('word/document.xml').async('string');
  return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
};

describe('列印：只印勾選的區塊', () => {
  it('預設全部都印', () => {
    const { body } = buildChecklistSheet(DEVICE, ITEMS);
    for (const s of ['設備序號', '搭載硬體', 'INTEL X710', '檢查項目（共 1 項', '細項紀錄', '拍照項目（共 1 項']) expect(body).toContain(s);
  });

  it('只勾檢查項目與細項紀錄', () => {
    const { body } = buildChecklistSheet(DEVICE, ITEMS, { sections: only('checks', 'details') });
    expect(body).toContain('檢查項目（共 1 項');
    expect(body).toContain('RH9.6');
    for (const s of ['設備序號', '搭載硬體', '拍照項目', 'info-table']) expect(body).not.toContain(s);
  });

  it('設備資訊與搭載硬體各自獨立：只勾搭載硬體就只有那一列', () => {
    const { body } = buildChecklistSheet(DEVICE, ITEMS, { sections: only('hardware') });
    expect(body).toContain('搭載硬體');
    expect(body).toContain('INTEL X710（SN: NIC-1）');
    expect(body).not.toContain('設備序號');
    expect(body).not.toContain('檢查項目');
  });
});

describe('Word：只放勾選的區塊', () => {
  it('不勾主機照片：沒有照片區，也不讀照片', async () => {
    const loadImage = vi.fn();
    const photos = [{ id: 9, file_name: 'a.jpg', original_name: 'a.jpg', checklist_item_id: 3 }];
    const { doc } = await createChecklistDocument(DEVICE, ITEMS, photos, { loadImage, sections: only('info', 'checks') });
    const text = await docText(doc);
    expect(text).toContain('設備序號');
    expect(text).toContain('Port 測試');
    expect(text).not.toContain('照片（共');
    expect(text).not.toContain('細項紀錄');
    expect(text).not.toContain('搭載硬體');
    expect(loadImage).not.toHaveBeenCalled();
  });
});

describe('出機檢查表視窗：輸出內容勾選', () => {
  let prefs;
  beforeEach(() => {
    vi.clearAllMocks();
    prefs = { checklistExportSections: null };
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    window.electronAPI = {
      runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn(),
      getUserPreference: vi.fn(async (key) => ({ success: true, value: prefs[key] })),
      setUserPreference: vi.fn(async (key, value) => { prefs[key] = value; return { success: true }; }),
      namedQuery: vi.fn(async (query) => {
        if (query === 'fetchChecklistGroups') return { success: true, rows: [{ id: 3, name: 'LDA FIREWALL', brand: 'LDA', model: 'FIREWALL', mac_table: true }] };
        if (query === 'fetchAssetChecklist') return { success: true, rows: ITEMS };
        if (query === 'fetchAssetMacInfo') return { success: true, rows: [{ asset_id: 51, base_mac: 'a0:19:b2:c0:c5:95' }] };
        return { success: true, rows: [] };
      }),
    };
  });

  const open = async () => {
    render(<DeviceChecklistModal isOpen device={DEVICE} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByText('Port 測試');
    return screen.getByTestId('checklist-section-picker');
  };

  it('列出六個區塊（需要 MAC 表的設備才有 MAC 表），預設全勾', async () => {
    const picker = await open();
    const boxes = within(picker).getAllByRole('checkbox');
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(
      ['輸出 設備資訊', '輸出 搭載硬體', '輸出 主機照片', '輸出 檢查項目', '輸出 細項紀錄', '輸出 MAC 表']);
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  it('取消勾選後存進個人偏好，列印預覽只印勾選的區塊', async () => {
    const picker = await open();
    await userEvent.click(within(picker).getByLabelText('輸出 設備資訊'));
    await userEvent.click(within(picker).getByLabelText('輸出 MAC 表'));
    await waitFor(() => expect(window.electronAPI.setUserPreference).toHaveBeenLastCalledWith('checklistExportSections', ['info', 'mac']));

    await userEvent.click(screen.getByRole('button', { name: /^列印$/ }));
    const frame = await screen.findByTitle('出機檢查表預覽');
    const html = frame.getAttribute('srcdoc');
    expect(html).not.toContain('設備序號');
    expect(html).not.toContain('mac-page');
    expect(html).toContain('搭載硬體');
    expect(html).toContain('Port 測試');
  });

  it('上次的勾選下次打開沿用', async () => {
    prefs.checklistExportSections = ['photos', 'details'];
    const picker = await open();
    await waitFor(() => expect(within(picker).getByLabelText('輸出 主機照片')).not.toBeChecked());
    expect(within(picker).getByLabelText('輸出 細項紀錄')).not.toBeChecked();
    expect(within(picker).getByLabelText('輸出 檢查項目')).toBeChecked();
  });

  it('只勾 MAC 表：列印只有 MAC 表那一頁', async () => {
    prefs.checklistExportSections = ['info', 'hardware', 'photos', 'checks', 'details'];
    await open();
    await waitFor(() => expect(screen.getByLabelText('輸出 設備資訊')).not.toBeChecked());
    await userEvent.click(screen.getByRole('button', { name: /^列印$/ }));
    const html = (await screen.findByTitle('出機檢查表預覽')).getAttribute('srcdoc');
    expect(html).toContain('MAC Address Information');
    expect(html).not.toContain('出機檢查表</h1>');
  });

  it('全部不勾：列印與匯出 Word 都不能按，並提示至少勾選一項', async () => {
    prefs.checklistExportSections = ['info', 'hardware', 'photos', 'checks', 'details', 'mac'];
    await open();
    await waitFor(() => expect(screen.getByText('請至少勾選一項')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^列印$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /匯出 Word/ })).toBeDisabled();
  });

  it('列印預覽裡也能改勾選，預覽跟著變', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: /^列印$/ }));
    const frame = await screen.findByTitle('出機檢查表預覽');
    expect(frame.getAttribute('srcdoc')).toContain('細項紀錄');
    const pickers = screen.getAllByTestId('checklist-section-picker');
    await userEvent.click(within(pickers[pickers.length - 1]).getByLabelText('輸出 細項紀錄'));
    await waitFor(() => expect(screen.getByTitle('出機檢查表預覽').getAttribute('srcdoc')).not.toContain('細項紀錄'));
    // 兩邊是同一份勾選
    expect(within(pickers[0]).getByLabelText('輸出 細項紀錄')).not.toBeChecked();
  });
});
