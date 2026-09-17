import React, { useMemo, useState } from 'react';
import { X, Printer, ClipboardCheck } from 'lucide-react';
import { buildChecklistSheet } from '../utils/checklistSheet';

/**
 * 單一設備的出機檢查表列印
 *
 * 表頭固定包含：類型、廠牌、型號、規格、設備序號、搭載硬體（含 SN）、
 * 主機名稱、客戶名稱、聯絡人、放置位置、備註，之後才是檢查項目。
 *
 * 列印走獨立的 iframe，與交貨簽收單一致 —— 直接 window.print() 會把
 * 整個應用程式的版面也帶進來，印出頂部位移與空白頁。
 */
const DeviceChecklistPrintModal = ({ isOpen, onClose, device, items = [] }) => {
  const [isPrinting, setIsPrinting] = useState(false);

  const sheet = useMemo(() => buildChecklistSheet(device, items), [device, items]);

  const handlePrint = () => {
    setIsPrinting(true);
    try {
      let iframe = document.getElementById('checklist-print-iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'checklist-print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
      }
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(sheet.html);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setIsPrinting(false);
      }, 400);
    } catch (err) {
      console.error('Checklist print error:', err);
      window.print();
      setIsPrinting(false);
    }
  };

  if (!isOpen || !device) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: '16px' }}>
      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '14px', width: '100%', maxWidth: '900px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
            <ClipboardCheck size={20} color="#0891b2" /> 出機檢查表預覽
          </h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#0891b2', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: isPrinting ? 'wait' : 'pointer' }}
            >
              <Printer size={15} /> {isPrinting ? '準備列印...' : '列印 / 另存 PDF'}
            </button>
            <button
              onClick={onClose}
              aria-label="關閉預覽"
              style={{ width: '34px', height: '34px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* 預覽：與列印用的是同一份內容 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px', backgroundColor: '#e5e7eb' }}>
          <div
            style={{ background: '#fff', margin: '0 auto', maxWidth: '760px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}
            dangerouslySetInnerHTML={{ __html: sheet.body }}
          />
        </div>
      </div>
    </div>
  );
};

export default DeviceChecklistPrintModal;
