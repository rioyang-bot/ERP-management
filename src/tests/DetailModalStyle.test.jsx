import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InboundList from '../pages/InboundList';
import DNList from '../pages/DNList';
import { RoleContext } from '../context/RoleContext';

/**
 * 進貨單明細與出貨單明細的風格一致
 *
 * 兩個視窗原本各寫各的。標題區採進貨單明細的樣式（大標題「X單明細：單號」
 * ＋狀態標籤、下方一列時間資訊、右上「✕ 關閉」），其餘採出貨單明細的樣式
 * （左側色條的資訊列、精簡表格、外框區塊、圓角按鈕）。兩邊共用
 * components/detail 的元件與樣式，改一處兩邊一起變。
 */
const INBOUND = {
  id: 21, order_no: 'IN-20261002-01', status: 'DRAFT', order_date: '2026-10-02', effective_date: '2026-10-02',
  created_at: '2026-10-02T09:36:37.000Z', partner_id: null, partner_name: null, invoice_no: 'INV-1',
  attachments: '[]', item_count: 1, creator_name: 'Rio',
};
const INBOUND_ITEMS = [
  { id: 1, item_id: 7, sn: 'E7ADE593', quantity: 1, brand: 'INTEL', type: 'CPU', model: 'XEON W7-2595X', specification: '', category_name: '硬體', order_source: null, remarks: null },
];
const DN = {
  id: 7, request_no: 'DN-20261002-02', request_type: 'SALE', customer: '凱基證券', location: 'BQIDC 5F',
  shipping_date: '2026-10-02', created_at: '2026-10-02T09:00:00.000Z', status: 'PENDING', item_count: 1,
  creator_name: 'Admin', signed_doc_url: null, signed_doc_name: null,
};
const DN_ITEMS = [
  { id: 1, item_id: 10, brand: 'ARISTA', model: 'DCS-7010TX-48C-F', specification: '', type: 'SWITCH', category_name: '設備', sn: 'HBG254808R4', quantity: 1, location: 'BQIDC 5F' },
];

beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
  window.electronAPI = {
    namedQuery: vi.fn(async (query) => {
      if (query === 'fetchInboundList') return { success: true, rows: [INBOUND] };
      if (query === 'fetchInboundItems') return { success: true, rows: INBOUND_ITEMS };
      if (query === 'fetchDNList') return { success: true, rows: [DN] };
      if (query === 'fetchDNItems') return { success: true, rows: DN_ITEMS };
      return { success: true, rows: [] };
    }),
    runTransaction: vi.fn(),
    saveFile: vi.fn(),
    getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
});

const wrap = (node) => (
  <MemoryRouter>
    <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1 }, setAuthUser: vi.fn() }}>{node}</RoleContext.Provider>
  </MemoryRouter>
);

const openInbound = async () => {
  render(wrap(<InboundList />));
  await screen.findByText(INBOUND.order_no);
  await userEvent.click(screen.getByLabelText('查看進貨明細'));
  await screen.findByText('E7ADE593');
  return document.querySelector('.dm-modal');
};
const openDN = async () => {
  render(wrap(<DNList />));
  const row = (await screen.findByText(DN.request_no)).closest('tr');
  fireEvent.click(within(row).getByTitle('查看詳情'));
  await waitFor(() => expect(screen.getByText('HBG254808R4')).toBeInTheDocument());
  return document.querySelector('.dm-modal');
};

/** 視窗的骨架：各區塊用了哪些共用樣式 */
const skeleton = (modal) => ({
  header: !!modal.querySelector(':scope > .dm-header h2.dm-title'),
  badge: !!modal.querySelector('.dm-title .dm-badge'),
  meta: modal.querySelector('.dm-meta')?.textContent.includes('建立時間'),
  close: modal.querySelector('.dm-header .dm-close')?.textContent,
  summary: modal.querySelectorAll('.dm-body > .dm-summary .dm-summary-item').length,
  table: !!modal.querySelector('.dm-section .dm-items-container table.dm-items-table'),
  sectionTitle: !!modal.querySelector('.dm-section-title'),
  block: !!modal.querySelector('.dm-body > .dm-block .dm-block-title'),
  footerButtons: [...modal.querySelectorAll(':scope > .dm-footer > button')].every((b) => b.classList.contains('dm-btn')),
});

describe('進貨單明細與出貨單明細的風格', () => {
  it('兩邊用同一套骨架', async () => {
    const inbound = skeleton(await openInbound());
    document.body.innerHTML = '';
    const dn = skeleton(await openDN());
    expect(inbound).toEqual(dn);
    expect(dn).toEqual({
      header: true, badge: true, meta: true, close: '✕ 關閉', summary: 3,
      table: true, sectionTitle: true, block: true, footerButtons: true,
    });
  });

  it('進貨單明細：標題、狀態、資訊列', async () => {
    await openInbound();
    expect(screen.getByRole('heading', { level: 2, name: /進貨單明細：IN-20261002-01/ })).toBeInTheDocument();
    expect(screen.getByTestId('inbound-draft-badge')).toHaveTextContent('待確認・尚未入庫');
    const summary = screen.getByTestId('inbound-summary');
    expect(summary).toHaveTextContent('供應商:待補填');
    expect(summary).toHaveTextContent('進貨日期:2026-10-02');
    expect(summary).toHaveTextContent('發票號碼:INV-1');
    expect(screen.getByTestId('inbound-attachments')).toHaveTextContent('無附件');
  });

  it('出貨單明細：標題改成「出貨單明細：單號」並帶狀態', async () => {
    await openDN();
    expect(screen.getByRole('heading', { level: 2, name: /出貨單明細：DN-20261002-02/ })).toBeInTheDocument();
    expect(screen.getByTestId('dn-status-badge')).toHaveTextContent('待確認・尚未出貨');
  });

  it('兩邊都用右上角「✕ 關閉」關掉視窗', async () => {
    await openDN();
    await userEvent.click(screen.getByRole('button', { name: '✕ 關閉' }));
    expect(document.querySelector('.dm-modal')).toBeNull();
  });
});
