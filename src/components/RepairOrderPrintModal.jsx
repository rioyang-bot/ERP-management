import React, { useRef } from 'react';
import { getRepairScopeLabel } from '../utils/repairScope';
import { getRepairStageRows } from '../utils/repairStages';
import { X, Printer } from 'lucide-react';

const STATUS_LABEL = {
  ON_SITE_HANDLING: '現場處理',
  SENT_OEM: '送修原廠',
  OEM_RETURNED: '原廠返還',
  COMPLETED: '完工結案',
};

/**
 * 維修單套印
 *
 * 內容以「檢視」的詳情為準：同樣的四個階段、同樣的四段說明，
 * 外加當前狀態與建單備註。先前這張單少了送修備註、出貨備註與狀態，
 * 印出來的比畫面上看到的少，得再開一次詳情才補得齊。
 *
 * 階段資料取自 utils/repairStages，與詳情共用同一份 —— 兩邊才不會再各自漂移。
 * 樣式維持黑白列印取向：不用主題變數（列印時會失真），線條與底色都印得出來。
 */
const RepairOrderPrintModal = ({ isOpen, onClose, repairOrder }) => {
  const printRef = useRef(null);

  if (!isOpen || !repairOrder) return null;

  const handlePrint = () => {
    window.print();
  };

  const items = repairOrder.items || [];
  const stages = getRepairStageRows(repairOrder);
  const isInternal = !!repairOrder.is_internal;

  const LABEL = { fontSize: '11px', color: '#64748b', display: 'block', fontWeight: 700 };
  const CELL = { padding: '8px 10px', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' };

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
              /* 底色預設不印，階段表格靠它分行，因此強制印出來 */
              #repair-print-area * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              #repair-print-area tr { break-inside: avoid; }
            }
          `}</style>

          <div id="repair-print-area">
            {/* 表頭 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0, color: '#0f172a', letterSpacing: '-0.5px' }}>
                  維修單據 (Repair Order / RMA)
                </h1>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>單號: <strong style={{ color: '#0f172a', fontSize: '14px' }}>{repairOrder.repair_no}</strong></span>
                  {/* 當前狀態：詳情上有，套印單先前整個漏掉 */}
                  <span style={{
                    padding: '2px 10px', borderRadius: '999px', border: '1px solid #0f172a',
                    fontSize: '11px', fontWeight: 800, color: '#0f172a',
                  }}>
                    {STATUS_LABEL[repairOrder.status] || repairOrder.status}
                  </span>
                  {repairOrder.no_oem_required && (
                    <span style={{
                      padding: '2px 10px', borderRadius: '999px', border: '1px dashed #64748b',
                      fontSize: '11px', fontWeight: 700, color: '#475569',
                    }}>
                      不需送回原廠
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '12px', color: '#475569' }}>
                <div>建立日期: {repairOrder.created_at ? new Date(repairOrder.created_at).toLocaleDateString('zh-TW') : '-'}</div>
                <div>處理人員: {repairOrder.creator_name || '管理員'}</div>
              </div>
            </div>

            {/* 單據基本資訊 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px', backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div>
                <span style={LABEL}>{isInternal ? '維修對象' : '客戶名稱 (Customer)'}</span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{getRepairScopeLabel(repairOrder)}</span>
              </div>
              <div>
                {/* 內部維修沒有客戶聯絡人，要記的是送去哪一家供應商 */}
                <span style={LABEL}>{isInternal ? '送修供應商 (Supplier)' : '聯絡人 (Contact)'}</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  {isInternal
                    ? (repairOrder.supplier_name || '-')
                    : (repairOrder.contact_person || '-')}
                </span>
                {repairOrder.contact_phone && (
                  <span style={{ fontSize: '12px', color: '#475569', display: 'block', marginTop: '2px' }}>
                    {repairOrder.contact_phone}
                  </span>
                )}
              </div>
              {repairOrder.remarks && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={LABEL}>建單備註</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', whiteSpace: 'pre-wrap' }}>{repairOrder.remarks}</span>
                </div>
              )}
            </div>

            {/* 四階段時程。每一列帶上那一步填的說明 —— 這是先前最缺的部分 */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
                維修時程 (Maint. Timeline)
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, width: '150px' }}>階段 (Stage)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, width: '110px' }}>日期 (Date)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, width: '190px' }}>狀態 (Status)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700 }}>說明 (Details)</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((stage) => (
                    <tr key={stage.key}>
                      <td style={{ ...CELL, fontWeight: 800, color: '#0f172a' }}>{stage.title}</td>
                      <td style={{ ...CELL, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{stage.date || '--'}</td>
                      <td style={{ ...CELL, color: '#475569' }}>{stage.statusDesc}</td>
                      <td style={CELL}>
                        {stage.contents.length === 0 ? (
                          <span style={{ color: '#94a3b8' }}>-</span>
                        ) : stage.contents.map(({ field, label, text }) => (
                          <div key={field} style={{ marginBottom: '4px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', display: 'block' }}>{label}</span>
                            <span style={{ color: '#0f172a', whiteSpace: 'pre-wrap' }}>{text || '-'}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 設備明細清單 */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
                維修設備項目清單 (Device Items - 共 {items.length} 台)
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'center', width: '40px' }}>#</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>類型 (Type)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>廠牌 (Brand)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>型號 (Model)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>規格 (Specification)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>序號 (Serial Number)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ padding: '8px 10px' }}>{it.type || '-'}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 800 }}>{it.brand}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{it.model}</td>
                      <td style={{ padding: '8px 10px', color: '#64748b' }}>{it.specification || '-'}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#2563eb' }}>{it.sn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 簽核區。內部維修沒有客戶可簽收，那一格換成入庫確認 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #cbd5e1' }}>
              {[
                '現場取件簽署 (Engineer)',
                '原廠返還/主管簽核 (Supervisor)',
                isInternal ? '返還入庫確認 (Warehouse)' : '客戶簽收確認 (Customer Signature)',
              ].map((label) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '40px' }}>{label}</div>
                  <div style={{ borderBottom: '1px solid #0f172a', width: '80%', margin: '0 auto' }}></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RepairOrderPrintModal;
