import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RepairActionModal from '../components/RepairActionModal';
import { queries } from '../../database/queries';

/**
 * 每個階段寫自己的說明欄位
 *
 * 共用一個 remarks 的時候，送修時填的物流單號到完工出貨那一步重打就被蓋掉，
 * 而且 remarks = COALESCE($n, remarks) 讓人連清空都做不到 —— 把輸入框刪光送出，
 * 舊字還在，看起來像沒存到。
 */
const ORDER = {
  id: 7,
  repair_no: 'RMA-20260921-01',
  customer_name: '元大Yuanta',
  status: 'SENT_OEM',
  send_oem_remarks: '黑貓單號 123456789',
  completion_remarks: '已送回客戶機房',
  results: '',
  items: [{ id: 1, sn: 'SRV-001', brand: 'BLACKCORE', model: '3122-TX' }],
};

describe('維修單各階段的說明欄位', () => {
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn((query, params) => {
        calls.push({ query, params });
        return Promise.resolve({ success: true, rows: [{ id: 7 }] });
      }),
      runTransaction: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const open = (actionType, order = ORDER) => render(
    <RepairActionModal
      isOpen
      actionType={actionType}
      repairOrder={order}
      onClose={() => {}}
      onSuccess={() => {}}
    />
  );

  const called = (name) => calls.filter((c) => c.query === name);

  describe('送修原廠', () => {
    it('欄位叫「送修備註」，帶入的是送修那一欄', () => {
      open('SEND_OEM');
      const input = screen.getByLabelText('送修備註 (Remarks)');
      expect(input).toHaveValue('黑貓單號 123456789');
    });

    it('存到 send_oem_remarks，不碰其他階段的欄位', async () => {
      open('SEND_OEM');
      const input = screen.getByLabelText('送修備註 (Remarks)');
      await userEvent.clear(input);
      await userEvent.type(input, '原廠 RMA #98765');
      await userEvent.click(screen.getByRole('button', { name: /確認/ }));

      await waitFor(() => expect(called('updateRepairSendOEM')).toHaveLength(1));
      expect(called('updateRepairSendOEM')[0].params[1]).toBe('原廠 RMA #98765');
      expect(queries.updateRepairSendOEM).toContain('send_oem_remarks');
      expect(queries.updateRepairSendOEM).not.toContain('remarks = COALESCE');
    });
  });

  describe('原廠返還', () => {
    /** 這一階段的內容是「維修與檢測結果」，不該再多一個備註欄 */
    it('沒有備註欄，只有維修結果', () => {
      open('OEM_RETURN');
      expect(screen.queryByLabelText(/備註 \(Remarks\)/)).not.toBeInTheDocument();
      expect(screen.getByText(/維修結果 \/ 檢測說明/)).toBeInTheDocument();
    });

    it('查詢不再寫 remarks', () => {
      expect(queries.updateRepairOEMReturn).not.toContain('remarks');
      expect(queries.updateRepairOEMReturn).toContain('results = $2');
    });
  });

  describe('完工出貨', () => {
    it('欄位叫「出貨備註」，帶入的是出貨那一欄', () => {
      open('COMPLETE');
      expect(screen.getByLabelText('出貨備註 (Remarks)')).toHaveValue('已送回客戶機房');
    });

    it('存到 completion_remarks', async () => {
      open('COMPLETE');
      const input = screen.getByLabelText('出貨備註 (Remarks)');
      await userEvent.clear(input);
      await userEvent.type(input, '客戶簽收人 郭沛晴');
      await userEvent.click(screen.getByRole('button', { name: /確認/ }));

      await waitFor(() => expect(called('updateRepairCompleted')).toHaveLength(1));
      expect(called('updateRepairCompleted')[0].params[1]).toBe('客戶簽收人 郭沛晴');
      expect(queries.updateRepairCompleted).toContain('completion_remarks');
    });
  });

  /**
   * 彈窗開啟時已帶入現值，使用者把內容刪光就是要清空。
   * 舊寫法 COALESCE($n, remarks) 會默默留著舊字。
   */
  it('刪光內容送出就是清空，不會默默留著舊字', () => {
    for (const sql of [queries.updateRepairSendOEM, queries.updateRepairCompleted, queries.updateRepairCompletedInHouse]) {
      expect(sql).toContain("NULLIF(TRIM(COALESCE(");
      expect(sql).not.toMatch(/remarks = COALESCE\(\$\d, (send_oem_|completion_)?remarks\)/);
    }
  });

  it('建單備註是單據層級的，四個階段都不會去動它', () => {
    for (const name of ['updateRepairSendOEM', 'updateRepairOEMReturn', 'updateRepairCompleted', 'updateRepairCompletedInHouse']) {
      expect(queries[name], name).not.toMatch(/^\s*remarks =/m);
    }
    // 只有建單會寫
    expect(queries.createRepairOrder).toContain('remarks');
  });
});
