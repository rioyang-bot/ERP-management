import React, { useState } from 'react';
import { FileText } from 'lucide-react';

/**
 * 出機檢查表「匯出 Word」（連照片，見 utils/checklistDocx.js）
 * 出機檢查表視窗與列印預覽共用。
 */
const ChecklistWordButton = ({ device, items = [], disabled = false }) => {
  const [busy, setBusy] = useState(false);
  const off = disabled || busy || !device;

  const handleExport = async () => {
    setBusy(true);
    try {
      // Word 產生器（docx）只在按下時才載入，平常開列表不必多下載一包
      const { exportChecklistDocx } = await import('../utils/checklistDocx');
      const { failed } = await exportChecklistDocx(device, items);
      if (failed.length > 0) {
        alert(`已匯出 Word，但有 ${failed.length} 張照片讀取失敗、沒有放進去：\n${failed.join('\n')}`);
      }
    } catch (err) {
      alert('匯出 Word 失敗：' + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={off}
      title={disabled ? '尚未有任何檢查項目' : '匯出這台設備的出機檢查表（Word，含照片）'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: 'none',
        backgroundColor: off ? 'var(--border-color)' : '#2b579a', color: '#fff', fontWeight: 800, fontSize: '13px',
        cursor: busy ? 'wait' : off ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
      }}
    >
      <FileText size={15} /> {busy ? '匯出中...' : '匯出 Word'}
    </button>
  );
};

export default ChecklistWordButton;
