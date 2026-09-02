import React, { useRef } from 'react';
import { X, Printer, Download, Wrench, Building2, Calendar, FileText } from 'lucide-react';

const RepairOrderPrintModal = ({ isOpen, onClose, repairOrder }) => {
  const printRef = useRef(null);

  if (!isOpen || !repairOrder) return null;

  const handlePrint = () => {
    window.print();
  };

  const items = repairOrder.items || [];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'var(--bg-modal-overlay)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        color: '#1e293b',
        borderRadius: '16px',
        width: '95vw',
        maxWidth: '1000px',
        maxHeight: '94vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden'
      }}>
        {/* Modal 標題列 (不列印) */}
        <div className="no-print" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '16px', color: '#0f172a' }}>
            <Printer size={18} color="#2563eb" /> 維修單套印預覽 (Repair Order / RMA)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handlePrint}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Printer size={15} /> 列印 / 儲存 PDF
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#64748b',
                padding: '6px'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 列印內容區 */}
        <div ref={printRef} style={{ padding: '36px 40px', overflowY: 'auto', flex: 1 }}>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              .no-print { display: none !important; }
              #repair-print-area, #repair-print-area * { visibility: visible; }
              #repair-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
            }
          `}</style>

          <div id="repair-print-area">
            {/* 表頭 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0, color: '#0f172a', letterSpacing: '-0.5px' }}>
                  維修單據 (Repair Order / RMA)
                </h1>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  單號: <strong style={{ color: '#0f172a', fontSize: '14px' }}>{repairOrder.repair_no}</strong>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '12px', color: '#475569' }}>
                <div>建立日期: {repairOrder.created_at ? new Date(repairOrder.created_at).toLocaleDateString('zh-TW') : '-'}</div>
                <div>處理人員: {repairOrder.creator_name || '管理員'}</div>
              </div>
            </div>

            {/* 單據基本資訊表格 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px', backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', fontWeight: 700 }}>客戶名稱 (Customer)</span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{repairOrder.customer_name}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', fontWeight: 700 }}>現場處理/取回日期 (On-site handling Date)</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{repairOrder.on_site_date || '-'}</span>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', fontWeight: 700 }}>現場狀況 / 故障描述 (On-site handling status)</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#dc2626' }}>{repairOrder.on_site_status || '-'}</span>
              </div>
            </div>

            {/* 流程日期節點 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>送修原廠日期 (Send OEM Date)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>原廠修復寄回日期 (OEM Return Date)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>完工出貨日期 (Completion Date)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#d97706' }}>{repairOrder.send_oem_date || '--'}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#16a34a' }}>{repairOrder.oem_return_date || '--'}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#2563eb' }}>{repairOrder.completion_date || '--'}</td>
                </tr>
              </tbody>
            </table>

            {/* 維修結果說明 */}
            {repairOrder.results && (
              <div style={{ marginBottom: '24px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '14px 16px', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', color: '#166534', fontWeight: 800, display: 'block', marginBottom: '4px' }}>
                  維修結果 / 檢測說明 (Results)
                </span>
                <span style={{ fontSize: '13px', color: '#15803d', fontWeight: 600 }}>
                  {repairOrder.results}
                </span>
              </div>
            )}

            {/* 設備明細清單 */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
                維修設備項目清單 (Device Items - 共 {items.length} 台)
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'center', width: '40px' }}>#</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>廠牌 (Device)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>類型/型號 (Type/Model)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>序號 (Serial Number)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>規格 (Specification)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 800 }}>{it.brand}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{it.model}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#2563eb' }}>{it.sn}</td>
                      <td style={{ padding: '8px 10px', color: '#64748b' }}>{it.specification || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 簽核區 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #cbd5e1' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '40px' }}>現場取件簽署 (Engineer)</div>
                <div style={{ borderBottom: '1px solid #0f172a', width: '80%', margin: '0 auto' }}></div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '40px' }}>原廠返還/主管簽核 (Supervisor)</div>
                <div style={{ borderBottom: '1px solid #0f172a', width: '80%', margin: '0 auto' }}></div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '40px' }}>客戶簽收確認 (Customer Signature)</div>
                <div style={{ borderBottom: '1px solid #0f172a', width: '80%', margin: '0 auto' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RepairOrderPrintModal;
