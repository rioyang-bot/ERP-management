import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ItemLedgerModal from '../components/ItemLedgerModal';
import { queries } from '../../database/queries';

/**
 * 品項履歷要看得到入庫之後發生的事
 *
 * 設備 BC025722 走過「維修單取回 → 送修原廠 → 原廠 RMA 一換一換出報廢」，
 * 四筆事件 system_audit_logs 都記著，但履歷只顯示一筆批次匯入 ——
 * fetchItemFlowHistory 只查進貨、批次匯入與出貨三種來源，稽核紀錄沒人去讀。
 */
const ROWS = [
  {
    transaction_type: 'BATCH_IMPORT', transaction_date: '2026-05-05', order_no: 'qrt.xlsx',
    partner_name: '元大 郭沛晴', quantity: 1, sn: 'BC025722', summary: null, created_at: '2026-05-05T00:00:00Z',
  },
  {
    transaction_type: 'REPAIR', transaction_date: '2026-09-18', order_no: 'RMA-20260918-01',
    partner_name: 'Rio', quantity: 1, sn: 'BC025722',
    summary: '建立維修單 [RMA-20260918-01]，自客戶端取回放置在庫檢測', created_at: '2026-09-18T01:00:00Z',
  },
  {
    transaction_type: 'REPAIR', transaction_date: '2026-09-18', order_no: 'RMA-20260918-01',
    partner_name: 'Rio', quantity: 1, sn: 'BC025722',
    summary: '維修單 [RMA-20260918-01] 寄出送修原廠', created_at: '2026-09-18T02:00:00Z',
  },
  {
    transaction_type: 'RMA_REPLACE', transaction_date: '2026-09-18', order_no: '-',
    partner_name: 'Rio', quantity: 1, sn: 'BC025722',
    summary: '原廠 RMA 一換一：舊品 [BC025722] 換出結案報廢，由原廠新品 [X0344311] 承接。',
    created_at: '2026-09-18T03:00:00Z',
  },
  // 同一個主檔的別支序號，開 BC025722 的履歷時不該出現
  {
    transaction_type: 'BATCH_IMPORT', transaction_date: '2026-09-18', order_no: 'qrt.xlsx',
    partner_name: '元大 郭沛晴', quantity: 1, sn: 'X0344311', summary: null, created_at: '2026-09-18T00:00:00Z',
  },
];

describe('品項履歷顯示維修與換機', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn((q) => (q === 'fetchItemFlowHistory'
        ? Promise.resolve({ success: true, rows: ROWS })
        : Promise.resolve({ success: true, rows: [] }))),
    };
  });

  const open = (item) => render(
    <ItemLedgerModal isOpen item={item} onClose={() => {}} />
  );

  const ASSET = { item_master_id: 420, sn: 'BC025722', brand: 'BLACKCORE', model: 'BCHFT-1PC' };

  it('列出這支序號的四筆歷程', async () => {
    open(ASSET);
    await waitFor(() => expect(screen.getByText(/異動歷程 \(4 筆\)/)).toBeInTheDocument());
  });

  it.each([
    ['批次匯入'], ['維修處理'], ['原廠換機'],
  ])('印出「%s」這個類型', async (label) => {
    open(ASSET);
    await waitFor(() => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
  });

  it('說明欄寫得出實際發生什麼事', async () => {
    open(ASSET);
    await waitFor(() => {
      expect(screen.getByText(/自客戶端取回放置在庫檢測/)).toBeInTheDocument();
      expect(screen.getByText(/寄出送修原廠/)).toBeInTheDocument();
      expect(screen.getByText(/換出結案報廢，由原廠新品 \[X0344311\] 承接/)).toBeInTheDocument();
    });
  });

  it('別支序號的紀錄不會混進來', async () => {
    open(ASSET);
    await waitFor(() => expect(screen.getByText(/異動歷程/)).toBeInTheDocument());
    expect(screen.queryByText('X0344311')).not.toBeInTheDocument();
  });

  it('沒指定序號時看得到整個主檔', async () => {
    open({ item_master_id: 420, brand: 'BLACKCORE', model: 'BCHFT-1PC' });
    await waitFor(() => expect(screen.getByText(/異動歷程 \(5 筆\)/)).toBeInTheDocument());
  });
});

/**
 * 型別判斷不能只看 summary 有沒有「RMA」——
 * 維修單號本身就叫 RMA-20260918-01，「建立維修單 [RMA-...]」會被誤判成原廠換機。
 */
describe('履歷查詢的事件分類', () => {
  const sql = queries.fetchItemFlowHistory;

  it('稽核紀錄有併進來', () => {
    expect(sql).toContain('system_audit_logs');
    expect(sql).toContain("l.module IN ('DEVICE', 'HARDWARE', 'ASSET')");
  });

  it('原廠換機比對的是開頭的「原廠 RMA」，不是任何含 RMA 的字串', () => {
    expect(sql).toContain("WHEN l.summary LIKE '原廠 RMA%' THEN 'RMA_REPLACE'");
    expect(sql).not.toContain("l.summary LIKE '%RMA%'");
  });

  it('維修的判斷排在狀態之前，取回入庫那筆才不會被當成單純的回庫', () => {
    const oneLine = sql.replace(/\s+/g, ' ');
    expect(oneLine.indexOf("LIKE '%維修單%' THEN 'REPAIR'"))
      .toBeLessThan(oneLine.indexOf("'newStatus' = 'ACTIVE' THEN 'RETURN_STOCK'"));
  });

  it('靠序號把稽核紀錄接回資產，再用主檔過濾', () => {
    expect(sql).toContain('JOIN assets a ON UPPER(TRIM(a.sn)) = UPPER(TRIM(l.target_id))');
    expect(sql).toContain('WHERE a.item_master_id = $1::integer');
  });

  it('每一段的欄位數一致，UNION 才成立', () => {
    // 六段：進貨、批次匯入、耗材初始庫存、出貨、稽核紀錄（靠序號）、稽核紀錄（靠品項 id）
    const selects = sql.split(/UNION ALL/).length;
    expect(selects).toBe(6);
    // 前四段沒有說明文字，補 NULL 佔位
    expect((sql.match(/NULL::text as summary/g) || []).length).toBe(4);
  });

  /**
   * 耗材沒有序號，進貨數量更正與刪單記的是進貨單號 ——
   * 靠序號回接的那一段接不到它們，得靠 details.itemMasterId。
   */
  it('另有一段以品項 id 對回，沒有序號的品項才看得到自己的異動', () => {
    expect(sql).toContain("l.details->>'itemMasterId' = $1::text");
    expect(sql).toContain('LAB_TRANSFER');
  });

  it('品項 id 用文字比對，不做型別轉換', () => {
    // details 是使用者資料，裡面可能是任何東西。
    // 轉型會讓整張履歷查詢在遇到一筆爛資料時直接失敗。
    expect(sql).not.toContain("(l.details->>'itemMasterId')::integer");
  });
});
