import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InboundList from '../pages/InboundList';

/**
 * 進貨單列表：「查看」是純唯讀，所有修改都在「編輯」
 *
 * 先前兩顆按鈕打開的是幾乎一樣的視窗 —— 查看時明細上的序號、數量、廠牌
 * 鉛筆一樣按得到，只差單頭能不能改，使用者分不清兩者差在哪。
 * 現在查看時不出現任何修改入口（含刪除），確認進貨照舊在查看裡。
 */
const order = (id, no, status) => ({
  id, order_no: no, status, order_date: '2026-10-01', effective_date: '2026-10-01',
  created_at: '2026-10-01T11:19:37.000Z', partner_id: null, partner_name: '元景資訊股份有限公司', invoice_no: null,
  attachments: '[]', item_count: 2, creator_name: 'Rio',
});
const DONE = order(31, 'IN-20261001-02', 'COMPLETED');
const DRAFT = order(32, 'IN-20261005-01', 'DRAFT');
const ITEMS = [
  { id: 1, item_id: 445, sn: '2413N29NVMS0090', quantity: 1, brand: '元景資訊', type: 'SSD STORAGE CAGE', model: 'N-29NVMS', specification: 'NVME', category_name: '硬體', order_source: null, remarks: null },
  { id: 2, item_id: 456, sn: null, quantity: 10, brand: '元景資訊', type: 'SLIMSAS CABLE', model: 'C7 CABLE', specification: '', category_name: '耗材', order_source: null, remarks: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
  window.electronAPI = {
    namedQuery: vi.fn(async (query) => {
      if (query === 'fetchInboundList') return { success: true, rows: [DONE, DRAFT] };
      if (query === 'fetchInboundItems') return { success: true, rows: ITEMS };
      return { success: true, rows: [] };
    }),
    runTransaction: vi.fn(),
    saveFile: vi.fn(),
    getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
});

const open = async ({ history, label }) => {
  render(<MemoryRouter><InboundList /></MemoryRouter>);
  if (history) fireEvent.click(screen.getByTestId('inbound-tab-history'));
  await userEvent.click(await screen.findByLabelText(label));
  await screen.findByText('2413N29NVMS0090');
};

/** 明細視窗裡所有修改入口 */
const editControls = () => ({
  sn: screen.queryAllByLabelText(/^更正序號/).length,
  qty: screen.queryAllByLabelText(/^修改數量/).length,
  brandAll: screen.queryAllByLabelText('一次更正廠牌（全部品項）').length,
  brandOne: screen.queryAllByLabelText(/^更正廠牌 /).length,
  orderSource: screen.queryAllByLabelText('統一填寫訂單來源').length,
  delete: screen.queryAllByRole('button', { name: /刪除進貨單/ }).length,
  save: screen.queryAllByRole('button', { name: /儲存變更/ }).length,
});

describe('已進貨的單', () => {
  it('查看：沒有任何修改入口，也不能刪除', async () => {
    await open({ history: true, label: '查看進貨明細' });
    expect(editControls()).toEqual({ sn: 0, qty: 0, brandAll: 0, brandOne: 0, orderSource: 0, delete: 0, save: 0 });
    // 訂單來源只顯示已填幾筆
    expect(screen.getByText(/訂單來源 已填 0 \/ 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '關閉視窗' })).toBeInTheDocument();
  });

  it('編輯：明細更正、廠牌、訂單來源、刪除、儲存都在這裡', async () => {
    await open({ history: true, label: '編輯進貨單' });
    expect(editControls()).toEqual({ sn: 1, qty: 1, brandAll: 1, brandOne: 2, orderSource: 1, delete: 1, save: 1 });
    expect(screen.getByLabelText('供應商')).toBeInTheDocument();
  });
});

describe('待確認的單', () => {
  it('查看：唯讀，但可以確認進貨', async () => {
    await open({ history: false, label: '查看進貨明細' });
    expect(editControls()).toEqual({ sn: 0, qty: 0, brandAll: 0, brandOne: 0, orderSource: 0, delete: 0, save: 0 });
    expect(screen.queryAllByLabelText(/^修改備註/)).toHaveLength(0);
    expect(screen.getByRole('button', { name: /確認進貨/ })).toBeInTheDocument();
  });

  it('編輯：可以改備註、刪除，沒有確認進貨', async () => {
    await open({ history: false, label: '編輯進貨單' });
    expect(screen.queryAllByLabelText(/^修改備註/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: /刪除進貨單/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /確認進貨/ })).not.toBeInTheDocument();
  });
});
