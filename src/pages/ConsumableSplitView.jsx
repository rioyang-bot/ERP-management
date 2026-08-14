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
        <h2 style={{ fontSize: '24px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', color: '#1e293b', margin: 0 }}>
          <Columns size={26} color="#8b5cf6" /> 耗材雙畫面作業 (Consumables Split View)
        </h2>
        
        <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
          <button onClick={() => navigate('/consumables')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: '#64748b', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
            📝 建檔
          </button>
          <button style={{ padding: '6px 14px', backgroundColor: '#ffffff', color: '#8b5cf6', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '800', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', cursor: 'default' }}>
            ◫ 雙開
          </button>
          <button onClick={() => navigate('/consumable-list')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: '#64748b', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
            📋 清單
          </button>
        </div>
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
