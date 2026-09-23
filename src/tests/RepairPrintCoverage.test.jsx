import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RepairOrderPrintModal from '../components/RepairOrderPrintModal';
import RepairOrderDetailModal from '../components/RepairOrderDetailModal';

/**
 * 套印單的內容要跟「檢視」一樣齊全
 *
 * 先前套印單少了送修備註、出貨備註、當前狀態、建單備註與供應商 ——
 * 印出來的比畫面上看到的少，得再開一次詳情才補得齊。
 * 兩邊的階段資料改為共用 utils/repairStages，這裡再釘住「印得出來」。
 */
const ORDER = {
  id: 1,
  repair_no: 'RMA-20260918-01',
  status: 'COMPLETED',
  customer_name: '元大證券股份有限公司',
  contact_person: '郭沛晴',
  contact_phone: '02-2718-1234',
  creator_name: 'Rio',
  created_at: '2026-09-18T00:00:00.000Z',
  on_site_date: '2026-09-18',
  on_site_status: '客戶反映 當機無法連線',
  send_oem_date: '2026-09-19',
  send_oem_remarks: '黑貓單號 123456789',
  oem_return_date: '2026-09-20',
  results: 'call Advanced RMA 換機 X0344311',
  completion_date: '2026-09-23',
  completion_remarks: 'X0344311 上架 QRT 取回 BC025722',
  remarks: '派工工程師 林耀群',
  items: [
    { id: 1, type: 'SERVER', brand: 'BLACKCORE', model: 'BCHFT-1PC', specification: '26C / 256G', sn: 'X0344311' },
  ],
};

/** 每一段內容在畫面上都要找得到 */
const CONTENT = [
  ['單號', 'RMA-20260918-01'],
  ['客戶', '元大證券股份有限公司'],
  ['現場狀況／故障描述', '客戶反映 當機無法連線'],
  ['送修備註', '黑貓單號 123456789'],
  ['維修與檢測結果', 'call Advanced RMA 換機 X0344311'],
  ['出貨備註', 'X0344311 上架 QRT 取回 BC025722'],
  ['建單備註', '派工工程師 林耀群'],
  ['現場處理日', '2026-09-18'],
  ['送修原廠日', '2026-09-19'],
  ['原廠返還日', '2026-09-20'],
  ['完工出貨日', '2026-09-23'],
  ['設備序號', 'X0344311'],
  ['設備型號', 'BCHFT-1PC'],
  ['設備規格', '26C / 256G'],
];

describe('套印單的內容不比檢視少', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.print = vi.fn();
    window.electronAPI = { namedQuery: vi.fn().mockResolvedValue({ success: true, rows: [{ id: 1 }] }) };
  });
  afterEach(cleanup);

  const openPrint = (order = ORDER) => render(
    <RepairOrderPrintModal isOpen repairOrder={order} onClose={() => {}} />
  );

  it.each(CONTENT)('套印單印得出 %s', (_name, text) => {
    openPrint();
    expect(screen.getAllByText((_c, el) => el?.textContent === text).length).toBeGreaterThan(0);
  });

  /** 逐項比對：詳情看得到的每一段，套印單都要有 */
  it.each(CONTENT)('%s 在兩邊都看得到', (_name, text) => {
    const matches = () => screen.queryAllByText((_c, el) => el?.textContent === text).length;

    const detail = render(<RepairOrderDetailModal isOpen repairOrder={ORDER} onClose={() => {}} />);
    const inDetail = matches();
    detail.unmount();

    openPrint();
    expect(inDetail, '詳情裡應該看得到').toBeGreaterThan(0);
    expect(matches(), '套印單裡也要看得到').toBeGreaterThan(0);
  });

  it('印出當前狀態與四個階段的標題', () => {
    openPrint();
    expect(screen.getByText('完工結案')).toBeInTheDocument();
    for (const stage of ['現場處理 / 取回', '送修原廠', '原廠返還 / 修復', '客戶完工出貨']) {
      expect(screen.getByText(stage), stage).toBeInTheDocument();
    }
  });

  it('沒有建單備註就不印那一欄', () => {
    openPrint({ ...ORDER, remarks: null });
    expect(screen.queryByText('建單備註')).not.toBeInTheDocument();
  });

  describe('公司內部維修', () => {
    const INTERNAL = {
      ...ORDER,
      is_internal: true,
      customer_name: null,
      contact_person: null,
      contact_phone: null,
      supplier_name: '全何科技股份有限公司',
      on_site_date: null,
      completion_date: null,
      completion_remarks: null,
    };

    it('聯絡人改印供應商', () => {
      openPrint(INTERNAL);
      expect(screen.getByText('送修供應商 (Supplier)')).toBeInTheDocument();
      expect(screen.getByText('全何科技股份有限公司')).toBeInTheDocument();
      expect(screen.queryByText('聯絡人 (Contact)')).not.toBeInTheDocument();
    });

    it('沒有客戶可簽收，最後一格換成入庫確認', () => {
      openPrint(INTERNAL);
      expect(screen.getByText('返還入庫確認 (Warehouse)')).toBeInTheDocument();
      expect(screen.queryByText(/客戶簽收確認/)).not.toBeInTheDocument();
    });

    it('直接送原廠的單，現場那一列標為略過', () => {
      openPrint(INTERNAL);
      expect(screen.getByText('現場處理 / 取回（略過）')).toBeInTheDocument();
    });
  });

  describe('不需送回原廠', () => {
    const IN_HOUSE = { ...ORDER, no_oem_required: true, send_oem_date: null, oem_return_date: null };

    it('單頭標出來，原廠兩段標為不適用', () => {
      openPrint(IN_HOUSE);
      expect(screen.getByText('不需送回原廠')).toBeInTheDocument();
      expect(screen.getByText('不適用 (不需送回原廠)')).toBeInTheDocument();
      expect(screen.getByText('不適用 (由 IT 自行處理)')).toBeInTheDocument();
    });

    it('維修結果跟著印在完工那一列', () => {
      openPrint(IN_HOUSE);
      const row = screen.getByText('自行維修完工出貨').closest('tr');
      expect(row).toHaveTextContent('維修與檢測結果 (Results)');
      expect(row).toHaveTextContent('call Advanced RMA 換機 X0344311');
    });
  });
});
