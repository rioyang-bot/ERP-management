import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeliveryReceiptPrintModal from '../components/DeliveryReceiptPrintModal';
import { saveCompanyPreset, __resetCompanyPresetsCache } from '../utils/companyPresets';

/**
 * 交貨簽收單記住上次選的公司範本
 *
 * 先前每次打開都固定從版本 B 開始：選了版本 C 關掉再開，又變回版本 B。
 * 現在選擇存在伺服器的個人偏好設定，下次打開沿用。
 */

const PREF_KEY = 'deliveryReceipt:companyPreset';
const DN = { id: 1, request_no: 'DN-20261116-01', customer: '測試客戶', project_name: '', shipping_date: '2026-11-16' };

// 假的伺服器：公司範本（system_configs）與個人偏好設定（user_preferences）
let serverPresets;
let savedPref;

const presetSelect = () => screen.getAllByRole('combobox')[0];

describe('交貨簽收單記住上次選的公司範本', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetCompanyPresetsCache();
    serverPresets = null;
    savedPref = undefined;

    window.electronAPI.namedQuery.mockImplementation(async (query, params) => {
      if (query === 'fetchCompanyPresets') {
        return { success: true, rows: serverPresets === null ? [] : [{ value: serverPresets }] };
      }
      if (query === 'saveCompanyPresets') {
        serverPresets = typeof params[0] === 'string' ? params[0] : JSON.stringify(params[0]);
        return { success: true, rows: [{ updated_at: '2026-11-16' }] };
      }
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

  // 在伺服器上建立「版本 C」，並清掉快取，讓簽收單像剛打開一樣從伺服器讀
  const createPresetC = async () => {
    const preset = await saveCompanyPreset({
      label: '版本 C (香港分公司)',
      headerRight: 'DREAMJET HONG KONG LTD',
      companySignName: '竣喆國際香港分公司',
    });
    __resetCompanyPresetsCache();
    return preset;
  };

  it('沒有選過範本時預設為版本 B', async () => {
    render(<DeliveryReceiptPrintModal isOpen onClose={vi.fn()} dnData={DN} items={[]} />);
    await waitFor(() => expect(window.electronAPI.getUserPreference).toHaveBeenCalledWith(PREF_KEY));
    await waitFor(() => expect(presetSelect().value).toBe('PRESET_B'));
  });

  it('選了版本 C 會存成個人偏好設定', async () => {
    const presetC = await createPresetC();
    render(<DeliveryReceiptPrintModal isOpen onClose={vi.fn()} dnData={DN} items={[]} />);
    await screen.findByRole('option', { name: '版本 C (香港分公司)' });

    fireEvent.change(presetSelect(), { target: { value: presetC.id } });

    expect(window.electronAPI.setUserPreference).toHaveBeenCalledWith(PREF_KEY, presetC.id);
    expect(presetSelect().value).toBe(presetC.id);
  });

  it('選了版本 C 關掉再打開，仍是版本 C（抬頭與簽章公司也跟著套用）', async () => {
    const presetC = await createPresetC();
    const first = render(<DeliveryReceiptPrintModal isOpen onClose={vi.fn()} dnData={DN} items={[]} />);
    await screen.findByRole('option', { name: '版本 C (香港分公司)' });
    fireEvent.change(presetSelect(), { target: { value: presetC.id } });
    first.unmount();

    __resetCompanyPresetsCache();
    render(<DeliveryReceiptPrintModal isOpen onClose={vi.fn()} dnData={DN} items={[]} />);

    await waitFor(() => expect(presetSelect().value).toBe(presetC.id));
    expect(screen.getAllByText((c) => c.includes('DREAMJET HONG KONG LTD')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText((c) => c.includes('竣喆國際香港分公司')).length).toBeGreaterThanOrEqual(1);
  });

  it('上次選的範本已被刪除時退回版本 B', async () => {
    savedPref = 'CUSTOM_DELETED_123';
    render(<DeliveryReceiptPrintModal isOpen onClose={vi.fn()} dnData={DN} items={[]} />);
    await waitFor(() => expect(window.electronAPI.getUserPreference).toHaveBeenCalled());
    await waitFor(() => expect(presetSelect().value).toBe('PRESET_B'));
  });

  it('讀不到個人偏好設定（例如伺服器錯誤）時仍可正常使用，預設版本 B', async () => {
    window.electronAPI.getUserPreference = vi.fn(async () => { throw new Error('network down'); });
    render(<DeliveryReceiptPrintModal isOpen onClose={vi.fn()} dnData={DN} items={[]} />);
    await waitFor(() => expect(window.electronAPI.getUserPreference).toHaveBeenCalled());
    await waitFor(() => expect(presetSelect().value).toBe('PRESET_B'));
    expect(screen.getByText('交 貨 簽 收 單')).toBeInTheDocument();
  });
});
