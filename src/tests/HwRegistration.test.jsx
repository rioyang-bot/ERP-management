import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HwRegistration from '../pages/HwRegistration';

describe('硬體建檔規格必填與建立整合測試', () => {
  const insertSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    insertSpy.mockClear();
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);

    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      if (query === 'fetchHwBrands' || query === 'fetchNicBrands') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: 'Intel' }] });
      }
      if (query === 'fetchHwTypes' || query === 'fetchNicTypesByBrand') {
        return Promise.resolve({ success: true, rows: [{ name: 'NIC 網卡' }] });
      }
      if (query === 'fetchHwModelsByBrand' || query === 'fetchNicModelsByBrandType') {
        return Promise.resolve({ success: true, rows: [{ name: 'E810-XXVDA2' }] });
      }
      if (query === 'fetchNicList') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'fetchActiveProjects') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'findItemMaster') {
        return Promise.resolve({ success: true, rows: [] });
      }
      if (query === 'insertItemMaster') {
        return Promise.resolve({ success: true, rows: [{ id: 99 }] });
      }
      if (query === 'insertAssetRecord') {
        insertSpy(params);
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  });

  it('硬體建檔表單規格為選填，未填規格時仍可順利儲存，缺類型/廠牌/型號時阻擋', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HwRegistration />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/硬體建檔/)).toBeInTheDocument();
    });

    // 驗證標籤包含「規格 (Specification)」且標示為 (選填)
    expect(screen.getByText(/規格 \(Specification\)/)).toBeInTheDocument();
    const specInput = screen.getByPlaceholderText('例如: 10GbE SFP+ Dual Port');
    expect(specInput).not.toBeRequired();

    // 1. 未選取任何欄位時直接送出，應提示必填 (類型、廠牌、型號為必填)
    const submitBtn = screen.getByRole('button', { name: /儲存硬體資料/ });
    const form = submitBtn.closest('form');
    fireEvent.submit(form);

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('類型、廠牌、型號為必填'));
    expect(insertSpy).not.toHaveBeenCalled();

    // 2. 選擇 類型、廠牌、型號，填寫序號，但「未填規格」，應能順利送出
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], 'NIC 網卡');
    await user.selectOptions(selects[1], 'Intel');
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'E810-XXVDA2' })).toBeInTheDocument();
    });
    await user.selectOptions(selects[2], 'E810-XXVDA2');

    const snInput = screen.getByPlaceholderText('請輸入硬體序號');
    await user.type(snInput, 'NIC-TEST-NO-SPEC-001');

    fireEvent.submit(form);

    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'insertItemMaster',
        expect.arrayContaining(['', 'NIC 網卡', 'Intel', 'E810-XXVDA2'])
      );
      expect(insertSpy).toHaveBeenCalled();
    });
  });

  it('填寫必填規格與序號後應能順利建立硬體主檔與資產記錄', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HwRegistration />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/硬體建檔/)).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    // selects[0]: 類型 (Type)
    await user.selectOptions(selects[0], 'NIC 網卡');

    // selects[1]: 廠牌 (Brand)
    await user.selectOptions(selects[1], 'Intel');

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'E810-XXVDA2' })).toBeInTheDocument();
    });
    // selects[2]: 型號 (Model)
    await user.selectOptions(selects[2], 'E810-XXVDA2');

    // 填寫規格
    const specInput = screen.getByPlaceholderText('例如: 10GbE SFP+ Dual Port');
    await user.type(specInput, 'Dual Port 25GbE PCIe');

    // 填寫序號
    const snInput = screen.getByPlaceholderText('請輸入硬體序號');
    await user.type(snInput, 'NIC-TEST-SN-001');

    const submitBtn = screen.getByRole('button', { name: /儲存硬體資料/ });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(window.electronAPI.namedQuery).toHaveBeenCalledWith(
        'insertItemMaster',
        expect.arrayContaining(['Dual Port 25GbE PCIe', 'NIC 網卡', 'Intel', 'E810-XXVDA2'])
      );
      expect(insertSpy).toHaveBeenCalled();
    });
  });
});
