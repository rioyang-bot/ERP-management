import React from 'react';
import { 
  X, FileText, Building2, Calendar, CheckCircle2, Clock, 
  Truck, Wrench, PackageCheck, Printer, ShieldAlert, Cpu
} from 'lucide-react';

const STATUS_CONFIG = {
  ON_SITE_HANDLING: { label: '現場處理 (在庫)', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
  SENT_OEM: { label: '送修原廠 (維修中)', color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' },
  OEM_RETURNED: { label: '原廠返還 (在庫)', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
  COMPLETED: { label: '完工出貨 (出庫)', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' }
};

/**
 * 維修單完整詳細資訊與歷程檢視彈窗
 */
const RepairOrderDetailModal = ({ isOpen, onClose, repairOrder, onOpenAction, onOpenPrint }) => {
  if (!isOpen || !repairOrder) return null;

  const items = repairOrder.items || [];
  const statusInfo = STATUS_CONFIG[repairOrder.status] || { 
    label: repairOrder.status, 
    color: 'var(--text-main)', 
    bg: 'var(--bg-surface-subtle)' 
  };

  // 時間軸階段定義
  const steps = [
    {
      key: 'ON_SITE',
      title: '現場處理 / 取回',
      date: repairOrder.on_site_date,
      statusDesc: repairOrder.on_site_status || '現場取回',
      assetStatus: 'ACTIVE (在庫)',
      icon: <Calendar size={18} />,
      active: true,
      color: '#10b981'
    },
    {
      key: 'SEND_OEM',
      title: '送修原廠',
      date: repairOrder.send_oem_date,
      statusDesc: repairOrder.send_oem_date ? '已送往原廠檢測' : '尚未送修',
      assetStatus: 'REPAIRING (維修中)',
      icon: <Truck size={18} />,
      active: !!repairOrder.send_oem_date || repairOrder.status === 'SENT_OEM' || repairOrder.status === 'OEM_RETURNED' || repairOrder.status === 'COMPLETED',
      color: '#d97706'
    },
    {
      key: 'OEM_RETURN',
      title: '原廠返還 / 修復',
      date: repairOrder.oem_return_date,
      statusDesc: repairOrder.results ? `結果: ${repairOrder.results}` : (repairOrder.oem_return_date ? '已返還在庫' : '原廠處理中'),
      assetStatus: 'ACTIVE (在庫)',
      icon: <Wrench size={18} />,
      active: !!repairOrder.oem_return_date || repairOrder.status === 'OEM_RETURNED' || repairOrder.status === 'COMPLETED',
      color: '#8b5cf6'
    },
    {
      key: 'COMPLETED',
      title: '客戶完工出貨',
      date: repairOrder.completion_date,
      statusDesc: repairOrder.completion_date ? '已交付客戶結案' : '待完工出貨',
      assetStatus: 'SHIPPED (出庫)',
      icon: <PackageCheck size={18} />,
      active: repairOrder.status === 'COMPLETED' || !!repairOrder.completion_date,
      color: '#3b82f6'
    }
  ];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '20px',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '840px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
        border: '1px solid var(--border-color)',
        overflow: 'hidden'
      }}>
        {/* 頂部標題列 */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <FileText size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-main)' }}>
                  {repairOrder.repair_no}
                </h3>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '20px',
                  backgroundColor: statusInfo.bg,
                  color: statusInfo.color,
                  fontWeight: 800,
                  fontSize: '12px'
                }}>
                  {statusInfo.label}
                </span>
              </div>
              <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                維修單詳細資訊與四階段歷程追蹤
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 彈窗內容區 (可滾動) */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* 1. 基本資料卡 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
            backgroundColor: 'var(--bg-surface-subtle)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)'
          }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>客戶名稱 (Customer)</span>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Building2 size={16} color="var(--primary-color)" />
                {repairOrder.customer_name || '未指定客戶'}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>建立日期</span>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
                {repairOrder.created_at ? repairOrder.created_at.slice(0, 10) : repairOrder.on_site_date || '--'}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>建單人員</span>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
                {repairOrder.creator_name || '系統管理員'}
              </div>
            </div>
          </div>

          {/* 2. 四階段流轉進度時間軸 */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={16} color="var(--primary-color)" /> 四階段維修流轉進度
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '12px'
            }}>
              {steps.map((step, idx) => (
                <div
                  key={step.key}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    backgroundColor: step.active ? 'var(--bg-surface)' : 'var(--bg-surface-subtle)',
                    border: step.active ? `2px solid ${step.color}` : '1px dashed var(--border-color)',
                    boxShadow: step.active ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                    opacity: step.active ? 1 : 0.6,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        backgroundColor: step.active ? `${step.color}22` : 'transparent',
                        color: step.color,
                        fontSize: '11px',
                        fontWeight: 800
                      }}>
                        階段 {idx + 1}
                      </span>
                      <div style={{ color: step.color }}>{step.icon}</div>
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>
                      {step.title}
                    </div>

                    <div style={{ fontSize: '12px', fontWeight: 700, color: step.color, marginTop: '4px' }}>
                      {step.date || '未執行'}
                    </div>
                  </div>

                  <div style={{
                    marginTop: '10px',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--border-color)',
                    fontSize: '11px',
                    color: 'var(--text-muted)'
                  }}>
                    連動狀態: <strong style={{ color: 'var(--text-main)' }}>{step.assetStatus}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. 送修資訊與結果明細 (重點整合區塊) */}
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Wrench size={16} color="#ef4444" /> 送修、返還與完工詳細資訊
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px'
            }}>
              {/* 現場處理狀況 */}
              <div style={{ backgroundColor: 'var(--bg-surface-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>現場狀況 / 故障描述</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444', marginTop: '4px' }}>
                  {repairOrder.on_site_status || '無故障描述'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  處理日期：{repairOrder.on_site_date || '--'}
                </div>
              </div>

              {/* 送修原廠 */}
              <div style={{ backgroundColor: 'var(--bg-surface-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>送修原廠日 (Send OEM)</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: repairOrder.send_oem_date ? '#d97706' : 'var(--text-muted)', marginTop: '4px' }}>
                  {repairOrder.send_oem_date || '尚未送修原廠'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  狀態：{repairOrder.send_oem_date ? '原廠處理中 (REPAIRING)' : '現場在庫'}
                </div>
              </div>

              {/* 原廠返還日 */}
              <div style={{ backgroundColor: 'var(--bg-surface-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>原廠返還日 (OEM Return)</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: repairOrder.oem_return_date ? '#8b5cf6' : 'var(--text-muted)', marginTop: '4px' }}>
                  {repairOrder.oem_return_date || '原廠尚未寄回'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  狀態：{repairOrder.oem_return_date ? '已返還在庫 (ACTIVE)' : '--'}
                </div>
              </div>

              {/* 完工出貨日 */}
              <div style={{ backgroundColor: 'var(--bg-surface-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>完工出貨日 (Completion)</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: repairOrder.completion_date ? '#3b82f6' : 'var(--text-muted)', marginTop: '4px' }}>
                  {repairOrder.completion_date || '尚未完工交件'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  狀態：{repairOrder.completion_date ? '已交付客戶 (SHIPPED)' : '--'}
                </div>
              </div>
            </div>

            {/* 維修結果 (Results) 完整文字區 */}
            <div style={{
              backgroundColor: 'rgba(16, 185, 129, 0.05)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              padding: '14px',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#10b981', marginBottom: '6px' }}>
                維修與檢測結果 (Results)
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-main)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                {repairOrder.results || '尚未填寫檢測與維修結果 (待原廠返還時記錄)'}
              </div>
            </div>

            {/* 備註 (Remarks) */}
            {repairOrder.remarks && (
              <div style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-color)',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'var(--text-muted)'
              }}>
                <strong style={{ color: 'var(--text-main)' }}>備註：</strong> {repairOrder.remarks}
              </div>
            )}
          </div>

          {/* 4. 關聯報修設備明細清單 */}
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            padding: '18px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Cpu size={16} color="var(--primary-color)" /> 報修設備與硬體清單 ({items.length} 件)
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>廠牌 (Brand)</th>
                  <th style={{ padding: '8px 12px' }}>型號 (Model)</th>
                  <th style={{ padding: '8px 12px' }}>類型 (Type)</th>
                  <th style={{ padding: '8px 12px' }}>序號 (SN)</th>
                  <th style={{ padding: '8px 12px' }}>規格 (Specification)</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      無設備明細資料
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--primary-color)' }}>{it.brand}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-main)' }}>{it.model}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{it.type || '設備'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: 'var(--bg-surface-subtle)',
                          border: '1px solid var(--border-color)',
                          fontWeight: 800,
                          fontSize: '12px',
                          color: 'var(--text-main)'
                        }}>
                          {it.sn}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                        {it.specification || '--'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>

        {/* 底部按鈕區 */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface-subtle)'
        }}>
          <button
            onClick={() => {
              onClose();
              if (onOpenPrint) onOpenPrint(repairOrder);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-main)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Printer size={15} /> 套印維修單據 (Print RMA)
          </button>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* 流程推進快捷按鈕 */}
            {repairOrder.status === 'ON_SITE_HANDLING' && onOpenAction && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAction(repairOrder, 'SEND_OEM');
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#d97706',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Truck size={15} /> 送修原廠
              </button>
            )}

            {repairOrder.status === 'SENT_OEM' && onOpenAction && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAction(repairOrder, 'OEM_RETURN');
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#8b5cf6',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Wrench size={15} /> 原廠返還
              </button>
            )}

            {repairOrder.status === 'OEM_RETURNED' && onOpenAction && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAction(repairOrder, 'COMPLETE');
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#3b82f6',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <PackageCheck size={15} /> 客戶出貨完工
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              關閉
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RepairOrderDetailModal;
