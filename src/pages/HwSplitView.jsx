import React from 'react';
import HwRegistration from './HwRegistration';
import HwList from './HwList';
import { Layers } from 'lucide-react';

const HwSplitView = () => {
  return (
    <div className="split-view-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '32px' }}>
      {/* 雙開模式頂部標題 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)', margin: 0 }}>
            <Layers size={26} color="var(--primary-color)" /> 硬體雙畫面作業 (HW Split View)
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
            上方為硬體建檔作業，下方為硬體資產清單，支援 1920×1080 寬幅流暢檢視與操作。
          </p>
        </div>
      </div>

      {/* 上方：硬體建檔區塊 */}
      <div className="split-section-top">
        <HwRegistration isSplitMode={true} />
      </div>

      {/* 下方：硬體清單區塊 */}
      <div className="split-section-bottom" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
        <HwList isSplitMode={true} />
      </div>
    </div>
  );
};

export default HwSplitView;
