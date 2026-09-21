import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeliveryReceiptPrintModal from '../components/DeliveryReceiptPrintModal';
import { toReceiptItems } from '../utils/deliveryReceiptItems';

/**
 * 建立出貨單後自動彈出的交貨簽收單，數量要正確
 *
 * 出貨單有兩種品項形狀：建單畫面上的暫存清單數量欄是 qty，
 * 資料庫讀回來的是 quantity。簽收單讀的是後者。
 * 先前建單後直接把畫面上的清單交過去，quantity 是 undefined，
 * 每一列就退回預設值 1 —— 關掉再從出貨單列表開一次才會正確，
 * 因為那時是從資料庫讀的。
 */
const DN = {
  id: 1, request_no: 'DN-20260918-01', customer: '元大Yuanta',
  contact_info: '', location: '台北', shipping_date: '2026-09-18',
  project_name: '', creator_name: 'Rio',
};

/** 建單畫面上的暫存品項：數量放在 qty */
const DRAFT_ITEM = {
  tempId: 'tmp-1', item_id: 55, brand: 'DELL', model: 'R760',
  specification: '', category_name: '耗材', sn: '', qty: 2,
};

describe('交貨簽收單的數量', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      namedQuery: vi.fn().mockResolvedValue({ success: true, rows: [] }),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
      saveFile: vi.fn(),
    };
  });

  const renderReceipt = (items) => render(
    <DeliveryReceiptPrintModal isOpen onClose={() => {}} dnData={DN} items={items} />
  );

  /** 取出數量欄（品名、序號之後那一格） */
  const quantityCells = () => [...document.querySelectorAll('td')]
    .map((td) => td.textContent.trim());

  it('直接交畫面上的清單時數量會掉成 1（這正是先前的錯誤）', async () => {
    renderReceipt([DRAFT_ITEM]);
    await screen.findByText(/R760/);

    // qty 沒被讀到，落到預設值
    expect(quantityCells()).toContain('1');
    expect(quantityCells()).not.toContain('2');
  });

  it('轉換之後數量正確', async () => {
    renderReceipt(toReceiptItems([DRAFT_ITEM]));
    await screen.findByText(/R760/);

    expect(quantityCells()).toContain('2');
  });

  it('資料庫讀回來的明細不受影響', async () => {
    const fromDb = { id: 9, item_id: 55, brand: 'DELL', model: 'R760', category_name: '耗材', sn: '', quantity: 5 };
    renderReceipt(toReceiptItems([fromDb]));
    await screen.findByText(/R760/);

    expect(quantityCells()).toContain('5');
  });
});

describe('品項形狀轉換', () => {
  it('把 qty 轉成 quantity', () => {
    expect(toReceiptItems([{ sn: 'A', qty: 3 }])).toEqual([{ sn: 'A', qty: 3, quantity: 3 }]);
  });

  it('已經是 quantity 的就照原樣', () => {
    expect(toReceiptItems([{ sn: 'A', quantity: 4 }])[0].quantity).toBe(4);
  });

  it('兩者都有時以 quantity 為準', () => {
    expect(toReceiptItems([{ quantity: 7, qty: 1 }])[0].quantity).toBe(7);
  });

  it('沒有數量或數量無效時當作 1，不會變成 NaN 或空白', () => {
    expect(toReceiptItems([{ sn: 'A' }])[0].quantity).toBe(1);
    expect(toReceiptItems([{ qty: 0 }])[0].quantity).toBe(1);
    expect(toReceiptItems([{ qty: '' }])[0].quantity).toBe(1);
    expect(toReceiptItems([{ qty: 'abc' }])[0].quantity).toBe(1);
  });

  it('數量是字串時轉成數字，簽收單才加得起來', () => {
    expect(toReceiptItems([{ qty: '2' }])[0].quantity).toBe(2);
  });

  it('沒有品項時回空陣列', () => {
    expect(toReceiptItems(undefined)).toEqual([]);
    expect(toReceiptItems([])).toEqual([]);
  });

  it('其他欄位原樣保留', () => {
    const out = toReceiptItems([DRAFT_ITEM])[0];
    expect(out.model).toBe('R760');
    expect(out.item_id).toBe(55);
    expect(out.category_name).toBe('耗材');
  });
});
