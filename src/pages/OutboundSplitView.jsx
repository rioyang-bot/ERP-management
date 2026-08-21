import React from 'react';
import { useNavigate } from 'react-router-dom';
import Outbound from './Outbound';
import DNList from './DNList';
import { Columns } from 'lucide-react';

const OutboundSplitView = () => {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', color: '#1e293b', margin: 0 }}>
          <Columns size={26} color="#8b5cf6" /> 出貨單雙畫面作業 (D/N Split View)
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '6fr 4fr', gap: '24px', flex: 1, minHeight: 0 }}>
        <div style={{ overflowY: 'auto', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <Outbound isSplitMode={true} />
        </div>
        <div style={{ overflowY: 'auto', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <DNList isSplitMode={true} />
        </div>
      </div>
    </div>
  );
};

export default OutboundSplitView;
