import React from 'react';
import Purchasing from './Purchasing';
import ProcurementList from './ProcurementList';
import { Layers } from 'lucide-react';

const ProcurementSplitView = () => {
  return (
    <div className="split-view-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '32px' }}>
      {/* 雙開模式頂部標題 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary-color)', margin: 0 }}>
            <Layers size={26} color="var(--primary-color)" /> 採購雙畫面作業 (P/O Split View)
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
            上方為採購申請單建檔 (P/O Registration)，下方為採購單清單 (P/O List)，支援 1920×1080 寬幅流暢檢視與操作。
          </p>
        </div>
      </div>

      {/* 上方：採購建檔區塊 */}
      <div className="split-section-top">
        <Purchasing isSplitMode={true} />
      </div>

      {/* 下方：採購清單區塊 */}
      <div className="split-section-bottom" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
        <ProcurementList isSplitMode={true} />
      </div>
    </div>
  );
};

export default ProcurementSplitView;
