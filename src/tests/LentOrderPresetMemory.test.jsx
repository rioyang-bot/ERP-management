import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LentOrderPrintModal from '../components/LentOrderPrintModal';
import { __resetCompanyPresetsCache } from '../utils/companyPresets';
import { toDraft } from '../utils/lentPrintDraft';

/**
 * 借貨申請單記住上次選的公司範本
 *
 * 先前每次打開都固定從版本 A 開始。現在選擇存在伺服器的個人偏好設定：
 * 沒有存過修改的借貨申請單、以及「還原預設」都改用上次選的範本；
 * 這張單若存過修改，仍以存過的內容（含範本）為準。
 */

const PREF_KEY = 'lentOrder:companyPreset';
const DN = {
  id: 101, request_no: 'DN-20261116-02', customer: '測試客戶', location: '台北市',
  contact_info: 'Tester (0900-000-000)', shipping_date: '2026-11-16', expected_return_date: '2026-11-30',
  creator_name: 'Rio', request_type: 'LEND',
};
const ITEMS = [{ brand: 'Cisco', model: 'N3K', sn: 'SN001', quantity: 1, specification: '' }];

let savedPref;
let printDraft;

const presetSelect = () => screen.getAllByRole('combobox')[0];

describe('借貨申請單記住上次選的公司範本', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetCompanyPresetsCache();
    savedPref = undefined;
    printDraft = null;

    window.electronAPI.namedQuery.mockImplementation(async (query) => {
      if (query === 'fetchLentPrintDraft') return { success: true, rows: [{ print_draft: printDraft }] };
      return { success: true, rows: [] };
    });
    window.electronAPI.getUserPreference = vi.fn(async (key) => (
      { success: true, value: key === PREF_KEY && savedPref !== undefined ? savedPref : null }
    ));
    window.electronAPI.setUserPreference = vi.fn(async (key, value) => {
      if (key === PREF_KEY) savedPref = value;
      return { success: true };
    });
  });

  afterEach(() => {
    delete window.electronAPI.getUserPreference;
    delete window.electronAPI.setUserPreference;
  });

  const open = () => render(<LentOrderPrintModal isOpen onClose={vi.fn()} dnData={DN} items={ITEMS} />);
  const waitLoaded = () => waitFor(() => expect(window.electronAPI.getUserPreference).toHaveBeenCalledWith(PREF_KEY));

  it('沒有選過範本時預設為版本 A', async () => {
    open();
    await waitLoaded();
    await waitFor(() => expect(presetSelect().value).toBe('PRESET_A'));
  });

  it('切換範本會存成個人偏好設定', async () => {
    open();
    await waitLoaded();
    fireEvent.change(presetSelect(), { target: { value: 'PRESET_B' } });
    expect(window.electronAPI.setUserPreference).toHaveBeenCalledWith(PREF_KEY, 'PRESET_B');
  });

  it('上次選了版本 B，打開沒存過修改的借貨申請單就是版本 B，且不算未儲存的修改', async () => {
    savedPref = 'PRESET_B';
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<LentOrderPrintModal isOpen onClose={onClose} dnData={DN} items={ITEMS} />);

    await waitFor(() => expect(presetSelect().value).toBe('PRESET_B'));
    expect(screen.getAllByText((c) => c.includes('竣喆國際有限公司')).length).toBeGreaterThanOrEqual(1);

    // 範本是預設內容的一部分，不該被當成修改而在關閉時詢問
    fireEvent.click(screen.getByRole('button', { name: /關閉/ }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('這張單存過修改時，以存過的範本為準', async () => {
    savedPref = 'PRESET_B';
    printDraft = toDraft({ selectedPreset: 'PRESET_A', custPerson: '存過的聯絡人' });
    open();
    await waitFor(() => expect(screen.getAllByText((c) => c.includes('存過的聯絡人')).length).toBeGreaterThanOrEqual(1));
    expect(presetSelect().value).toBe('PRESET_A');
  });

  it('上次選的範本已被刪除時退回版本 A', async () => {
    savedPref = 'CUSTOM_DELETED_123';
    open();
    await waitLoaded();
    await waitFor(() => expect(presetSelect().value).toBe('PRESET_A'));
  });
});
