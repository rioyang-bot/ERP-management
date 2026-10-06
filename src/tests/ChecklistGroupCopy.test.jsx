import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ChecklistTemplates from '../pages/ChecklistTemplates';
import { queries } from '../../database/queries';
import { sameScope, validateGroupCopy, buildGroupCopySteps } from '../utils/checklistGroupCopy';

/**
 * 出機檢查表：複製主項目
 *
 * 選一個主項目、輸入新名稱，底下所有的主要檢查功能、細項、拍照項目一起複製。
 * 主項目依廠牌／型號自動套用到設備，範圍和來源一樣時設備會套用兩份，
 * 因此複製時一併選適用範圍，相同要再確認一次。
 */
const GROUPS = [
  { id: 2, name: 'BlackCore 出機檢查表', brand: 'BLACKCORE', model: null, main_count: 8, detail_count: 5, photo_count: 3 },
  { id: 3, name: 'LDA FIREWALL', brand: 'LDA', model: 'FIREWALL', main_count: 6, detail_count: 4, photo_count: 2 },
];

describe('規則', () => {
  it('範圍：廠牌＋型號相同才算相同；沒有廠牌時型號不算', () => {
    expect(sameScope({ brand: 'BLACKCORE', model: '' }, { brand: 'blackcore ', model: null })).toBe(true);
    expect(sameScope({ brand: 'LDA', model: 'NEOTAP' }, { brand: 'LDA', model: 'FIREWALL' })).toBe(false);
    expect(sameScope({ brand: '', model: 'X' }, { brand: null, model: null })).toBe(true);
  });

  it('名稱必填，同一廠牌底下不可同名', () => {
    expect(validateGroupCopy({ name: ' ', brand: 'LDA' }, GROUPS)).toContain('請輸入');
    expect(validateGroupCopy({ name: 'lda firewall', brand: 'LDA' }, GROUPS)).toContain('已經有名為');
    // 換到別的廠牌，同名沒關係
    expect(validateGroupCopy({ name: 'LDA FIREWALL', brand: 'BLACKCORE' }, GROUPS)).toBeNull();
  });

  it('先建新主項目，再把來源的項目整批搬過去', () => {
    expect(buildGroupCopySteps(3, { name: ' LDA NEOTAP ', brand: 'LDA', model: 'NEOTAP' }, 2)).toEqual([
      expect.objectContaining({ id: 'group', queryName: 'insertChecklistGroup', params: ['LDA NEOTAP', 'LDA', 2, 'NEOTAP'], expectRows: 1 }),
      { queryName: 'copyChecklistItems', params: [{ $ref: 'group.rows.0.id' }, 3] },
    ]);
    // 沒有廠牌時型號存成 NULL
    expect(buildGroupCopySteps(3, { name: 'X', brand: '', model: 'NEOTAP' }, 0)[0].params).toEqual(['X', null, 0, null]);
  });

  it('複製的是種類、名稱、順序、拍攝說明與自動套用設定', () => {
    expect(queries.copyChecklistItems).toContain('SELECT $1::integer, kind, name, sort_order, description, auto_apply');
    expect(queries.copyChecklistItems).toContain('WHERE group_id = $2::integer');
  });
});

describe('範本頁上複製', () => {
  let calls;
  let txSteps;
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    txSteps = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.electronAPI = {
      getDashboardStats: vi.fn(),
      runTransaction: vi.fn(async (steps) => {
        txSteps.push(steps);
        return { success: true, results: { group: { rows: [{ id: 9, name: steps[0].params[0] }], rowCount: 1 } } };
      }),
      namedQuery: vi.fn(async (query, params) => {
        calls.push({ query, params });
        if (query === 'fetchChecklistGroups') return { success: true, rows: GROUPS };
        if (query === 'fetchChecklistItems') return { success: true, rows: [{ id: 61, group_id: 2, kind: 'MAIN', name: 'BIOS 設定' }] };
        if (query === 'fetchDeviceBrands') return { success: true, rows: [{ id: 1, name: 'BLACKCORE' }, { id: 2, name: 'LDA' }] };
        if (query === 'fetchModelsByBrand') return { success: true, rows: params[0] === 'LDA' ? [{ name: 'FIREWALL' }, { name: 'NEOTAP' }] : [] };
        if (query === 'syncBrandChecklistToAssets') return { success: true, rows: [{ id: 1 }, { id: 2 }] };
        return { success: true, rows: [] };
      }),
    };
  });

  const openCopy = async (groupName) => {
    render(<MemoryRouter><ChecklistTemplates /></MemoryRouter>);
    await screen.findByText('BIOS 設定');
    await userEvent.click(screen.getByRole('button', { name: `複製主項目 ${groupName}` }));
    return screen.findByRole('dialog', { name: '複製主項目' });
  };

  it('每個主項目都有複製按鈕，打開時選好那一個、沿用它的範圍', async () => {
    const dialog = await openCopy('LDA FIREWALL');
    expect(within(dialog).getByLabelText('要複製的主項目')).toHaveValue('3');
    expect(within(dialog).getByTestId('copy-group-counts')).toHaveTextContent('主要 6 · 細項 4 · 拍照 2');
    expect(within(dialog).getByLabelText('複製後適用廠牌')).toHaveValue('LDA');
    // 範圍相同先提醒
    expect(within(dialog).getByTestId('copy-group-same-scope')).toBeInTheDocument();
  });

  it('換成別的型號就不再提醒；複製後套用到設備並選到新的主項目', async () => {
    const dialog = await openCopy('LDA FIREWALL');
    await userEvent.type(within(dialog).getByLabelText('新的名稱'), 'LDA NEOTAP');
    await waitFor(() => expect(within(dialog).getByLabelText('複製後適用型號')).toHaveTextContent('NEOTAP'));
    await userEvent.selectOptions(within(dialog).getByLabelText('複製後適用型號'), 'NEOTAP');
    expect(within(dialog).queryByTestId('copy-group-same-scope')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /^複製$/ }));

    await waitFor(() => expect(txSteps).toHaveLength(1));
    expect(txSteps[0]).toEqual(buildGroupCopySteps(3, { name: 'LDA NEOTAP', brand: 'LDA', model: 'NEOTAP' }, 2));
    expect(window.confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(calls.some((c) => c.query === 'syncBrandChecklistToAssets')).toBe(true));
    const log = calls.find((c) => c.query === 'insertAuditLog');
    expect(JSON.stringify(log)).toContain('複製出機檢查表主項目 [LDA FIREWALL] → [LDA NEOTAP]');
    expect(await screen.findByText(/已複製「LDA FIREWALL」為「LDA NEOTAP」/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '複製主項目' })).not.toBeInTheDocument();
  });

  it('範圍和來源相同時要再確認，取消就不複製', async () => {
    window.confirm.mockReturnValue(false);
    const dialog = await openCopy('BlackCore 出機檢查表');
    await userEvent.type(within(dialog).getByLabelText('新的名稱'), 'BlackCore 出機檢查表 v2');
    await userEvent.click(within(dialog).getByRole('button', { name: /^複製$/ }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('適用的範圍相同'));
    expect(txSteps).toHaveLength(0);
  });

  it('可以在視窗裡改選要複製的主項目', async () => {
    const dialog = await openCopy('BlackCore 出機檢查表');
    await userEvent.selectOptions(within(dialog).getByLabelText('要複製的主項目'), '3');
    expect(within(dialog).getByTestId('copy-group-counts')).toHaveTextContent('主要 6');
    expect(within(dialog).getByLabelText('複製後適用廠牌')).toHaveValue('LDA');
  });

  it('同廠牌同名就擋下來；沒輸入名稱不能按', async () => {
    const dialog = await openCopy('LDA FIREWALL');
    expect(within(dialog).getByRole('button', { name: /^複製$/ })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('新的名稱'), 'LDA FIREWALL');
    await userEvent.click(within(dialog).getByRole('button', { name: /^複製$/ }));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('已經有名為'));
    expect(txSteps).toHaveLength(0);
  });
});
