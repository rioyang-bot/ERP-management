import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RepairOrderRegistrationModal from '../components/RepairOrderRegistrationModal';

/**
 * 新增維修單：選客戶時要看得到聯絡人
 *
 * 使用者回報同一家公司有很多聯絡人，建單時只看得到公司名，選不到正確的那位。
 * partners 是一位聯絡人一列，先前的建議清單直接把每一列都列出來，
 * 看到的就是同一個公司名重複好幾次（datalist 還會把相同的值合併掉）。
 */
const PARTNERS = [
  { id: 1, name: '元大Yuanta', contact: 'Niky', phone: '02-1111-1111' },
  { id: 2, name: '元大Yuanta', contact: 'Ryan', phone: '02-2222-2222' },
  { id: 3, name: '元大Yuanta', contact: '宏訊', phone: '' },
  { id: 4, name: '凱基', contact: '吳沛恆', phone: '02-3333-3333' },
  { id: 5, name: '單一聯絡人公司', contact: '陳小姐', phone: '02-4444-4444' },
  { id: 6, name: '沒建檔聯絡人的公司', contact: '', phone: '' },
];

describe('新增維修單：客戶與聯絡人', () => {
  const namedQuery = vi.fn();
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchCustomers') return Promise.resolve({ success: true, rows: PARTNERS });
      if (query === 'createRepairOrder') return Promise.resolve({ success: true, rows: [{ id: 1, repair_no: 'RMA-1' }] });
      return Promise.resolve({ success: true, rows: [] });
    });
    window.electronAPI = { namedQuery, runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn() };
  });

  const called = (name) => calls.filter((c) => c.query === name);
  const renderModal = () => render(
    <RepairOrderRegistrationModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />
  );

  const typeCustomer = async (name) => {
    const input = await screen.findByPlaceholderText(/例如: Yuanta Ryan/);
    await userEvent.clear(input);
    await userEvent.type(input, name);
    return input;
  };

  it('客戶建議清單不會出現重複的公司名', async () => {
    const { container } = renderModal();
    await waitFor(() => expect(called('fetchCustomers').length).toBeGreaterThan(0));

    await waitFor(() => {
      const options = [...container.querySelectorAll('#customer-suggestions option')].map((o) => o.value);
      // 六列 partners、五家公司
      expect(options).toEqual(['元大Yuanta', '凱基', '單一聯絡人公司', '沒建檔聯絡人的公司']);
    });
  });

  it('選了客戶之後列出這家公司的每一位聯絡人', async () => {
    renderModal();
    await typeCustomer('元大Yuanta');

    const select = await screen.findByLabelText(/聯絡人 \(Contact\)/);
    const options = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toContain('Niky（02-1111-1111）');
    expect(options).toContain('Ryan（02-2222-2222）');
    expect(options).toContain('宏訊');
  });

  it('告知這家公司有幾位聯絡人', async () => {
    renderModal();
    await typeCustomer('元大Yuanta');
    expect(await screen.findByText(/此客戶有 3 位聯絡人/)).toBeInTheDocument();
  });

  it('選了聯絡人會一併帶出電話', async () => {
    renderModal();
    await typeCustomer('元大Yuanta');

    const select = await screen.findByLabelText(/聯絡人 \(Contact\)/);
    await userEvent.selectOptions(select, 'Ryan');

    expect(await screen.findByText(/聯絡電話：02-2222-2222/)).toBeInTheDocument();
  });

  it('只有一位聯絡人時直接帶入，省一次點選', async () => {
    renderModal();
    await typeCustomer('單一聯絡人公司');

    await waitFor(async () => {
      const select = await screen.findByLabelText(/聯絡人 \(Contact\)/);
      expect(select.value).toBe('陳小姐');
    });
  });

  it('換了客戶就不會沿用上一家的聯絡人', async () => {
    renderModal();
    await typeCustomer('元大Yuanta');
    await userEvent.selectOptions(await screen.findByLabelText(/聯絡人 \(Contact\)/), 'Ryan');

    await typeCustomer('凱基');

    await waitFor(async () => {
      const select = await screen.findByLabelText(/聯絡人 \(Contact\)/);
      // 凱基只有一位，會直接帶入自己的那位，不會留著 Ryan
      expect(select.value).toBe('吳沛恆');
    });
  });

  it('客戶沒有建檔聯絡人時改成直接輸入', async () => {
    renderModal();
    await typeCustomer('沒建檔聯絡人的公司');

    const field = await screen.findByLabelText(/聯絡人 \(Contact\)/);
    expect(field.tagName).toBe('INPUT');
    await userEvent.type(field, '臨時窗口');
    expect(field.value).toBe('臨時窗口');
  });

  it('可以選擇手動輸入未建檔的聯絡人', async () => {
    renderModal();
    await typeCustomer('元大Yuanta');

    await userEvent.selectOptions(await screen.findByLabelText(/聯絡人 \(Contact\)/), '__MANUAL__');

    const field = await screen.findByLabelText(/聯絡人 \(Contact\)/);
    expect(field.tagName).toBe('INPUT');
  });
});
