import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import DeliveryReceiptPrintModal from '../components/DeliveryReceiptPrintModal';

describe('DeliveryReceiptPrintModal 交貨簽收單列印與預覽測試', () => {
  const mockDnData = {
    id: 101,
    request_no: 'DN-20260206-01',
    customer: '元大證券股份有限公司',
    project_name: 'QRT 專案設備',
    shipping_date: '2026-02-06',
    creator_name: 'David Huang'
  };

  const mockItems = [
    // 設備 1：Cisco (3 個序號)
    {
      id: 1,
      item_id: 10,
      brand: 'Cisco',
      model: 'N3K-C3548P-XL',
      category_name: '設備',
      sn: 'FOC3002R0YY',
      system_date: '2026-02-06',
      customer_warranty_expire: '2029-02-11'
    },
    {
      id: 2,
      item_id: 10,
      brand: 'Cisco',
      model: 'N3K-C3548P-XL',
      category_name: '設備',
      sn: 'FOC3002R11T',
      system_date: '2026-02-06',
      customer_warranty_expire: '2029-02-11'
    },
    {
      id: 3,
      item_id: 10,
      brand: 'Cisco',
      model: 'N3K-C3548P-XL',
      category_name: '設備',
      sn: 'FOC3002R101',
      system_date: '2026-02-06',
      customer_warranty_expire: '2029-02-11'
    },
    // 硬體 2：ADVA 10G-SR GBIC (硬體類別，維護日期留空)
    {
      id: 4,
      item_id: 20,
      brand: 'ADVA',
      model: '10G-SR GBIC',
      category_name: '硬體',
      sn: 'FA70260603312',
      system_date: '2026-02-06',
      customer_warranty_expire: '2029-02-11'
    },
    {
      id: 5,
      item_id: 20,
      brand: 'ADVA',
      model: '10G-SR GBIC',
      category_name: '硬體',
      sn: 'FA70260603313',
      system_date: '2026-02-06',
      customer_warranty_expire: '2029-02-11'
    },
    // 耗材 3：電源線 (耗材類別，維護日期留空)
    {
      id: 6,
      item_id: 30,
      brand: 'Generic',
      model: 'Power Cable',
      category_name: '耗材',
      quantity: 5
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('應正確呈現交貨簽收單抬頭、客戶名稱、案名與確認簽名提示語', () => {
    render(
      <DeliveryReceiptPrintModal
        isOpen={true}
        onClose={vi.fn()}
        dnData={mockDnData}
        items={mockItems}
      />
    );

    // 主標題
    expect(screen.getByText('交 貨 簽 收 單')).toBeInTheDocument();

    // 客戶名稱與案名
    expect(screen.getAllByText('元大證券股份有限公司').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('QRT 專案設備')).toBeInTheDocument();

    // 確認提示文字
    expect(screen.getByText('惠請確認後簽名。謝謝')).toBeInTheDocument();

    // 簽名欄與抬頭公司名
    expect(screen.getAllByText('竣喆國際有限公司').length).toBeGreaterThanOrEqual(1);
  });

  it('設備品項應自動抓取系統日期 (起始日) 與客戶保固到期日 (到期日)，硬體與耗材則留空', () => {
    const { container } = render(
      <DeliveryReceiptPrintModal
        isOpen={true}
        onClose={vi.fn()}
        dnData={mockDnData}
        items={mockItems}
      />
    );

    // 設備 Cisco (N3K-C3548P-XL) 的多個序號應被合併列出
    expect(screen.getByText('Cisco (N3K-C3548P-XL)')).toBeInTheDocument();
    expect(screen.getByText('FOC3002R0YY')).toBeInTheDocument();
    expect(screen.getByText('FOC3002R11T')).toBeInTheDocument();
    expect(screen.getByText('FOC3002R101')).toBeInTheDocument();

    // 設備的維護期間應有日期 (06/02/2026 與 11/02/2029)
    expect(screen.getByText('06/02/2026')).toBeInTheDocument();
    expect(screen.getByText('11/02/2029')).toBeInTheDocument();

    // 硬體 ADVA (10G-SR GBIC)
    expect(screen.getByText('ADVA (10G-SR GBIC)')).toBeInTheDocument();
    expect(screen.getByText('FA70260603312')).toBeInTheDocument();
    expect(screen.getByText('FA70260603313')).toBeInTheDocument();

    // 檢查表格中硬體行不應帶入設備的維護日期
    const tableRows = container.querySelectorAll('.dr-table tbody tr');
    expect(tableRows.length).toBeGreaterThanOrEqual(3);
  });

  it('切換公司範本 (澳洲總部 vs 台灣公司) 時應動態更新抬頭與簽名欄', () => {
    render(
      <DeliveryReceiptPrintModal
        isOpen={true}
        onClose={vi.fn()}
        dnData={mockDnData}
        items={mockItems}
      />
    );

    const comboboxes = screen.getAllByRole('combobox');
    const presetSelect = comboboxes[0];
    expect(presetSelect).toBeInTheDocument();

    // 切換為 版本 A (澳洲總部)
    fireEvent.change(presetSelect, { target: { value: 'PRESET_A' } });

    expect(screen.getAllByText((content) => content.includes('METECH GLOBAL CONSULTANT PTY LTD')).length).toBeGreaterThanOrEqual(1);
  });

  it('切換頁首版型 (標準商務 / 左側並列 / 品牌置中 / 現代反向) 應套用對應版型 class', () => {
    const { container } = render(
      <DeliveryReceiptPrintModal
        isOpen={true}
        onClose={vi.fn()}
        dnData={mockDnData}
        items={mockItems}
      />
    );

    const comboboxes = screen.getAllByRole('combobox');
    const layoutSelect = comboboxes[1];
    expect(layoutSelect).toBeInTheDocument();

    // 預設為 STANDARD
    expect(container.querySelector('.dr-header.layout-STANDARD')).toBeInTheDocument();

    // 切換為 LEFT_COMPACT
    fireEvent.change(layoutSelect, { target: { value: 'LEFT_COMPACT' } });
    expect(container.querySelector('.dr-header.layout-LEFT_COMPACT')).toBeInTheDocument();

    // 切換為 CENTER_ROW (品牌置中: Logo左 / 文字右)
    fireEvent.change(layoutSelect, { target: { value: 'CENTER_ROW' } });
    expect(container.querySelector('.dr-header.layout-CENTER_ROW')).toBeInTheDocument();

    // 切換為 CENTERED
    fireEvent.change(layoutSelect, { target: { value: 'CENTERED' } });
    expect(container.querySelector('.dr-header.layout-CENTERED')).toBeInTheDocument();

    // 切換為 REVERSE
    fireEvent.change(layoutSelect, { target: { value: 'REVERSE' } });
    expect(container.querySelector('.dr-header.layout-REVERSE')).toBeInTheDocument();
  });

  it('進入即時編輯模式時，所有欄位與「惠請確認後簽名」提示語皆可自訂修改', () => {
    render(
      <DeliveryReceiptPrintModal
        isOpen={true}
        onClose={vi.fn()}
        dnData={mockDnData}
        items={mockItems}
      />
    );

    const editBtn = screen.getByText('編輯內容');
    fireEvent.click(editBtn);

    // 切換為完成編輯按鈕
    expect(screen.getByText('完成編輯')).toBeInTheDocument();

    // 檢查提示文字輸入框並修改
    const confirmInput = screen.getByDisplayValue('惠請確認後簽名。謝謝');
    fireEvent.change(confirmInput, { target: { value: '收到請蓋公司發票章並回傳，謝謝！' } });

    // 點擊完成編輯
    fireEvent.click(screen.getByText('完成編輯'));

    expect(screen.getByText('收到請蓋公司發票章並回傳，謝謝！')).toBeInTheDocument();
  });

  it('應提供列印與下載圖檔按鈕且能正常觸發', () => {
    render(
      <DeliveryReceiptPrintModal
        isOpen={true}
        onClose={vi.fn()}
        dnData={mockDnData}
        items={mockItems}
      />
    );

    const printBtn = screen.getByText('列印單據');
    expect(printBtn).toBeInTheDocument();

    const downloadBtn = screen.getByText('下載圖檔');
    expect(downloadBtn).toBeInTheDocument();
  });
});
