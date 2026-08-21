import React from 'react';
import { useNavigate } from 'react-router-dom';
import Consumables from './Consumables';
import ConsumableList from './ConsumableList';
import { Columns } from 'lucide-react';

const ConsumableSplitView = () => {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)', margin: 0 }}>
          <Columns size={26} color="var(--primary-color)" /> 耗材雙畫面作業 (Consumables Split View)
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '4fr 6fr', gap: '24px', flex: 1, minHeight: 0 }}>
        <div style={{ overflowY: 'auto' }}>
          <Consumables isSplitMode={true} />
        </div>
        <div style={{ overflowY: 'auto' }}>
          <ConsumableList isSplitMode={true} />
        </div>
      </div>
    </div>
  );
};

export default ConsumableSplitView;
