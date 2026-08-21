import React from 'react';
import { useNavigate } from 'react-router-dom';
import Inbound from './Inbound';
import InboundList from './InboundList';
import { Columns } from 'lucide-react';

const InboundSplitView = () => {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)', margin: 0 }}>
          <Columns size={26} color="var(--primary-color)" /> 進貨雙畫面作業 (S/I Split View)
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '6fr 4fr', gap: '24px', flex: 1, minHeight: 0 }}>
        <div style={{ overflowY: 'auto' }}>
          <Inbound isSplitMode={true} />
        </div>
        <div style={{ overflowY: 'auto' }}>
          <InboundList isSplitMode={true} />
        </div>
      </div>
    </div>
  );
};

export default InboundSplitView;
