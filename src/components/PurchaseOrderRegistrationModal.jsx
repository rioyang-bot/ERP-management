import React from 'react';
import { X, ShoppingCart } from 'lucide-react';
import Purchasing from '../pages/Purchasing';

const PurchaseOrderRegistrationModal = ({ isOpen, onClose, onSuccess, initOrderNo = null, editMode = false }) => {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(5px)', padding: '20px' }}>
      <div style={{ backgroundColor: 'var(--bg-surface)', width: '100%', maxWidth: '1100px', maxHeight: '92vh', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Modal Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
              <ShoppingCart size={22} color="var(--primary-color)" /> {editMode ? '編輯採購單 (Edit Purchase Order)' : '新增採購單建檔 (Purchase Order Registration)'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>填寫採購單號、供應商與採購品項明細。</p>
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
          <Purchasing
            editMode={true}
            isModalMode={true}
            initOrderNo={initOrderNo}
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

export default PurchaseOrderRegistrationModal;
