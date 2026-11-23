import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { ALL_SECTIONS, hasSheetSection } from '../utils/checklistSections';

/**
 * 出機檢查表「匯出 Word」（連照片，見 utils/checklistDocx.js）
 * 出機檢查表視窗與列印預覽共用。
 * mac：需要 MAC 表且勾了「MAC 表」時傳入 { sn, baseMac, mgtLan, mgtIpmi }，最後接一頁 MAC Address Information。
 * sections：勾選要輸出的區塊（utils/checklistSections.js）；檢查表的區塊都沒勾、只有 MAC 表時只匯出 MAC 表。
 */
const ChecklistWordButton = ({ device, items = [], disabled = false, mac = null, sections = ALL_SECTIONS }) => {
  const [busy, setBusy] = useState(false);
  const sheet = hasSheetSection(sections);
  const nothing = !sheet && !mac;
  const off = disabled || busy || !device || nothing;

  const handleExport = async () => {
    setBusy(true);
    try {
      if (!sheet) {
        // 只勾了 MAC 表
        const { exportMacDocx } = await import('../utils/macDocx');
        await exportMacDocx(mac);
        return;
      }
      // Word 產生器（docx）只在按下時才載入，平常開列表不必多下載一包
      const { exportChecklistDocx } = await import('../utils/checklistDocx');
      const { failed } = await exportChecklistDocx(device, items, { mac, sections });
      if (failed.length > 0) {
        alert(`已匯出 Word，但有 ${failed.length} 張照片讀取失敗、沒有放進去：\n${failed.join('\n')}`);
      }
    } catch (err) {
      alert('匯出 Word 失敗：' + err.message);
    } finally {
      setBusy(false);
    }
  };

  let title = '匯出這台設備的出機檢查表（Word，含照片）';
  if (nothing) title = '請先勾選要輸出的內容';
  else if (disabled) title = '尚未有任何檢查項目';

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={off}
      title={title}
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
