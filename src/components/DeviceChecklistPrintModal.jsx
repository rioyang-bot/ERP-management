import React, { useMemo, useRef, useState } from 'react';
import { X, Printer, ClipboardCheck } from 'lucide-react';
import { buildChecklistSheet } from '../utils/checklistSheet';

/**
 * 單一設備的出機檢查表列印
 *
 * 表頭固定包含：類型、廠牌、型號、規格、設備序號、搭載硬體（含 SN）、
 * 主機名稱、客戶名稱、聯絡人、放置位置、備註，之後才是檢查項目。
 *
 * 預覽直接把列印用的那份文件放進 iframe 呈現，列印時也印同一個 iframe ——
 * 樣式只存在列印文件裡，先前直接把內容塞進畫面會變成沒有框線的純文字，
 * 看到的與印出來的完全是兩回事。走 iframe 也避免直接 window.print()
 * 把整個應用程式的版面一起帶進去。
 */
const DeviceChecklistPrintModal = ({ isOpen, onClose, device, items = [] }) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const frameRef = useRef(null);

  const sheet = useMemo(() => buildChecklistSheet(device, items), [device, items]);

  const handlePrint = () => {
    setIsPrinting(true);
    try {
      const win = frameRef.current?.contentWindow;
      if (!win) throw new Error('預覽尚未載入完成');
      win.focus();
      win.print();
    } catch (err) {
      console.error('Checklist print error:', err);
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  if (!isOpen || !device) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: '16px' }}>
      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '14px', width: '100%', maxWidth: '900px', height: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
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

        {/* 預覽與列印是同一份文件，看到什麼就印出什麼 */}
        <div style={{ flex: 1, minHeight: 0, padding: '16px', backgroundColor: '#e5e7eb' }}>
          <iframe
            ref={frameRef}
            title="出機檢查表預覽"
            srcDoc={sheet.html}
            style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}
          />
        </div>
      </div>
    </div>
  );
};

export default DeviceChecklistPrintModal;
