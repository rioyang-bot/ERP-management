import React from 'react';
import { useNavigate } from 'react-router-dom';
import HwRegistration from './HwRegistration';
import HwList from './HwList';
import { Columns } from 'lucide-react';

const HwSplitView = () => {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 雙開模式專屬的上方全域標題列 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)', margin: 0 }}>
          <Columns size={26} color="var(--primary-color)" /> 硬體雙畫面作業 (HW Split View)
        </h2>
      </div>

      {/* 雙視窗容器 */}
      <div style={{ display: 'grid', gridTemplateColumns: '4fr 6fr', gap: '24px', flex: 1, minHeight: 0 }}>
        <div style={{ overflowY: 'auto' }}>
          <HwRegistration isSplitMode={true} />
        </div>
        <div style={{ overflowY: 'auto' }}>
          <HwList isSplitMode={true} />
        </div>
      </div>
    </div>
  );
};

export default HwSplitView;
