import React, { useState } from 'react';
import { FileText } from 'lucide-react';

/**
 * MAC Address Information 單獨匯出 Word（見 utils/macDocx.js）
 */
const MacWordButton = ({ mac, disabled = false, label = '匯出 Word' }) => {
  const [busy, setBusy] = useState(false);
  const off = disabled || busy || !mac;

  const handleExport = async () => {
    setBusy(true);
    try {
      // Word 產生器（docx）只在按下時才載入
      const { exportMacDocx } = await import('../utils/macDocx');
      await exportMacDocx(mac);
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
      title="匯出這台設備的 MAC Address Information（Word）"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: 'none',
        backgroundColor: off ? 'var(--border-color)' : '#2b579a', color: '#fff', fontWeight: 800, fontSize: '13px',
        cursor: busy ? 'wait' : off ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
      }}
    >
      <FileText size={15} /> {busy ? '匯出中...' : label}
    </button>
  );
};

export default MacWordButton;
