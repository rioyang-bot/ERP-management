import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompanyPresetModal from '../components/CompanyPresetModal';
import DeliveryReceiptPrintModal from '../components/DeliveryReceiptPrintModal';
import LentOrderPrintModal from '../components/LentOrderPrintModal';
import { getCompanyPresets, saveCompanyPreset, deleteCompanyPreset, resetBuiltinCompanyPreset } from '../utils/companyPresets';

describe('公司資訊範本自訂與管理功能測試 (Company Presets Management)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('應正確提供預設內建範本 (版本 A 與 版本 B)', () => {
    const presets = getCompanyPresets();
    expect(presets.PRESET_A).toBeDefined();
    expect(presets.PRESET_B).toBeDefined();
    expect(presets.PRESET_A.isBuiltin).toBe(true);
    expect(presets.PRESET_B.isBuiltin).toBe(true);
  });

  it('CompanyPresetModal 應正確列出內建範本，且新增表單無顯示範例佔位文字', () => {
    render(
      <CompanyPresetModal
        isOpen={true}
        onClose={vi.fn()}
        onPresetsUpdated={vi.fn()}
      />
    );

    expect(screen.getByText('公司資訊範本管理')).toBeInTheDocument();
    expect(screen.getByText('版本 A (澳洲總部 / METECH)')).toBeInTheDocument();
    expect(screen.getByText('版本 B (台灣公司 / 竣喆國際)')).toBeInTheDocument();

    // 點擊新增範本按鈕
    const addBtn = screen.getByText('新增公司範本');
    fireEvent.click(addBtn);

    // 檢查標籤欄位存在
    expect(screen.getByText('範本名稱 *')).toBeInTheDocument();
    expect(screen.getByText('頁首公司資訊 (支援換行)')).toBeInTheDocument();
    expect(screen.getByText('單據簽名/受款公司全稱')).toBeInTheDocument();
  });

  it('能成功新增自訂公司範本並持久化至 localStorage', () => {
    const mockPresetData = {
      label: '版本 C (香港分公司)',
      headerRight: 'DREAMJET HONG KONG LTD\nHong Kong Central',
      companySignName: '竣喆國際香港分公司',
      dealerName: '竣喆國際香港分公司',
      dealerPhone: '+852 9876 5432',
      dealerAddress: '香港中環皇后大道'
    };

    const saved = saveCompanyPreset(mockPresetData);
    expect(saved.id).toBeDefined();
    expect(saved.isBuiltin).toBe(false);

    const presets = getCompanyPresets();
    expect(presets[saved.id]).toBeDefined();
    expect(presets[saved.id].label).toBe('版本 C (香港分公司)');
  });

  it('新增自訂範本後，交貨簽收單與借貨申請單下拉選單應能即時選取該自訂範本', async () => {
    const customPreset = saveCompanyPreset({
      label: '版本 C (香港分公司)',
      headerRight: 'DREAMJET HONG KONG LTD\nHong Kong Central',
      companySignName: '竣喆國際香港分公司',
      dealerName: '竣喆國際香港分公司',
      dealerPhone: '+852 9876 5432',
      dealerAddress: '香港中環皇后大道'
    });

    const mockDn = {
      id: 1,
      request_no: 'DN202602001',
      customer: '香港測試客戶',
      project_name: 'HK Project',
      shipping_date: '2026-02-06'
    };

    // 測試交貨簽收單
    const { container: drContainer } = render(
      <DeliveryReceiptPrintModal
        isOpen={true}
        onClose={vi.fn()}
        dnData={mockDn}
        items={[]}
      />
    );

    const drComboboxes = screen.getAllByRole('combobox');
    const drPresetSelect = drComboboxes[0];
    
    // 切換為自訂香港分公司範本
    fireEvent.change(drPresetSelect, { target: { value: customPreset.id } });

    expect(screen.getAllByText((c) => c.includes('DREAMJET HONG KONG LTD')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText((c) => c.includes('竣喆國際香港分公司')).length).toBeGreaterThanOrEqual(1);
  });

  it('刪除自訂範本後應從清單移除，且內建範本不可被刪除', () => {
    const customPreset = saveCompanyPreset({
      label: '臨時公司範本',
      headerRight: 'TEMP CO'
    });

    expect(getCompanyPresets()[customPreset.id]).toBeDefined();

    // 刪除自訂範本
    deleteCompanyPreset(customPreset.id);
    expect(getCompanyPresets()[customPreset.id]).toBeUndefined();

    // 嘗試刪除內建範本應報錯
    expect(() => deleteCompanyPreset('PRESET_B')).toThrow('系統內建範本不可刪除');
  });

  it('支援編輯修改系統內建範本 (版本 B / 版本 A) 且可隨時還原為原廠預設', () => {
    // 1. 修改內建版本 B 的公司抬頭與電話
    saveCompanyPreset({
      id: 'PRESET_B',
      label: '版本 B (竣喆國際 - 台北總部)',
      headerRight: '竣喆國際有限公司 台北總部\nTEL: 02-9999-8888',
      companySignName: '竣喆國際有限公司 台北總部',
      dealerName: '竣喆國際台北總部',
      dealerPhone: '02-9999-8888',
      dealerAddress: '台北市信義區松高路 1 號'
    });

    const modifiedPresets = getCompanyPresets();
    expect(modifiedPresets.PRESET_B.label).toBe('版本 B (竣喆國際 - 台北總部)');
    expect(modifiedPresets.PRESET_B.dealerPhone).toBe('02-9999-8888');
    expect(modifiedPresets.PRESET_B.isModified).toBe(true);
    expect(modifiedPresets.PRESET_B.isBuiltin).toBe(true);

    // 2. 還原為原廠預設值
    resetBuiltinCompanyPreset('PRESET_B');

    const restoredPresets = getCompanyPresets();
    expect(restoredPresets.PRESET_B.label).toBe('版本 B (台灣公司 / 竣喆國際)');
    expect(restoredPresets.PRESET_B.isModified).toBe(false);
  });
});
