import React from 'react';
import { X, ArrowDownToLine } from 'lucide-react';
import Inbound from '../pages/Inbound';

const InboundRegistrationModal = ({ isOpen, onClose, onSuccess }) => {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(5px)', padding: '20px' }}>
      <div style={{ backgroundColor: 'var(--bg-surface)', width: '100%', maxWidth: '1100px', maxHeight: '92vh', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Modal Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
              <ArrowDownToLine size={22} color="var(--primary-color)" /> 新增進貨入庫單 (Stock In Registration)
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>管理並登記從供應商收到的實體物品與物料，入庫並增加庫存量。</p>
          </div>
          <button
            onClick={onClose}
            style={{ width: '36px', height: '36px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <Inbound
            isSplitMode={true}
            isModalMode={true}
            onClose={() => {
              if (onSuccess) onSuccess();
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default InboundRegistrationModal;
