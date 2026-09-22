import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RepairOrderRegistrationModal from '../components/RepairOrderRegistrationModal';

/**
 * 公司內部維修單建得起來
 *
 * 客戶名稱欄位是 required，內部維修時整個欄位以 display:none 隱藏 ——
 * 但隱藏的 required 欄位仍然參與表單驗證，瀏覽器又無法把焦點移到看不見的
 * 欄位上，於是按下「確認建立維修單」毫無反應，也沒有任何錯誤訊息。
 */
describe('建立公司內部維修單', () => {
  const namedQuery = vi.fn();
  let calls;

  const SUPPLIERS = [{ id: 18, name: '肯微科技股份有限公司', contact: 'Lulu Hung', phone: '02-82263936' }];
  // 沒有客戶的庫存品：加入時會自動切到公司內部
  const ASSETS = [{
    asset_id: 5, sn: 'INT-SN-001', status: 'ACTIVE', client: null, ownership: 'FOR_SALE',
    hostname: '', location: '', item_master_id: 3, brand: 'CISCO', type: 'NIC',
    model: 'X25', specification: '', category_name: '硬體',
  }];

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchSuppliers') return Promise.resolve({ success: true, rows: SUPPLIERS });
      if (query === 'fetchPartners' || query === 'fetchCustomers') return Promise.resolve({ success: true, rows: [] });
      if (query === 'fetchAssetsForRepairSelection') return Promise.resolve({ success: true, rows: ASSETS });
      if (query === 'createRepairOrder') return Promise.resolve({ success: true, rows: [{ id: 99 }] });
      if (query === 'countRepairOrders') return Promise.resolve({ success: true, rows: [{ count: 1 }] });
      return Promise.resolve({ success: true, rows: [] });
    });
    window.electronAPI = { namedQuery, runTransaction: vi.fn(), saveFile: vi.fn() };
  });

  const open = async () => {
    render(<RepairOrderRegistrationModal isOpen onClose={() => {}} onSuccess={() => {}} />);
    await screen.findByRole('button', { name: /公司內部/ });
  };

  const created = () => calls.filter((c) => c.query === 'createRepairOrder');

  /** 加入一台沒有客戶的設備；維修單至少要有一台，且這會自動切到公司內部 */
  const addAsset = async () => {
    // 整張設備卡片可點擊，「+ 加入」只是卡片上的文字而非按鈕
    const card = (await screen.findAllByText(/INT-SN-001/))[0].closest('div[style]');
    await userEvent.click(card);
    // 標題含 JSX 插值會被拆成多個文字節點，改以空狀態消失來判斷加入成功
    await waitFor(() => expect(screen.queryByText(/尚未加入任何設備項目/)).not.toBeInTheDocument());
  };

  it('客戶名稱在內部維修時不是必填 —— 隱藏的必填欄位會讓送出毫無反應', async () => {
    await open();
    const customer = screen.getByPlaceholderText('例如: Yuanta Ryan');

    expect(customer).toBeRequired();
    await userEvent.click(screen.getByRole('button', { name: /公司內部/ }));
    expect(customer).not.toBeRequired();
  });

  it('切回客戶送修時客戶名稱恢復必填', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: /公司內部/ }));
    await userEvent.click(screen.getByRole('button', { name: /客戶送修/ }));

    expect(screen.getByPlaceholderText('例如: Yuanta Ryan')).toBeRequired();
  });

  it('沒有客戶也能送出，維修單建得起來', async () => {
    await open();
    await addAsset();
    await userEvent.type(await screen.findByPlaceholderText(/無法過電/), '主機板錯誤碼 55');
    await userEvent.click(screen.getByRole('button', { name: /確認建立維修單/ }));

    await waitFor(() => expect(created()).toHaveLength(1));
    // 第九個參數是內部旗標
    expect(created()[0].params[8]).toBe(true);
    // 第二個是客戶名稱，內部維修不帶
    expect(created()[0].params[1]).toBeFalsy();
  });

  it('送出時帶上選取的供應商', async () => {
    await open();
    await addAsset();
    await userEvent.selectOptions(await screen.findByLabelText(/供應商/), '18');
    await userEvent.type(await screen.findByPlaceholderText(/無法過電/), '主機板故障');
    await userEvent.click(screen.getByRole('button', { name: /確認建立維修單/ }));

    await waitFor(() => expect(created()).toHaveLength(1));
    expect(created()[0].params[9]).toBe(18);
    expect(created()[0].params[10]).toBe('肯微科技股份有限公司');
  });

  it('按鈕說的是設為維修，不是設為在庫', async () => {
    await open();
    expect(screen.getByRole('button', { name: /自動設為維修/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /自動設為在庫/ })).not.toBeInTheDocument();
  });
});
