import React, { useState, useEffect } from 'react';
import { X, Truck } from 'lucide-react';
import Outbound from '../pages/Outbound';

const OutboundRegistrationModal = ({ isOpen, onClose, onSuccess, editingDn = null }) => {
  const isEditing = !!editingDn;
  const [dnNo, setDnNo] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    // 編輯既有單據時單號就是原本那一張，不需要預覽下一號
    if (isEditing) return;
    const fetchNext = async () => {
      try {
        const dStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const prefix = `DN-${dStr}-`;
        const countRes = await window.electronAPI.namedQuery('countOutboundRequests', [prefix]);
        if (countRes.success && countRes.rows.length > 0) {
          const nextNum = (parseInt(countRes.rows[0].count) || 1).toString().padStart(2, '0');
          setDnNo(`DN-${dStr}-${nextNum}`);
        } else {
          setDnNo(`DN-${dStr}-01`);
        }
      } catch (e) {
        console.error('Fetch next DN no error:', e);
      }
    };
    fetchNext();
  }, [isOpen, isEditing]);

  // 編輯時顯示原單號；新建時顯示預覽出來的下一號
  const shownDnNo = isEditing ? (editingDn.request_no || '') : dnNo;

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(5px)', padding: '20px' }}>
      <div style={{ backgroundColor: 'var(--bg-surface)', width: '100%', maxWidth: '1200px', maxHeight: '92vh', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Modal Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
                <Truck size={22} color="var(--primary-color)" /> {isEditing ? '修改出貨單 (Edit Delivery Note)' : '新增出貨單建檔 (Delivery Note Registration)'}
              </h2>
              {shownDnNo && (
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(37, 99, 235, 0.12)',
                  color: 'var(--primary-color)',
                  fontWeight: 800,
                  fontSize: '13px',
                  border: '1px solid rgba(37, 99, 235, 0.3)'
                }}>
                  單號: {shownDnNo}
                </span>
              )}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>建立新的出貨申請單（一般銷貨），支援設備序號自動導出與耗材選取。</p>
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
          <Outbound
            isSplitMode={true}
            isModalMode={true}
            editingDn={editingDn}
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

export default OutboundRegistrationModal;
