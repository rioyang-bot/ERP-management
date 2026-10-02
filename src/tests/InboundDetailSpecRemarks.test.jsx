import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import InboundList from '../pages/InboundList';
import { queries } from '../../database/queries';

/**
 * 進貨明細：類別排最前面，另有規格與備註兩欄
 *
 * 原本規格黏在品項名稱後面、沒有備註。備註存在資產上，
 * 待確認的單還沒有資產，因此先記在明細上，確認進貨時寫進資產；
 * 只有待確認的單能在這裡改，已進貨的到硬體／設備列表改。
 */
const order = (id, no, status) => ({
  id, order_no: no, status, order_date: '2026-10-02', effective_date: '2026-10-02',
  created_at: '2026-10-02T09:00:00.000Z', partner_id: null, partner_name: null, invoice_no: null,
  attachments: '[]', item_count: 2, creator_name: 'Rio',
});
const DRAFT = order(21, 'IN-20261002-01', 'DRAFT');
const DONE = order(11, 'IN-20260921-01', 'COMPLETED');
const ITEMS = [
  { id: 1, item_id: 7, sn: 'E7ADE593', quantity: 1, brand: 'INTEL', type: 'CPU', model: 'XEON W7-2595X', specification: '22C 2.8GHz', category_name: '硬體', order_source: null, remarks: '客戶指定' },
  { id: 2, item_id: 9, sn: null, quantity: 5, brand: 'METECH', type: '光纖線', model: 'LC-LC', specification: '', category_name: '耗材', order_source: null, remarks: null },
];

let calls;
let txSteps;
beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  txSteps = [];
  window.alert = vi.fn();
  vi.spyOn(window, 'confirm').mockImplementation(() => true);
  window.electronAPI = {
    namedQuery: vi.fn(async (query, params) => {
      calls.push({ query, params });
      if (query === 'fetchInboundList') return { success: true, rows: [DRAFT, DONE] };
      if (query === 'fetchInboundItems') return { success: true, rows: ITEMS };
      return { success: true, rows: [] };
    }),
    runTransaction: vi.fn(async (steps) => { txSteps.push(steps); return { success: true, results: {} }; }),
    saveFile: vi.fn(),
    getDashboardStats: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
});

const openDetail = async (history = false) => {
  render(<MemoryRouter><InboundList /></MemoryRouter>);
  await screen.findByText(DRAFT.order_no);
  if (history) fireEvent.click(screen.getByTestId('inbound-tab-history'));
  await userEvent.click(screen.getByLabelText('查看進貨明細'));
  await screen.findByText('E7ADE593');
};
const detailHeaders = () => [...screen.getByText('E7ADE593').closest('table').querySelectorAll('thead th')].map((th) => th.textContent.trim());

describe('進貨明細的欄位', () => {
  it('視窗標題是「進貨單明細」', async () => {
    await openDetail();
    expect(screen.getByRole('heading', { level: 2, name: /進貨單明細：IN-20261002-01/ })).toBeInTheDocument();
    expect(screen.queryByText(/進貨明細單/)).not.toBeInTheDocument();
  });

  it('來源採購單、類別排最前面，廠牌、類型、型號分開，另有規格與備註', async () => {
    await openDetail();
    expect(detailHeaders()).toEqual(['來源採購單', '類別', '廠牌', '類型', '型號', '規格', '硬體序號 (S/N)', '訂單來源', '備註', '數量']);
  });

  it('表頭與內容的欄位數一致', async () => {
    await openDetail();
    const cells = screen.getByText('E7ADE593').closest('tr').querySelectorAll('td');
    expect(cells).toHaveLength(detailHeaders().length);
    expect(cells[1]).toHaveTextContent('硬體');
  });

  /** 合在一起看不出是哪個欄位打錯，分開才好比對 */
  it('廠牌、類型、型號、規格各自一欄', async () => {
    await openDetail();
    expect(screen.getByTestId('inbound-item-brand-1')).toHaveTextContent('INTEL');
    expect(screen.getByTestId('inbound-item-type-1')).toHaveTextContent('CPU');
    expect(screen.getByTestId('inbound-item-model-1')).toHaveTextContent('XEON W7-2595X');
    expect(screen.getByTestId('inbound-item-spec-1')).toHaveTextContent('22C 2.8GHz');
    expect(screen.getByTestId('inbound-item-spec-2')).toHaveTextContent('-');
    expect(screen.queryByText('INTEL XEON W7-2595X')).not.toBeInTheDocument();
  });

  it('沒填的欄位顯示 -', async () => {
    ITEMS[1].type = '';
    try {
      await openDetail();
      expect(screen.getByTestId('inbound-item-type-2')).toHaveTextContent('-');
    } finally {
      ITEMS[1].type = '光纖線';
    }
  });

  it('顯示備註，沒有的顯示 -', async () => {
    await openDetail();
    expect(screen.getByTestId('inbound-item-remarks-1')).toHaveTextContent('客戶指定');
    expect(screen.getByTestId('inbound-item-remarks-2')).toHaveTextContent('-');
  });
});

describe('待確認的單可以改備註', () => {
  it('改好後只更新這一筆明細', async () => {
    await openDetail();
    await userEvent.click(screen.getByLabelText('修改備註 METECH LC-LC'));
    await userEvent.type(screen.getByLabelText('備註內容 METECH LC-LC'), '放 LAB 架上');
    await userEvent.click(screen.getByRole('button', { name: '儲存備註' }));
    await waitFor(() => expect(txSteps).toHaveLength(1));
    expect(txSteps[0]).toEqual([expect.objectContaining({ queryName: 'updateDraftInboundItemRemarks', params: [2, '放 LAB 架上'], expectRows: 1 })]);
    expect(queries.updateDraftInboundItemRemarks).toContain("io.status = 'DRAFT'");
  });

  it('沒有改動就不送出', async () => {
    await openDetail();
    await userEvent.click(screen.getByLabelText('修改備註 INTEL XEON W7-2595X'));
    await userEvent.click(screen.getByRole('button', { name: '儲存備註' }));
    expect(txSteps).toHaveLength(0);
  });

  it('備註還在編輯時不能確認進貨', async () => {
    await openDetail();
    await userEvent.click(screen.getByLabelText('修改備註 METECH LC-LC'));
    await userEvent.click(screen.getByRole('button', { name: /確認進貨/ }));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('未儲存的修改'));
    expect(txSteps).toHaveLength(0);
  });
});

describe('已進貨的單', () => {
  it('備註只顯示、不能改', async () => {
    await openDetail(true);
    expect(screen.getByTestId('inbound-item-remarks-1')).toHaveTextContent('客戶指定');
    expect(screen.queryByLabelText(/修改備註/)).not.toBeInTheDocument();
  });
});

describe('查詢', () => {
  it('明細讀出規格與備註；確認進貨時備註寫進資產', () => {
    expect(queries.fetchInboundItems).toContain('im.specification');
    expect(queries.fetchInboundItems).toContain("CASE WHEN io.status = 'DRAFT' THEN ii.remarks");
    expect(queries.insertInboundAssets).toContain("NULLIF(TRIM(COALESCE($5, '')), '')");
  });
});
