import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ItemLedgerModal from '../components/ItemLedgerModal';
import { logSnChange } from '../utils/auditLogger';
import { queries } from '../../database/queries';

/**
 * 變更序號要寫進歷程
 *
 * 序號能從三個地方改：設備編輯、硬體編輯、進貨明細單更正。
 * 三邊各寫各的敘述 —— 硬體那邊只寫「編輯硬體詳細資訊」，完全看不出序號被改過；
 * 進貨那邊記在進貨單名下，而品項履歷是用序號接回資產的，那筆永遠不會出現在
 * 該台設備的歷程裡。改為三處共用 logSnChange。
 *
 * 一律記在「新序號」名下：改完之後資產上留著的就是新序號，
 * 記在舊序號底下會接不回任何一筆資產。
 */
describe('logSnChange 寫進去的內容', () => {
  let sent;

  beforeEach(() => {
    vi.clearAllMocks();
    sent = [];
    window.electronAPI = {
      namedQuery: vi.fn((q, params) => {
        sent.push({ q, params });
        return Promise.resolve({ success: true, rows: [{ id: 1 }] });
      }),
    };
  });

  const written = () => sent.find((c) => /audit|log/i.test(c.q));

  it('記在新序號名下，敘述同時帶出舊序號', async () => {
    await logSnChange('DEVICE', 'BC025722', 'BC999', 'BLACKCORE BCHFT-1PC', '設備編輯');
    const call = written();
    expect(call, '應該有寫入稽核紀錄').toBeTruthy();
    const text = JSON.stringify(call.params);
    expect(text).toContain('BC999');
    expect(text).toContain('BC025722');
    expect(text).toContain('序號變更');
  });

  it('帶上 snChanged 旗標供履歷分類，不必比對敘述文字', async () => {
    await logSnChange('HARDWARE', 'OLD-1', 'NEW-1', '硬體');
    const details = JSON.stringify(written().params);
    expect(details).toContain('"snChanged":true');
    expect(details).toContain('"oldSn":"OLD-1"');
    expect(details).toContain('"newSn":"NEW-1"');
  });

  it('原本沒有序號也講得清楚', async () => {
    await logSnChange('DEVICE', '', 'NEW-2', '設備');
    expect(JSON.stringify(written().params)).toContain('無序號');
  });
});

describe('履歷把序號變更分成獨立類型', () => {
  const sql = queries.fetchItemFlowHistory;

  it('以 details.snChanged 判定，排在其他判斷之前', () => {
    const oneLine = sql.replace(/\s+/g, ' ');
    expect(oneLine).toContain("WHEN l.details->>'snChanged' = 'true' THEN 'SN_CHANGE'");
    expect(oneLine.indexOf("'snChanged' = 'true'"))
      .toBeLessThan(oneLine.indexOf("LIKE '原廠 RMA%'"));
  });

  it('舊資料沒有旗標，另外用敘述涵蓋', () => {
    expect(sql).toContain("l.summary LIKE '序號變更%'");
    expect(sql).toContain("l.summary LIKE '%序號由 [%'");
  });
});

describe('履歷上的呈現', () => {
  const ROWS = [
    {
      transaction_type: 'BATCH_IMPORT', transaction_date: '2026-05-05', order_no: 'qrt.xlsx',
      partner_name: '元大', quantity: 1, sn: 'BC999', summary: null, created_at: '2026-05-05T00:00:00Z',
    },
    {
      transaction_type: 'SN_CHANGE', transaction_date: '2026-09-29', order_no: 'IN-20260921-01',
      partner_name: 'Rio', quantity: 1, sn: 'BC999',
      summary: '序號變更：[BC025722] → [BC999]（於進貨明細單 [IN-20260921-01] 更正）',
      created_at: '2026-09-29T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn(() => Promise.resolve({ success: true, rows: ROWS })),
    };
  });

  it('標成「序號變更」，並看得到從哪一支改過來', async () => {
    render(<ItemLedgerModal isOpen onClose={() => {}}
      item={{ item_master_id: 420, sn: 'BC999', brand: 'BLACKCORE', model: 'BCHFT-1PC' }} />);

    await waitFor(() => expect(screen.getByText('序號變更')).toBeInTheDocument());
    expect(screen.getByText(/\[BC025722\] → \[BC999\]/)).toBeInTheDocument();
    expect(screen.getByText(/於進貨明細單/)).toBeInTheDocument();
  });
});
