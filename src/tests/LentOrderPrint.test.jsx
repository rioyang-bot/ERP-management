import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LentOrderPrintModal from '../components/LentOrderPrintModal';

describe('借貨申請單 (Loan Application Form) 列印與預覽模組測試', () => {
  const mockClose = vi.fn();
  const mockPrint = vi.fn();

  const sampleDnData = {
    id: 101,
    request_no: 'DN-20260829-01',
    customer: '富邦綜合證券股份有限公司',
    location: '台北市仁愛路四段 169 號 5 樓',
    contact_info: 'David Chen (0918-600-800)',
    shipping_date: '2026-08-29',
    expected_return_date: '2026-09-05',
    creator_name: 'Elain Lu',
    request_type: 'LEND'
  };

  const sampleItems = [
    {
      brand: 'Supermicro',
      model: 'SYS-1029P-WTR',
      sn: 'SMC20260829001',
      quantity: 1,
      specification: 'Dual Xeon Silver 4210R, 64GB RAM'
    },
    {
      brand: 'Mellanox',
      model: 'MCX512A-ACAT',
      sn: 'MLX99887766',
      quantity: 1,
      specification: 'ConnectX-5 25GbE Dual-Port SFP28'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.print = mockPrint;

    window.electronAPI.namedQuery.mockImplementation((query, params) => {
      if (query === 'fetchCustomers') {
        return Promise.resolve({
          success: true,
          rows: [
            {
              id: 1,
              name: '富邦綜合證券股份有限公司',
              contact_person: 'David Chen',
              phone: '0918-600-800',
              address: '台北市仁愛路四段 169 號 5 樓'
            }
          ]
        });
      }
      return Promise.resolve({ success: true, rows: [] });
    });
  });

  it('應正確呈現借貨申請單標題、客戶資訊、經銷商資訊與品項明細', async () => {
    render(
      <LentOrderPrintModal
        isOpen={true}
        onClose={mockClose}
        dnData={sampleDnData}
        items={sampleItems}
      />
    );

    // 標題
    expect(screen.getByText('借 貨 申 請 單')).toBeInTheDocument();

    // 客戶資訊與申請公司
    await waitFor(() => {
      expect(screen.getAllByText('富邦綜合證券股份有限公司').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('David Chen')).toBeInTheDocument();
      expect(screen.getByText('0918-600-800')).toBeInTheDocument();
      expect(screen.getByText('台北市仁愛路四段 169 號 5 樓')).toBeInTheDocument();
    });

    // 經銷商資訊
    expect(screen.getAllByText((c) => c.includes('METECH GLOBAL CONSULTANT') || c.includes('竣喆國際')).length).toBeGreaterThanOrEqual(1);

    // 品項表格
    expect(screen.getByText('Supermicro SYS-1029P-WTR')).toBeInTheDocument();
    expect(screen.getByText('SMC20260829001')).toBeInTheDocument();
    expect(screen.getByText('Mellanox MCX512A-ACAT')).toBeInTheDocument();
    expect(screen.getByText('MLX99887766')).toBeInTheDocument();
    expect(screen.getAllByText('運作測試').length).toBe(2);

    // 注意事項與簽核
    expect(screen.getByText('*注意事項：')).toBeInTheDocument();
    expect(screen.getByText(/貨品借貨人及其公司須對於 MEtech 所出借之貨品具保管責任/)).toBeInTheDocument();
    expect(screen.getByText('借貨申請人簽名[日期]')).toBeInTheDocument();
    expect(screen.getByText(/不得為發票章或收發章/)).toBeInTheDocument();
    expect(screen.getByText('收貨人簽名[日期]')).toBeInTheDocument();
  });

  it('切換公司版本 (版本 A 澳洲 vs 版本 B 台灣) 時應能動態變更右上角公司資訊', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LentOrderPrintModal
        isOpen={true}
        onClose={mockClose}
        dnData={sampleDnData}
        items={sampleItems}
      />
    );

    // 預設為版本 A (澳洲總部)
    expect(screen.getAllByText((c) => c.includes('METECH GLOBAL CONSULTANT PTY LTD')).length).toBeGreaterThanOrEqual(1);

    // 切換為版本 B
    const presetSelect = container.querySelector('select');
    await user.selectOptions(presetSelect, 'PRESET_B');

    expect(screen.getAllByText((c) => c.includes('竣喆國際有限公司')).length).toBeGreaterThanOrEqual(1);
  });

  it('點選進入即時編輯模式時，應轉換為可自訂之輸入框與文字框', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LentOrderPrintModal
        isOpen={true}
        onClose={mockClose}
        dnData={sampleDnData}
        items={sampleItems}
      />
    );

    const editToggleBtn = screen.getByText('✏️ 進入即時編輯模式');
    await user.click(editToggleBtn);

    expect(screen.getByText('完成並鎖定編輯')).toBeInTheDocument();

    // 應該可看見多個編輯輸入框
    const inputs = container.querySelectorAll('.loan-edit-input');
    expect(inputs.length).toBeGreaterThanOrEqual(5);

    // 編輯注意事項文字框
    const textareas = container.querySelectorAll('.loan-edit-textarea');
    expect(textareas.length).toBeGreaterThanOrEqual(1);
  });

  it('應分別提供「🖨️ 列印單據」與「📥 下載圖檔」獨立按鈕且能正常點擊觸發', async () => {
    const user = userEvent.setup();
    render(
      <LentOrderPrintModal
        isOpen={true}
        onClose={mockClose}
        dnData={sampleDnData}
        items={sampleItems}
      />
    );

    const printBtn = screen.getByText(/列印單據/i);
    const downloadBtn = screen.getByText(/下載圖檔/i);

    expect(printBtn).toBeInTheDocument();
    expect(downloadBtn).toBeInTheDocument();

    // 點擊列印按鈕
    await user.click(printBtn);

    // 點擊下載按鈕
    await user.click(downloadBtn);
  });
});
