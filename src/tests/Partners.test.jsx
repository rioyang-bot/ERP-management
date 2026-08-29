import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Partners from '../pages/Partners';

describe('客戶/廠商管理 (Partners) 升級功能測試', () => {
  let existingPartners = [];
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();
  const alertMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    insertSpy.mockClear();
    updateSpy.mockClear();
    alertMock.mockClear();
    window.alert = alertMock;

    existingPartners = [
      { id: 1, type: 'CUSTOMER', name: '富邦綜合證券', contact: 'David Chen', phone: '0918600800', address: '台北市仁愛路四段 169 號 5 樓', is_active: true },
      { id: 2, type: 'CUSTOMER', name: '富邦綜合證券', contact: 'Mary Wang', phone: '0922111222', address: '台北市仁愛路四段 169 號 6 樓', is_active: true },
      { id: 3, type: 'CUSTOMER', name: '國泰金控', contact: 'David Chen', phone: '0933444555', address: '台北市信義區松仁路 7 號', is_active: true }
    ];

    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      if (query === 'migratePartnersActive' || query === 'migratePartnersAddress' || query === 'initPartnersActive') {
        return Promise.resolve({ success: true });
      }
      if (query === 'fetchPartners') {
        return Promise.resolve({ success: true, rows: existingPartners });
      }
      if (query === 'checkDuplicatePartner') {
        const [type, name, contact] = params;
        const dups = existingPartners.filter(p => 
          p.type === type && 
          p.name.trim().toLowerCase() === name.trim().toLowerCase() && 
          p.contact.trim().toLowerCase() === contact.trim().toLowerCase()
        );
        return Promise.resolve({ success: true, rows: dups });
      }
      if (query === 'checkDuplicatePartnerForUpdate') {
        const [type, name, contact, id] = params;
        const dups = existingPartners.filter(p => 
          p.id !== id &&
          p.type === type && 
          p.name.trim().toLowerCase() === name.trim().toLowerCase() && 
          p.contact.trim().toLowerCase() === contact.trim().toLowerCase()
        );
        return Promise.resolve({ success: true, rows: dups });
      }
      if (query === 'insertPartner') {
        insertSpy(params);
        return Promise.resolve({ success: true, rows: [{ id: 99 }] });
      }
      if (query === 'updatePartner') {
        updateSpy(params);
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  });

  it('列表應正確顯示公司名稱(全稱)、聯絡人、電話與公司地址', async () => {
    render(<Partners />);

    await waitFor(() => {
      expect(screen.getAllByText('富邦綜合證券').length).toBe(2);
      expect(screen.getAllByText('David Chen').length).toBe(2);
      expect(screen.getByText('Mary Wang')).toBeInTheDocument();
      expect(screen.getByText('台北市仁愛路四段 169 號 5 樓')).toBeInTheDocument();
    });
  });

  it('建立夥伴時，若未填寫公司名稱或聯絡人應跳出警告並阻止送出', async () => {
    const user = userEvent.setup();
    const { container } = render(<Partners />);

    await waitFor(() => {
      expect(screen.getByText('新增夥伴')).toBeInTheDocument();
    });

    const submitBtn = screen.getByText('儲存至資料庫');
    await user.click(submitBtn);

    expect(alertMock).toHaveBeenCalledWith('請填寫公司名稱(全稱) (必填)');
    expect(insertSpy).not.toHaveBeenCalled();

    // 填寫公司名稱但未填寫聯絡人
    const nameInput = container.querySelector('input[name="name"]');
    await user.type(nameInput, '台積電');
    await user.click(submitBtn);

    expect(alertMock).toHaveBeenCalledWith('請填寫聯絡人 (必填)');
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('建立同公司不同聯絡人時應成功建立，且地址正確存入', async () => {
    const user = userEvent.setup();
    const { container } = render(<Partners />);

    await waitFor(() => {
      expect(screen.getByText('新增夥伴')).toBeInTheDocument();
    });

    const nameInput = container.querySelector('input[name="name"]');
    const contactInput = container.querySelector('input[name="contact"]');
    const phoneInput = container.querySelector('input[name="phone"]');
    const addressInput = container.querySelector('input[name="address"]');

    await user.type(nameInput, '富邦綜合證券');
    await user.type(contactInput, 'Alex Lin');
    await user.type(phoneInput, '0988777666');
    await user.type(addressInput, '台北市仁愛路四段 169 號 7 樓');

    const submitBtn = screen.getByText('儲存至資料庫');
    await user.click(submitBtn);

    expect(insertSpy).toHaveBeenCalledWith([
      'CUSTOMER',
      '富邦綜合證券',
      'Alex Lin',
      '0988777666',
      '台北市仁愛路四段 169 號 7 樓'
    ]);
  });

  it('若建立相同公司名稱 + 相同聯絡人，應阻擋重複並提示警示訊息', async () => {
    const user = userEvent.setup();
    const { container } = render(<Partners />);

    await waitFor(() => {
      expect(screen.getByText('新增夥伴')).toBeInTheDocument();
    });

    const nameInput = container.querySelector('input[name="name"]');
    const contactInput = container.querySelector('input[name="contact"]');

    // 富邦綜合證券 + David Chen 已存在
    await user.type(nameInput, '富邦綜合證券');
    await user.type(contactInput, 'David Chen');

    const submitBtn = screen.getByText('儲存至資料庫');
    await user.click(submitBtn);

    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('已存在聯絡人「David Chen」，不可重複建立！'));
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
