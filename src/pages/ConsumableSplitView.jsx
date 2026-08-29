import React from 'react';
import Consumables from './Consumables';
import ConsumableList from './ConsumableList';
import { Layers } from 'lucide-react';

const ConsumableSplitView = () => {
  return (
    <div className="split-view-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '32px' }}>
      {/* 雙開模式頂部標題 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)', margin: 0 }}>
            <Layers size={26} color="var(--primary-color)" /> 耗材雙畫面作業 (Consumables Split View)
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
            上方為耗材主檔與建檔作業，下方為耗材庫存清單，支援 1920×1080 寬幅流暢檢視與操作。
          </p>
        </div>
      </div>

      {/* 上方：耗材建檔區塊 */}
      <div className="split-section-top">
        <Consumables isSplitMode={true} />
      </div>

      {/* 下方：耗材清單區塊 */}
      <div className="split-section-bottom" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
        <ConsumableList isSplitMode={true} />
      </div>
    </div>
  );
};

export default ConsumableSplitView;
