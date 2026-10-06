import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ChecklistTemplates from '../pages/ChecklistTemplates';
import DeviceChecklistModal from '../components/DeviceChecklistModal';
import { FREE_TEXT_PARAMS } from '../../server/freeTextParams.js';
import { queries } from '../../database/queries';

/**
 * 出機檢查表：主要檢查功能與細項比照拍照項目，可以附說明
 *
 * 說明在範本上新增、修改，套用到設備時一起帶過去，
 * 設備的檢查表上顯示在項目名稱底下，讓檢查的人知道要看什麼。
 */
const GROUP = { id: 2, name: 'BlackCore 出機檢查表', brand: 'BLACKCORE', model: null, main_count: 1, detail_count: 1, photo_count: 1 };
const ITEMS = [
  { id: 61, group_id: 2, kind: 'MAIN', name: 'BIOS 設定', description: 'Boot Mode 設為 UEFI' },
  { id: 62, group_id: 2, kind: 'DETAIL', name: 'OS', description: null },
  { id: 63, group_id: 2, kind: 'PHOTO', name: '正面', description: '關機狀態' },
];

describe('範本頁', () => {
  let calls;
  const called = (name) => calls.filter((c) => c.query === name);
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.electronAPI = {
      getDashboardStats: vi.fn(),
      runTransaction: vi.fn(),
      namedQuery: vi.fn(async (query, params) => {
        calls.push({ query, params });
        if (query === 'fetchChecklistGroups') return { success: true, rows: [GROUP] };
        if (query === 'fetchChecklistItems') return { success: true, rows: ITEMS };
        if (query === 'insertChecklistItem') return { success: true, rows: [{ id: 99 }] };
        if (query === 'updateChecklistItemName' || query === 'updateChecklistItemDescription') return { success: true, rows: [{ id: params[1] }] };
        return { success: true, rows: [] };
      }),
    };
  });

  const renderPage = async () => {
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    await screen.findByText('BIOS 設定');
  };

  it('三種項目都有說明欄', async () => {
    await renderPage();
    for (const label of ['主要檢查功能說明', '細項說明', '拍照項目說明']) {
      expect(screen.getByLabelText(label).tagName).toBe('TEXTAREA');
    }
  });

  it('主要檢查功能的說明顯示在名稱底下', async () => {
    await renderPage();
    expect(screen.getByText('Boot Mode 設為 UEFI')).toBeInTheDocument();
  });

  it('新增主要檢查功能時一併送出說明', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByLabelText('主要檢查功能名稱')).toBeEnabled());
    await userEvent.type(screen.getByLabelText('主要檢查功能名稱'), '韌體版本');
    await userEvent.type(screen.getByLabelText('主要檢查功能說明'), 'BMC 2.10 以上');
    await userEvent.click(screen.getByRole('button', { name: '新增主要檢查功能' }));
    await waitFor(() => expect(called('insertChecklistItem')).toHaveLength(1));
    expect(called('insertChecklistItem')[0].params).toEqual([2, 'MAIN', '韌體版本', 1, 'BMC 2.10 以上']);
  });

  it('細項也可以修改說明，設備上的同一項跟著更新', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '修改 OS' }));
    await userEvent.type(screen.getByLabelText('修改細項說明'), '作業系統與版本');
    await userEvent.click(screen.getByRole('button', { name: '儲存項目' }));
    await waitFor(() => expect(called('syncAssetChecklistDescriptionBySource')).toHaveLength(1));
    expect(called('updateChecklistItemDescription')[0].params).toEqual(['作業系統與版本', 62]);
    expect(called('syncAssetChecklistDescriptionBySource')[0].params).toEqual(['作業系統與版本', 62]);
  });

  it('說明沒改就不更新說明', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '修改 BIOS 設定' }));
    expect(screen.getByLabelText('修改主要檢查功能說明')).toHaveValue('Boot Mode 設為 UEFI');
    await userEvent.click(screen.getByRole('button', { name: '儲存項目' }));
    await waitFor(() => expect(called('updateChecklistItemName')).toHaveLength(1));
    expect(called('updateChecklistItemDescription')).toHaveLength(0);
  });

  it('說明是自由文字，不刪特殊字元（三種共用同一支查詢）', () => {
    expect(FREE_TEXT_PARAMS.insertChecklistItem).toEqual([4]);
    expect(FREE_TEXT_PARAMS.updateChecklistItemDescription).toEqual([0]);
    // 套用到設備時三種都帶說明
    expect(queries.syncBrandChecklistToAssets).toContain('i.description');
  });
});

describe('設備的檢查表', () => {
  const DEVICE = { id: 7, sn: 'BC001', brand: 'BLACKCORE', model: '3122-SM', components: [] };
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn(),
      namedQuery: vi.fn(async (query) => {
        if (query === 'fetchChecklistGroups') return { success: true, rows: [GROUP] };
        if (query === 'fetchChecklistItems') return { success: true, rows: ITEMS };
        if (query === 'fetchAssetChecklist') {
          return {
            success: true,
            rows: [
              { id: 801, group_name: GROUP.name, kind: 'MAIN', item_name: 'BIOS 設定', source_item_id: 61, is_checked: false, description: 'Boot Mode 設為 UEFI\n關閉 Secure Boot' },
              { id: 802, group_name: GROUP.name, kind: 'DETAIL', item_name: 'OS', source_item_id: 62, content: '', description: '作業系統與版本' },
              { id: 803, group_name: GROUP.name, kind: 'DETAIL', item_name: 'BMC IP', source_item_id: null, content: '', description: null },
            ],
          };
        }
        return { success: true, rows: [] };
      }),
    };
  });

  it('主要檢查功能與細項的說明顯示在名稱底下，沒有說明的不多一行', async () => {
    render(<DeviceChecklistModal isOpen device={DEVICE} onClose={vi.fn()} onChanged={vi.fn()} />);
    const main = await screen.findByTestId('checklist-desc-801');
    expect(main.textContent).toBe('Boot Mode 設為 UEFI\n關閉 Secure Boot');
    expect(main.style.whiteSpace).toBe('pre-wrap');
    expect(screen.getByTestId('checklist-desc-802')).toHaveTextContent('作業系統與版本');
    expect(screen.queryByTestId('checklist-desc-803')).not.toBeInTheDocument();
    // 勾選框與內容欄照舊
    expect(screen.getByLabelText('BIOS 設定 檢查完成')).toBeInTheDocument();
    expect(within(screen.getByTestId('checklist-desc-802').closest('div')).getByLabelText('OS 內容')).toBeInTheDocument();
  });
});
