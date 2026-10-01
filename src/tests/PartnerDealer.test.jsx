import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import Partners from '../pages/Partners';
import LentOrderPrintModal from '../components/LentOrderPrintModal';
import { queries } from '../../database/queries';

/**
 * 夥伴類型「經銷商」
 *
 * 經銷商同時是客戶（出貨、借用、維修選得到）與供應商（採購、進貨選得到）；
 * 借貨申請單上的「經銷商」區可以直接從客戶/廠商管理帶入。
 */
const DEALER = { id: 9, type: 'DEALER', name: '竣喆國際有限公司', contact: '王小明', phone: '02-8765-4321', address: '台北市內湖區瑞光路 1 號', project_info: '', is_active: true };

describe('客戶/廠商管理：經銷商', () => {
  let calls;
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      calls.push({ query, params });
      if (query === 'fetchPartners') {
        return Promise.resolve({ success: true, rows: [
          { id: 1, type: 'CUSTOMER', name: '富邦綜合證券', contact: 'David', phone: '', address: '', is_active: true },
          { id: 4, type: 'SUPPLIER', name: '華碩電腦', contact: 'Ken', phone: '', address: '', is_active: true },
          DEALER,
        ] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  });

  it('夥伴類型可以選經銷商', async () => {
    render(<Partners />);
    await screen.findByText('竣喆國際有限公司');
    const select = screen.getAllByRole('combobox').find((s) => [...s.options].some((o) => o.value === 'DEALER'));
    expect(select).toBeTruthy();
    expect([...select.options].map((o) => o.textContent)).toContain('經銷商 (Dealer)');
  });

  it('新增時送出的類型是 DEALER', async () => {
    const { container } = render(<Partners />);
    await screen.findByText('竣喆國際有限公司');
    await userEvent.selectOptions(container.querySelector('select[name="type"]'), 'DEALER');
    await userEvent.type(container.querySelector('input[name="name"]'), '新經銷商股份有限公司');
    await userEvent.type(container.querySelector('input[name="contact"]'), '李業務');
    await userEvent.click(screen.getByRole('button', { name: '儲存至資料庫' }));
    await waitFor(() => expect(calls.find((c) => c.query === 'insertPartner')?.params.slice(0, 2)).toEqual(['DEALER', '新經銷商股份有限公司']));
  });

  it('列表上標示為經銷商，並有經銷商篩選', async () => {
    render(<Partners />);
    const row = (await screen.findByText('竣喆國際有限公司')).closest('tr');
    expect(within(row).getByText('經銷商')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /經銷商\s*1/ }));
    expect(screen.queryByText('華碩電腦')).not.toBeInTheDocument();
    expect(screen.getByText('竣喆國際有限公司')).toBeInTheDocument();
  });
});

describe('經銷商出現在客戶與供應商選單', () => {
  it('客戶選單與供應商選單都包含經銷商', () => {
    expect(queries.fetchCustomers).toContain("partner_type IN ('CUSTOMER', 'DEALER')");
    expect(queries.fetchSuppliers).toContain("partner_type IN ('SUPPLIER', 'DEALER')");
  });

  it('已登記成經銷商的，不會再自動建立一筆同名客戶', () => {
    expect(queries.insertCustomerIfNotExist).toContain("partner_type IN ('CUSTOMER', 'DEALER')");
  });

  // 沒轉型時 PostgreSQL 回「inconsistent types deduced for parameter $1」，批次匯入一直沒建立過客戶
  it('批次匯入自動建立客戶的查詢有明確指定參數型別', () => {
    expect(queries.insertCustomerIfNotExist).toContain("SELECT 'CUSTOMER', $1::varchar");
    expect(queries.insertCustomerIfNotExist).toContain("name = $1::varchar");
  });

  it('資料庫允許經銷商類型', () => {
    const sql = fs.readFileSync('database/migration_partner_type_dealer.sql', 'utf8');
    expect(sql).toContain("CHECK (partner_type IN ('CUSTOMER', 'SUPPLIER', 'DEALER'))");
  });
});

describe('借貨申請單帶入經銷商', () => {
  const dnData = {
    id: 101, request_no: 'DN-20261001-01', customer: '富邦綜合證券股份有限公司',
    location: '台北市', contact_info: 'David Chen (0918-600-800)',
    shipping_date: '2026-10-01', expected_return_date: '2026-10-08', creator_name: 'Elain Lu', request_type: 'LEND',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI.namedQuery.mockImplementation((query) => {
      if (query === 'fetchDealers') return Promise.resolve({ success: true, rows: [DEALER] });
      if (query === 'fetchCustomers') {
        return Promise.resolve({ success: true, rows: [{ id: 1, name: '富邦綜合證券股份有限公司', contact: '陳大文', phone: '02-1111', address: '台北市仁愛路' }] });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  });

  it('選了經銷商就把名稱、聯絡人、電話、地址帶進經銷商區', async () => {
    render(<LentOrderPrintModal isOpen onClose={vi.fn()} dnData={dnData} items={[]} />);
    const select = await screen.findByLabelText('經銷商');
    await screen.findByRole('option', { name: '竣喆國際有限公司（王小明）' });
    await userEvent.selectOptions(select, '9');

    const sheet = document.getElementById('lent-order-printable-sheet');
    expect(sheet.textContent).toContain('竣喆國際有限公司');
    expect(sheet.textContent).toContain('王小明');
    expect(sheet.textContent).toContain('02-8765-4321');
    expect(sheet.textContent).toContain('台北市內湖區瑞光路 1 號');
  });

  const dealerSection = () => {
    const title = [...document.querySelectorAll('.loan-section-header-title')].find((el) => el.textContent === '經銷商');
    return title.closest('.loan-section-block');
  };

  it('沒選經銷商之前，經銷商區全部留空（不帶公司範本、也不帶建單人）', async () => {
    render(<LentOrderPrintModal isOpen onClose={vi.fn()} dnData={dnData} items={[]} />);
    await screen.findByLabelText('經銷商');
    const text = dealerSection().textContent;
    expect(text).not.toContain('Elain Lu');
    expect(text).not.toContain('METECH GLOBAL CONSULTANT PTY LTD');
    expect(text).not.toContain('竣喆國際有限公司');
  });

  it('換公司範本不會動到已選的經銷商', async () => {
    render(<LentOrderPrintModal isOpen onClose={vi.fn()} dnData={dnData} items={[]} />);
    const select = await screen.findByLabelText('經銷商');
    await screen.findByRole('option', { name: '竣喆國際有限公司（王小明）' });
    await userEvent.selectOptions(select, '9');
    const presetSelect = screen.getAllByRole('combobox').find((s) => [...s.options].some((o) => o.value === 'PRESET_B'));
    await userEvent.selectOptions(presetSelect, 'PRESET_B');
    expect(dealerSection().textContent).toContain('王小明');
    expect(select.value).toBe('9');
  });

  it('選回「請選擇」就清空經銷商區', async () => {
    render(<LentOrderPrintModal isOpen onClose={vi.fn()} dnData={dnData} items={[]} />);
    const select = await screen.findByLabelText('經銷商');
    await screen.findByRole('option', { name: '竣喆國際有限公司（王小明）' });
    await userEvent.selectOptions(select, '9');
    await userEvent.selectOptions(select, '');
    expect(dealerSection().textContent).not.toContain('王小明');
  });

  it('客戶聯絡人從客戶主檔帶入（欄位名稱是 contact）', async () => {
    render(<LentOrderPrintModal isOpen onClose={vi.fn()} dnData={dnData} items={[]} />);
    await waitFor(() => expect(document.getElementById('lent-order-printable-sheet').textContent).toContain('陳大文'));
  });
});
